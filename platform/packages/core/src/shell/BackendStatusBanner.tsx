// Copied from COMPASS app/src/components/backendStatusBanner.tsx (NPM's is the same without the queued count). Changes: the
// queued count is the core useOutboxCount over the registered module outboxes (none in RADAR).
import { useSyncExternalStore } from "react";
import { Alert } from "antd";
import { useTranslation } from "react-i18next";
import { getBackendUnreachable, subscribeBackendReachability, useOutboxCount } from "../queryClient";

function subscribeOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Two signals feed one banner: navigator.onLine (the device has a network) and the global QueryCache/MutationCache
// callbacks in ../queryClient.ts (real request outcomes, so an unreachable backend shows too).
// Sits right under the (sticky) header, inside the content column, so it never covers the sidebar logo.
export function BackendStatusBanner({ top = 56 }: { top?: number }) {
  const { t } = useTranslation();
  const online = useSyncExternalStore(subscribeOnlineStatus, () => navigator.onLine);
  const backendUnreachable = useSyncExternalStore(subscribeBackendReachability, getBackendUnreachable);

  const queued = useOutboxCount();

  if (online && !backendUnreachable) {
    if (queued === 0) return null;
    return <Alert banner type="info" showIcon message={t("offline.sendingQueued", { count: queued })} style={{ position: "sticky", top, zIndex: 9 }} />;
  }

  return (
    <Alert
      banner
      type={online ? "warning" : "error"}
      showIcon
      message={
        (online ? t("offline.serverTrouble") : t("offline.banner")) + (queued > 0 ? " " + t("offline.queuedCount", { count: queued }) : "")
      }
      style={{ position: "sticky", top, zIndex: 9 }}
    />
  );
}
