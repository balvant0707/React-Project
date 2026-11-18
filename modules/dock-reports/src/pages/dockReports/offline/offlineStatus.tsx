// Ported 1:1 from the NPM tool (app/src/pages/dockReports/offline/offlineStatus.tsx).
import { Alert, Tag, Button, Spin } from "antd";
import { WifiOutlined, DisconnectOutlined, CheckCircleOutlined, SyncOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import type { SyncStatus } from "./types";

// Always-visible connectivity indicator (headerButtons row) - deliberately
// not just an icon: on a tablet in a shipyard with patchy signal, "am I
// actually offline right now" needs to be unambiguous at a glance, not
// something you have to hover to confirm.
export const ConnectivityBadge = ({ online }: { online: boolean }) =>
  online ? (
    <Tag icon={<WifiOutlined />} color="green">
      Online
    </Tag>
  ) : (
    <Tag icon={<DisconnectOutlined />} color="red">
      Offline
    </Tag>
  );

// The detailed sync-status strip, shown only while actively editing (that's
// when the local draft in offline/ is the thing at risk of being lost) -
// see useDockReportDraft.ts. Always rendered as a real banner, not a toast
// that disappears - the whole point is that "offline" and "unsynced
// changes exist" should be impossible to miss or forget about.
export const DraftSyncBanner = ({
  online,
  syncStatus,
  pendingCount,
  lastSyncError,
  onSyncNow,
}: {
  online: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncError: string | null;
  onSyncNow: () => void;
}) => {
  if (!online) {
    return (
      <Alert
        type="warning"
        showIcon
        icon={<DisconnectOutlined />}
        style={{ marginBottom: 16 }}
        message="You're offline"
        description={
          pendingCount > 0
            ? `Working from this device's own saved copy - ${pendingCount} change${pendingCount === 1 ? "" : "s"} will sync automatically the moment you're back online. Nothing is lost by closing this tab or the browser.`
            : "Working from this device's own saved copy. Nothing is lost by closing this tab or the browser - any new changes sync automatically once you're back online."
        }
      />
    );
  }
  if (syncStatus === "error") {
    return (
      <Alert
        type="error"
        showIcon
        icon={<ExclamationCircleOutlined />}
        style={{ marginBottom: 16 }}
        message="Couldn't sync your last changes"
        description={
          <>
            {lastSyncError ?? "Unknown error"} — nothing is lost, it's still saved on this device and will keep retrying automatically.
          </>
        }
        action={
          <Button size="small" onClick={onSyncNow}>
            Retry now
          </Button>
        }
      />
    );
  }
  if (syncStatus === "syncing") {
    return (
      <Alert
        type="info"
        showIcon
        icon={<Spin size="small" indicator={<SyncOutlined spin />} />}
        style={{ marginBottom: 16 }}
        message="Syncing changes..."
      />
    );
  }
  if (syncStatus === "pending" || pendingCount > 0) {
    return (
      <Alert
        type="info"
        showIcon
        icon={<SyncOutlined />}
        style={{ marginBottom: 16 }}
        message={`${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync`}
        action={
          <Button size="small" onClick={onSyncNow}>
            Sync now
          </Button>
        }
      />
    );
  }
  return (
    <Alert
      type="success"
      showIcon
      icon={<CheckCircleOutlined />}
      style={{ marginBottom: 16 }}
      message="All changes saved online"
    />
  );
};
