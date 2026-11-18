// Ported 1:1 from COMPASS (app/src/components/offlineToggle.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Button, Tooltip } from "antd";
import { CheckCircleFilled, CloudDownloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { isPinned, pinAsset, refreshPinnedAsset, unpinAsset } from "@rbp/module-task-family/src/offline/files.ts";

// The asset's documents plus the photo thumbnails of its spare parts list (so the cards show offline too).
const documentPaths = async (assetId: string) => {
  const [docs, parts] = await Promise.all([
    supabaseClient.from("attachments").select("storage_path").eq("entity_type", "assets").eq("entity_id", assetId).is("message_id", null).is("event_id", null),
    supabaseClient.from("asset_items_overview").select("photo_thumbnail_path").eq("asset_id", assetId).not("photo_thumbnail_path", "is", null),
  ]);
  return [
    ...(docs.data ?? []).map((r) => r.storage_path as string),
    ...new Set((parts.data ?? []).map((r) => r.photo_thumbnail_path as string)),
  ];
};

// "Available offline" on an asset: downloads its documents and spare part photos to the device; the page itself, its tickets and tasks
// are cached because they were just opened (see offline/persistCache.ts).
// `compact`: only the icon (phone header); the state still reads from the tooltip and the colour.
export const OfflineToggle = ({ assetId, compact = false }: { assetId: string; compact?: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [pinned, setPinned] = useState(() => isPinned(assetId));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPinned(isPinned(assetId));
    // New documents since the last visit.
    if (isPinned(assetId) && navigator.onLine) void documentPaths(assetId).then((paths) => refreshPinnedAsset(assetId, paths));
  }, [assetId]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (pinned) {
        await unpinAsset(assetId);
        setPinned(false);
        return;
      }
      if (!navigator.onLine) {
        message.warning(t("offline.needsConnection"));
        return;
      }
      const failed = await pinAsset(assetId, await documentPaths(assetId));
      setPinned(true);
      if (failed > 0) message.warning(t("offline.someFilesFailed", { count: failed }));
      else message.success(t("offline.saved"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip title={t("offline.hint")}>
      <Button loading={busy} icon={pinned ? <CheckCircleFilled style={{ color: "#52c41a" }} /> : <CloudDownloadOutlined />} onClick={toggle} aria-label={pinned ? t("offline.available") : t("offline.makeAvailable")}>
        {compact ? null : pinned ? t("offline.available") : t("offline.makeAvailable")}
      </Button>
    </Tooltip>
  );
};
