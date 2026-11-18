// The files of a record (table attachments, entity_type + entity_id; message and history files are not listed here). One
// panel for both apps (docs/shared-parts.md B5, 2026-11-12): COMPASS's asset documents (app/src/pages/assets/show.tsx,
// `Documents`: type tags with a filter, the type for new files, delete own files or as a moderator, files opened with
// FileLink) merged with NPM's attachments panel (app/src/components/attachmentsPanel.tsx: size, date and uploader per file,
// extra row controls such as NPM's "From (company)"). Changed from both: delete removes the row first and the stored file
// only when the row is gone (NPM removed the file first, so a refused delete left a row without its file), and the delete
// button follows the database rule (own file, or can_moderate_record) instead of a page-specific right.
import { useState, type ReactNode } from "react";
import { App as AntdApp, Button, List as AntList, Popconfirm, Space, Tag, Typography, Upload } from "antd";
import { DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorText, supabaseClient, useGetIdentity, useUserMap, userLabel } from "@rbp/core";
import { formatBytes, formatDateTime } from "@rbp/ui";
import { uploadAttachmentFile } from "./hooks/useSignedUrl";
import { FileLink } from "./fileLink";
import { DocTypeTag, DocumentTypeSelect, useDocTypeLabel, useDocumentTypes } from "./documentType";

export type RecordFile = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by_user_id: string | null;
  created_at: string;
  category_phrase_id: string | null;
  // further columns asked for with `extraColumns`
  [column: string]: unknown;
};

const COLUMNS = "id, storage_path, file_name, mime_type, size_bytes, uploaded_by_user_id, created_at, category_phrase_id";

// A panel without file types: no category, so usePhrases sends no request.
const NO_TYPES = "";

export const recordFilesKey = (entityType: string, entityId: string) => ["record-files", entityType, entityId];

