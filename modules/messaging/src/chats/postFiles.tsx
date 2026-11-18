import { useState } from "react";
import { Image, Spin, theme as antdTheme } from "antd";
import { PictureOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { FileLink } from "../fileLink";
import { useSignedUrls } from "../hooks/useSignedUrl";
import type { PostFile } from "../lib/messaging";
import { isImage } from "../lib/image";

// The pictures of a post as one hero image across the top of the card (the first picture; "+N" when there are more).
// A tap opens all of them full screen, to swipe through.
export const PostHero = ({ files, tall = false }: { files: PostFile[]; tall?: boolean }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const pictures = files.filter(isImage);
  const urls = useSignedUrls(pictures.map((f) => f.storage_path));
  const [preview, setPreview] = useState<number | null>(null);
  if (!pictures.length) return null;
  const more = pictures.length - 1;
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={t("messages.showPictures", { count: pictures.length })}
        onClick={() => setPreview(0)}
        onKeyDown={(e) => e.key === "Enter" && setPreview(0)}
        style={{
          position: "relative",
          aspectRatio: "16 / 9",
          maxHeight: tall ? 420 : 320,
          width: "100%",
          overflow: "hidden",
          cursor: "zoom-in",
          background: token.colorFillTertiary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {urls[0] ? (
          <img src={urls[0]} alt={pictures[0].file_name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <Spin size="small" />
        )}
        {more > 0 && (
          <span
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(0, 0, 0, 0.6)",
              color: "#fff",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <PictureOutlined /> +{more}
          </span>
        )}
      </div>
      <Image.PreviewGroup
        items={urls.map((src) => src ?? "")}
        preview={{ visible: preview !== null, current: preview ?? 0, onChange: setPreview, onVisibleChange: (v) => !v && setPreview(null) }}
      />
    </>
  );
};

// The other files (not pictures) as links below the text.
export const PostFiles = ({ files }: { files: PostFile[] }) => {
  const others = files.filter((f) => !isImage(f));
  if (!others.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
      {others.map((f) => (
        <FileLink key={f.id} path={f.storage_path} name={f.file_name} mimeType={f.mime_type} />
      ))}
    </div>
  );
};
