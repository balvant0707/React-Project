import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { notification } from "antd";
import { useTranslation } from "react-i18next";
import { dropForeignSubscription, supabaseClient, useIdentity } from "@rbp/core";
import { notificationTitle } from "./notificationText";

type NotificationRow = {
  id: string;
  type: string;
  params: Record<string, unknown> | null;
  title: string;
  body: string | null;
  link: string | null;
  channels: string[];
  created_at: string;
  read_at: string | null;
};

// A row older than this on arrival is not "new" (e.g. a realtime event for a
// row that merely changed).
const MAX_AGE_MS = 60_000;

// A notification whose target is on screen needs no toast. A conversation has two addresses: the link the database writes
// (/messages/<id>) and the one the Messages page navigates with (/messages?c=<id>).
const isCurrentTarget = (link: string, current: string) => {
  if (link === current) return true;
  const conversation = /^\/messages\/([^/?#]+)/.exec(link)?.[1];
  if (!conversation) return false;
  const here = new URL(current, window.location.origin);
  return here.pathname === "/messages" ? here.searchParams.get("c") === conversation : here.pathname === `/messages/${conversation}`;
};

// Popup for 'toast' notifications arriving while the app is open (~/maintenance_tool/docs/notifications.md); a regrouped row toasts again
// (keyed by id + created_at); none while its own link is on screen.
export const NotificationToaster = () => {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const [api, contextHolder] = notification.useNotification({ placement: "bottomRight", maxCount: 3 });
  const seen = useRef(new Set<string>());
  // Read through a ref so the realtime callback always sees the current page
  // without re-subscribing on every navigation.
  const currentPath = useRef("");
  currentPath.current = location.pathname + location.search;

  // A tapped push notification while the app is open: the service worker asks the open window to go there.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "navigate" || typeof event.data.url !== "string") return;
      const url = new URL(event.data.url, window.location.origin);
      if (url.origin === window.location.origin) navigate(url.pathname + url.search + url.hash);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  // Push on this device belongs to the person signed in.
  useEffect(() => {
    if (identity?.id) void dropForeignSubscription();
  }, [identity?.id]);

  // A tapped push notification while the app is open: the service worker asks the open window to go there.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "navigate" || typeof event.data.url !== "string") return;
      const url = new URL(event.data.url, window.location.origin);
      if (url.origin === window.location.origin) navigate(url.pathname + url.search + url.hash);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  useEffect(() => {
    if (!identity?.id) return;
    const show = (row: NotificationRow) => {
      const key = `${row.id}:${row.created_at}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      if (row.read_at || !row.channels?.includes("toast")) return;
      if (Date.now() - new Date(row.created_at).getTime() > MAX_AGE_MS) return;
      if (row.link && isCurrentTarget(row.link, currentPath.current)) return;
      api.open({
        key,
        message: notificationTitle(t, row),
        description: row.body ?? undefined,
        duration: 6,
        style: { cursor: row.link ? "pointer" : undefined },
        onClick: async () => {
          api.destroy(key);
          await supabaseClient
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", row.id);
          if (row.link) navigate(row.link);
        },
      });
    };
    const channel = supabaseClient
      .channel(`notification_toasts:user_id=eq.${identity.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${identity.id}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          show(payload.new as NotificationRow);
        },
      )
      .subscribe();
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [identity?.id, api, navigate, t]);

  return <>{contextHolder}</>;
};