export const RecordFiles = ({
  entityType,
  entityId,
  canEdit = true,
  typeCategory,
  extraColumns,
  rowExtras,
  onChanged,
}: {
  entityType: string;
  entityId: string;
  // upload, set the type, delete (the database still decides)
  canEdit?: boolean;
  // phrase category of the file types; without one there are no types
  typeCategory?: string;
  // more attachments columns to load (a column only one app has, e.g. RADAR's company_id)
  extraColumns?: string[];
  // controls of a row before its delete button; `update` writes columns of that row
  rowExtras?: (file: RecordFile, update: (patch: Record<string, unknown>) => Promise<void>) => ReactNode[];
  // after an upload, a change or a delete (pages that show a count or a photo elsewhere)
  onChanged?: () => void;
}) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const users = useUserMap();
  const queryClient = useQueryClient();
  const key = recordFilesKey(entityType, entityId);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<string | null>(null);
  const { data: knownTypes } = useDocumentTypes(typeCategory ?? NO_TYPES);
  const typeLabel = useDocTypeLabel();
  const { data: files, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("attachments")
        .select([COLUMNS, ...(extraColumns ?? [])].join(", "))
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .is("message_id", null)
        .is("event_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecordFile[];
    },
  });
  // Others' files: whoever moderates the record (the rule of the delete policy).
  const { data: moderates } = useQuery({
    queryKey: ["can-moderate-record", entityType, entityId],
    enabled: canEdit,
    staleTime: 5 * 60_000,
    queryFn: async () => (await supabaseClient.rpc("can_moderate_record", { p_entity_type: entityType, p_entity_id: entityId })).data === true,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    onChanged?.();
  };

  const upload = async (file: File) => {
    try {
      const uploaded = await uploadAttachmentFile(entityType, entityId, file);
      const { error } = await supabaseClient.from("attachments").insert({
        entity_type: entityType,
        entity_id: entityId,
        uploaded_by_user_id: identity?.id,
        category_phrase_id: typeCategory ? uploadType : null,
        ...uploaded,
      });
      if (error) {
        await supabaseClient.storage.from("attachments").remove([uploaded.storage_path]);
        throw error;
      }
      await refresh();
    } catch (e: unknown) {
      message.error(errorText(e));
    }
    return false;
  };

  const update = (file: RecordFile) => async (patch: Record<string, unknown>) => {
    // Shown at once, put back when the database refuses.
    queryClient.setQueryData<RecordFile[]>(key, (prev) => prev?.map((f) => (f.id === file.id ? { ...f, ...patch } : f)));
    const { error } = await supabaseClient.from("attachments").update(patch).eq("id", file.id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  const remove = async (file: RecordFile) => {
    const { error, count } = await supabaseClient.from("attachments").delete({ count: "exact" }).eq("id", file.id);
    if (error || !count) {
      message.error(errorText(error, t("files.deleteFailed")));
      return;
    }
    // The row is gone; a stored file the bucket refuses to remove stays behind, so say so.
    const { error: storageError } = await supabaseClient.storage.from("attachments").remove([file.storage_path]);
    if (storageError) message.warning(errorText(storageError, t("files.storageNotRemoved")));
    await refresh();
  };

  const canDelete = (f: RecordFile) => canEdit && (f.uploaded_by_user_id === identity?.id || !!moderates);
  const shown = typeFilter ? (files ?? []).filter((f) => f.category_phrase_id === typeFilter) : (files ?? []);
  const uploader = (f: RecordFile) => (f.uploaded_by_user_id ? userLabel(users.get(f.uploaded_by_user_id)) : "");

  return (
    <div>
      {typeCategory && files && files.length > 1 && (
        <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
          <Tag.CheckableTag checked={typeFilter === null} onChange={() => setTypeFilter(null)}>{t("files.all")}</Tag.CheckableTag>
          {(knownTypes ?? []).filter((d) => files.some((x) => x.category_phrase_id === d.id)).map((d) => (
            <Tag.CheckableTag key={d.id} checked={typeFilter === d.id} onChange={() => setTypeFilter(typeFilter === d.id ? null : d.id)}>{typeLabel(d)}</Tag.CheckableTag>
          ))}
        </Space>
      )}
      <AntList
        size="small"
        loading={isLoading}
        dataSource={shown}
        locale={{ emptyText: <Typography.Text type="secondary">{t("files.none")}</Typography.Text> }}
        renderItem={(f) => (
          <AntList.Item
            actions={[
              ...(rowExtras ? rowExtras(f, update(f)) : []),
              ...(canDelete(f)
                ? [
                    <Popconfirm key="del" title={t("files.deleteConfirm")} onConfirm={() => remove(f)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={t("files.delete")} />
                    </Popconfirm>,
                  ]
                : []),
            ]}
          >
            <Space direction="vertical" size={0} style={{ minWidth: 0 }}>
              <Space size={8} wrap>
                {typeCategory &&
                  (canEdit ? (
                    <DocumentTypeSelect
                      category={typeCategory}
                      variant="borderless"
                      value={f.category_phrase_id}
                      placeholder={<Tag style={{ marginInlineEnd: 0 }}>{t("files.untagged")}</Tag>}
                      onChange={(v) => void update(f)({ category_phrase_id: v })}
                      style={{ minWidth: 130 }}
                    />
                  ) : (
                    f.category_phrase_id && <DocTypeTag value={f.category_phrase_id} category={typeCategory} />
                  ))}
                <FileLink asButton={false} path={f.storage_path} name={f.file_name} mimeType={f.mime_type} />
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {[f.size_bytes != null ? formatBytes(f.size_bytes) : null, formatDateTime(f.created_at), uploader(f)].filter(Boolean).join(" · ")}
              </Typography.Text>
            </Space>
          </AntList.Item>
        )}
      />
      {canEdit && typeCategory && (
        <DocumentTypeSelect category={typeCategory} value={uploadType} onChange={setUploadType} placeholder={t("files.typeForNew")} style={{ width: "100%", marginTop: 8 }} />
      )}
      {canEdit && (
        <Upload.Dragger multiple showUploadList={false} beforeUpload={upload} style={{ marginTop: 8 }} height={80}>
          <p style={{ margin: 0 }}>
            <InboxOutlined /> {t("files.drop")}
          </p>
        </Upload.Dragger>
      )}
    </div>
  );
};
