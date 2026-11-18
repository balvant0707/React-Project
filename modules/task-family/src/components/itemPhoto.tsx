// Ported 1:1 from COMPASS (app/src/components/itemPhoto.tsx).
import { useEffect, useState } from "react";
import { Image } from "antd";
import { PictureOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { SIGNED_URL_EXPIRES_IN, signedUrlBatcher } from "@rbp/core";
import { getCachedFile } from "../offline/files";
import { shrinkImage } from "@rbp/module-messaging/src/lib/image.ts";
import { uploadAttachmentFile } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";

const BUCKET = "attachments";

// Item photos (~/maintenance_tool/docs/items.md "Photos"): a spare parts list shows dozens of thumbnails at once, signed in batches.
const sign = signedUrlBatcher(BUCKET);

// A displayable URL for a photo: offline (or when signing fails) the copy pinned with "Available offline".
function usePhotoUrl(path: string | null | undefined) {
  const { data: signed, isFetched } = useQuery({
    queryKey: ["signed-url", BUCKET, path],
    enabled: !!path && navigator.onLine,
    staleTime: (SIGNED_URL_EXPIRES_IN - 600) * 1000,
    queryFn: () => sign(path!),
  });
  const [cached, setCached] = useState<string | null>(null);
  const needCache = !!path && (!navigator.onLine || (isFetched && !signed));
  useEffect(() => {
    if (!needCache) return;
    let url: string | null = null;
    let cancelled = false;
    void getCachedFile(path!).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setCached(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setCached(null);
    };
  }, [needCache, path]);
  return signed ?? cached ?? undefined;
}

// A square photo (thumbnail path) or a grey placeholder. `preview` = a click opens the original large.
export const ItemThumb = ({
  path,
  previewPath,
  size = 40,
  preview = false,
  radius = 4,
}: {
  path: string | null | undefined;
  previewPath?: string | null;
  size?: number | string;
  preview?: boolean;
  radius?: number;
}) => {
  const src = usePhotoUrl(path);
  const large = usePhotoUrl(preview ? previewPath ?? path : null);
  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flex: "0 0 auto",
    background: "var(--ant-color-fill-quaternary, rgba(0,0,0,0.04))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };
  if (!path || !src)
    return (
      <div style={box} aria-hidden>
        <PictureOutlined style={{ color: "rgba(127,127,127,0.45)", fontSize: typeof size === "number" ? Math.max(14, size / 3) : 32 }} />
      </div>
    );
  return (
    <div style={box} onClick={preview ? (e) => e.stopPropagation() : undefined}>
      <Image
        src={src}
        alt=""
        width="100%"
        height="100%"
        style={{ objectFit: "cover", width: "100%", height: "100%" }}
        preview={preview && large ? { src: large } : false}
      />
    </div>
  );
};

const THUMB_SIDE = 320;

// Uploads an item document. Images are shrunk to 1600 px and get a thumbnail next to them (attachments.thumbnail_path),
// so lists load a few KB instead of the original.
export async function uploadItemFile(itemId: string, file: File) {
  const isImage = file.type.startsWith("image/") && file.type !== "image/svg+xml";
  const body = isImage ? await shrinkImage(file) : file;
  const original = body === file ? file : new File([body], file.name.replace(/\.\w+$/, "") + ".jpg", { type: body.type || "image/jpeg" });
  const uploaded = await uploadAttachmentFile("items", itemId, original);
  let thumbnail_path: string | null = null;
  if (isImage) {
    const small = await shrinkImage(file, THUMB_SIDE, 0.75);
    if (small !== file && small.size < original.size) {
      const thumb = await uploadAttachmentFile("items", itemId, new File([small], "thumb.jpg", { type: "image/jpeg" })).catch(() => null);
      thumbnail_path = thumb?.storage_path ?? null;
    }
  }
  const { error } = await supabaseClient.from("attachments").insert({ entity_type: "items", entity_id: itemId, ...uploaded, file_name: file.name, thumbnail_path });
  if (error) throw error;
}
