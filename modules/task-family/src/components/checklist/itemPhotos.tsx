// Ported 1:1 from COMPASS (app/src/components/checklist/itemPhotos.tsx).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, Button, Image, Popconfirm, Space, Tag, App as AntdApp, theme as antdTheme } from "antd";
import { CameraOutlined, ClockCircleOutlined, DeleteOutlined, PictureOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { useSignedUrl } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import { shrinkImage } from "@rbp/module-messaging/src/lib/image.ts";
import { pendingPhotos, savePhoto, subscribeOutbox } from "../../offline/checklistOutbox";
import { errorText } from "@rbp/core";

export type ItemPhoto = { id: string; storage_path: string; file_name: string; checklist_item_id: string; uploaded_by_user_id: string | null };

const SIZE = 48;

const Thumb = ({ photo, onDelete, canDelete }: { photo: ItemPhoto; onDelete: () => void; canDelete: boolean }) => {
  const { t } = useTranslation();
  const { data: url } = useSignedUrl(photo.storage_path);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {url ? (
        <Image src={url} width={SIZE} height={SIZE} style={{ objectFit: "cover", borderRadius: 6 }} alt={photo.file_name} />
      ) : (
        <span style={{ width: SIZE, height: SIZE, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(128,128,128,0.15)" }}>
          <PictureOutlined />
        </span>
      )}
      {canDelete && (
        <Popconfirm title={t("checklists.photoDelete")} onConfirm={onDelete}>
          <Button size="small" shape="circle" icon={<DeleteOutlined />} style={{ position: "absolute", top: -6, right: -6 }} aria-label={t("common.delete")} />
        </Popconfirm>
      )}
    </span>
  );
};

// Photos of one checklist item: thumbnails, camera / picker button. Photos taken without reception wait in the
// write queue and show with a clock until they are sent.
export const ItemPhotos = ({ taskId, itemId, photos, disabled, userId, isAdmin, render }: { taskId: string; itemId: string; photos: ItemPhoto[]; disabled: boolean; userId?: string; isAdmin?: boolean; render: (parts: { button: ReactNode; thumbs: ReactNode }) => ReactNode }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<{ key: string; url: string }[]>([]);

  useEffect(() => {
    let urls: string[] = [];
    let alive = true;
    const read = async () => {
      const ops = (await pendingPhotos(taskId)).filter((o) => o.itemId === itemId);
      const next = ops.map((o) => ({ key: o.key, url: URL.createObjectURL(o.blob) }));
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = next.map((n) => n.url);
      if (alive) setQueued(next);
    };
    void read();
    const off = subscribeOutbox(() => void read());
    return () => {
      alive = false;
      off();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [taskId, itemId]);

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await shrinkImage(file);
        const name = file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/jpeg" ? ".jpg" : file.name.match(/\.[^.]+$/)?.[0] ?? "");
        const res = await savePhoto(taskId, itemId, blob, name || "photo.jpg");
        if (res.error) message.error(res.error);
        else if (res.queued) message.info(t("checklists.photoQueued"));
      }
      await queryClient.invalidateQueries({ queryKey: ["checklist-photos", taskId] });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (photo: ItemPhoto) => {
    const { error } = await supabaseClient.from("attachments").delete().eq("id", photo.id);
    if (error) return message.error(errorText(error));
    await supabaseClient.storage.from("attachments").remove([photo.storage_path]);
    await queryClient.invalidateQueries({ queryKey: ["checklist-photos", taskId] });
  };

  const count = photos.length + queued.length;
  // The camera button goes into the item's row, the thumbnails below it.
  const button = disabled ? null : (
    <>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void onPick(e.target.files)} />
      <Badge count={count} size="small" offset={[-4, 4]} color={token.colorTextSecondary}>
        <Button type="text" size="small" icon={<CameraOutlined />} loading={busy} onClick={() => input.current?.click()} title={t("checklists.addPhoto")} aria-label={t("checklists.addPhoto")} style={{ color: count > 0 ? token.colorPrimary : token.colorTextSecondary }} />
      </Badge>
    </>
  );
  const thumbs =
    count === 0 ? null : (
      <Space size={8} wrap style={{ margin: "2px 0 6px 30px" }}>
        <Image.PreviewGroup>
          {photos.map((p) => (
            <Thumb key={p.id} photo={p} canDelete={!disabled && (isAdmin === true || p.uploaded_by_user_id === userId)} onDelete={() => void remove(p)} />
          ))}
        </Image.PreviewGroup>
        {queued.map((q) => (
          <span key={q.key} style={{ position: "relative", display: "inline-block" }}>
            <img src={q.url} width={SIZE} height={SIZE} style={{ objectFit: "cover", borderRadius: 6, opacity: 0.7, display: "block" }} alt="" />
            <Tag icon={<ClockCircleOutlined />} color="warning" style={{ position: "absolute", left: 2, bottom: 2, margin: 0, padding: "0 4px" }} />
          </span>
        ))}
      </Space>
    );
  return <>{render({ button, thumbs })}</>;
};
