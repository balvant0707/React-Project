// Ported 1:1 from COMPASS (app/src/pages/items/show.tsx).
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { App as AntdApp, Button, Empty, Image, Popconfirm, Space, Spin, Table, Tabs, Tag, Typography, Upload } from "antd";
import { DeleteOutlined, EditOutlined, StarFilled, StarOutlined, UploadOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetIdentity } from "@rbp/core";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { FieldBar } from "@rbp/module-task-family/src/components/fieldBar.tsx";
import { FileLink } from "@rbp/module-messaging/src/fileLink.tsx";
import { StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { TaskItemStateTag } from "../../components/taskItems";
import { usePermissions } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { useCategoryText, useQuantityText, useUnitText } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { ItemThumb, uploadItemFile } from "@rbp/module-task-family/src/components/itemPhoto.tsx";
import { formatMoney } from "@rbp/module-task-family/src/lib/money.ts";
import type { AssetItem, CatalogueItem, TaskItem } from "@rbp/module-task-family/src/lib/items.ts";
import { formatDate } from "@rbp/ui";
import { ItemFormModal } from "./itemForm";
import { ItemStockTab } from "./itemStock";
import { isImage } from "@rbp/module-messaging/src/lib/image.ts";
import { errorText } from "@rbp/core";
import { usePageTitle } from "@rbp/core";

type Doc = { id: string; storage_path: string; thumbnail_path: string | null; file_name: string; mime_type: string | null; uploaded_by_user_id: string | null };


// Data sheets, drawings and photos of an item: ordinary attachments (entity_type 'items'). Photos show as a gallery;
// one of them is the main photo (items.photo_attachment_id, else the first one).
const ItemDocuments = ({ part, canEdit }: { part: CatalogueItem; canEdit: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { moderates, id: me } = useIdentityInfo();
  const partId = part.id;
  const key = ["item-docs", partId];
  const { data: docs } = useQuery({
    queryKey: key,
    queryFn: async () =>
      ((await supabaseClient.from("attachments").select("id, storage_path, thumbnail_path, file_name, mime_type, uploaded_by_user_id").eq("entity_type", "items").eq("entity_id", partId).order("created_at", { ascending: false })).data ?? []) as Doc[],
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["catalogue-item", partId] }),
      queryClient.invalidateQueries({ queryKey: ["items"] }),
      queryClient.invalidateQueries({ queryKey: ["asset-items"] }),
    ]);
  const upload = async (file: File) => {
    try {
      await uploadItemFile(partId, file);
      await refresh();
    } catch (e: any) {
      message.error(errorText(e));
    }
    return false;
  };
  const remove = async (d: Doc) => {
    const { error } = await supabaseClient.from("attachments").delete().eq("id", d.id);
    if (error) return message.error(errorText(error));
    await supabaseClient.storage.from("attachments").remove([d.storage_path, ...(d.thumbnail_path ? [d.thumbnail_path] : [])]);
    await refresh();
  };
  const makeMain = async (d: Doc) => {
    const { error } = await supabaseClient.from("items").update({ photo_attachment_id: d.id }).eq("id", partId);
    if (error) return message.error(errorText(error));
    await refresh();
  };
  const photos = (docs ?? []).filter(isImage);
  const files = (docs ?? []).filter((d) => !isImage(d));
  const mainId = photos.find((p) => p.storage_path === part.photo_path)?.id;
  const canDelete = (d: Doc) => moderates || d.uploaded_by_user_id === me;
  return (
    <Space direction="vertical" style={{ width: "100%" }} size={16}>
      {canEdit && (
        <Upload beforeUpload={upload} showUploadList={false} multiple>
          <Button icon={<UploadOutlined />}>{t("items.addDocument")}</Button>
        </Upload>
      )}
      {(docs ?? []).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("items.noDocuments")} />}
      {photos.length > 0 && (
        <div>
          <Typography.Text strong>{t("items.photos")}</Typography.Text>
          <Image.PreviewGroup>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
              {photos.map((d) => (
                <div key={d.id} style={{ width: 132 }}>
                  <ItemThumb path={d.thumbnail_path ?? d.storage_path} previewPath={d.storage_path} size={132} preview />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
                    {d.id === mainId ? (
                      <Tag icon={<StarFilled />} color="gold" style={{ marginInlineEnd: 0 }}>{t("items.mainPhoto")}</Tag>
                    ) : canEdit ? (
                      <Button size="small" type="link" icon={<StarOutlined />} style={{ paddingInline: 0 }} onClick={() => void makeMain(d)}>
                        {t("items.makeMainPhoto")}
                      </Button>
                    ) : (
                      <span />
                    )}
                    {canDelete(d) && (
                      <Popconfirm title={t("common.deleteConfirm")} onConfirm={() => remove(d)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t("common.delete")} />
                      </Popconfirm>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Image.PreviewGroup>
        </div>
      )}
      {files.length > 0 && (
        <Space direction="vertical">
          {photos.length > 0 && <Typography.Text strong>{t("items.files")}</Typography.Text>}
          {files.map((d) => (
            <Space key={d.id}>
              <FileLink path={d.storage_path} name={d.file_name} mimeType={d.mime_type} asButton={false} />
              {canDelete(d) && (
                <Popconfirm title={t("common.deleteConfirm")} onConfirm={() => remove(d)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          ))}
        </Space>
      )}
    </Space>
  );
};

const useIdentityInfo = () => {
  const { data: identity } = useGetIdentity<{ id: string }>();
  // Other people's files on an item: holders of items.edit (record_moderator).
  const { has } = usePermissions();
  return { id: identity?.id, moderates: has("items.edit") };
};

export const ItemShow = () => {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const { has } = usePermissions();
  const unit = useUnitText();
  const category = useCategoryText();
  const quantity = useQuantityText();
  const canEdit = has("items.edit");
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);

  const [params, setParams] = useSearchParams();
  const { data: overview, isLoading } = useQuery({
    queryKey: ["catalogue-item", id],
    queryFn: async () => ((await supabaseClient.from("items_overview").select("*").eq("id", id).maybeSingle()).data ?? null) as CatalogueItem | null,
  });
  // The stock settings are columns of items itself (the overview view does not carry them).
  const { data: stockSettings } = useQuery({
    queryKey: ["catalogue-item", id, "stock-settings"],
    queryFn: async () =>
      ((await supabaseClient.from("items").select("stock_managed, minimum_stock, reorder_quantity, default_stock_location_id").eq("id", id).maybeSingle()).data ?? null) as Pick<CatalogueItem, "stock_managed" | "minimum_stock" | "reorder_quantity" | "default_stock_location_id"> | null,
  });
  const part = overview ? { ...overview, ...stockSettings } : null;
  const { data: assets } = useQuery({
    queryKey: ["item-assets", id],
    queryFn: async () => ((await supabaseClient.from("asset_items_overview").select("*").eq("item_id", id).order("asset_path").limit(500)).data ?? []) as AssetItem[],
  });
  const { data: lines } = useQuery({
    queryKey: ["item-tasks", id],
    queryFn: async () => ((await supabaseClient.from("task_items_overview").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(100)).data ?? []) as TaskItem[],
  });

  usePageTitle(part?.name);
  // The edit form saves the stock settings too, so it must not open before they are loaded.
  if (isLoading || (overview && stockSettings === undefined)) return <Spin />;
  if (!part) return <Empty description={t("common.notFound")} />;

  const remove = async () => {
    const { error } = await supabaseClient.from("items").delete().eq("id", part.id);
    if (error) return message.error(error.code === "23503" ? t("items.inUse") : errorText(error));
    navigate("/items");
  };

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link to="/items">{t("items.title")}</Link>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <Space align="center" size={12} wrap>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {part.item_number} · {part.name}
          </Typography.Title>
          {part.is_critical && <Tag color="red" icon={<WarningOutlined />}>{t("items.critical")}</Tag>}
          {!part.is_active && <Tag>{t("items.inactive")}</Tag>}
        </Space>
        {canEdit && (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>
            <Popconfirm title={t("items.deleteConfirm")} onConfirm={remove}>
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {part.photo_path && (
          <ItemThumb path={part.photo_thumbnail_path} previewPath={part.photo_path} size={isMobile ? 120 : 160} radius={8} preview />
        )}
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <FieldBar
        fields={[
          { label: t("items.category"), value: category(part.category_phrase_id) || "—" },
          { label: t("items.manufacturer"), value: part.manufacturer ?? "—" },
          { label: t("items.manufacturerNumber"), value: part.manufacturer_item_number ?? "—" },
          { label: t("items.supplier"), value: part.supplier_name ? <Link to="/items?view=suppliers">{part.supplier_name}</Link> : "—" },
          { label: t("items.unit"), value: unit(part.unit_phrase_id) || "—" },
          { label: t("items.erp.itemNumber"), value: part.erp_item_number ?? "—" },
          { label: t("items.leadTime"), value: part.lead_time_days == null ? "—" : t("items.daysCount", { count: part.lead_time_days }) },
          { label: t("items.unitPrice"), value: part.unit_price == null ? "—" : formatMoney(part.unit_price, i18n.language), hidden: !has("costs.view") },
        ]}
      />
      {part.description && <Typography.Paragraph style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{part.description}</Typography.Paragraph>}
        </div>
      </div>
      <Tabs
        style={{ marginTop: 8 }}
        activeKey={params.get("tab") ?? "assets"}
        onChange={(key) => setParams(key === "assets" ? {} : { tab: key }, { replace: true })}
        items={[
          {
            key: "assets",
            label: `${t("items.installedIn")} (${assets?.length ?? 0})`,
            children: (
              <Table<AssetItem>
                size="small"
                rowKey={(r) => r.asset_id}
                dataSource={assets}
                pagination={{ pageSize: 50, hideOnSinglePage: true }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("items.notInstalled")} /> }}
                columns={[
                  { title: t("fields.asset"), dataIndex: "asset_name", render: (v: string, r) => <Link to={`/assets/${r.asset_id}?tab=parts`}>{v}</Link> },
                  { title: t("items.quantity"), render: (_: unknown, r) => quantity(r.quantity_installed, part.unit_phrase_id) },
                  { title: t("items.position"), dataIndex: "position_note", render: (v: string | null) => v ?? "—" },
                ]}
              />
            ),
          },
          {
            key: "tasks",
            label: t("items.onTasks"),
            children: (
              <Table<TaskItem>
                size="small"
                rowKey="id"
                dataSource={lines}
                scroll={{ x: "max-content" }}
                pagination={{ pageSize: 25, hideOnSinglePage: true }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("items.noTaskLines")} /> }}
                columns={[
                  { title: t("items.task"), render: (_: unknown, r) => (r.task_number ? <Link to={`/tasks/${r.task_id}`}>#{r.task_number} {r.task_title}</Link> : "—") },
                  { title: t("items.quantity"), render: (_: unknown, r) => quantity(r.quantity, part.unit_phrase_id) },
                  { title: t("fields.status"), render: (_: unknown, r) => <TaskItemStateTag line={r} /> },
                  { title: t("items.order"), render: (_: unknown, r) => (r.purchase_task_id ? <Space size={4}><Link to={`/tasks/${r.purchase_task_id}`}>#{r.purchase_task_number}</Link>{r.purchase_task_status && <StatusTag status={r.purchase_task_status} />}</Space> : "—") },
                  { title: t("fields.createdAt"), dataIndex: "created_at", render: (v: string) => formatDate(v) },
                ]}
              />
            ),
          },
          ...(has("stock.view") && part.stock_managed ? [{ key: "stock", label: t("stock.title"), children: <ItemStockTab part={part} /> }] : []),
          { key: "documents", label: t("items.documents"), children: <ItemDocuments part={part} canEdit={canEdit} /> },
        ]}
      />
      <ItemFormModal open={editing} part={part} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
    </div>
  );
};
