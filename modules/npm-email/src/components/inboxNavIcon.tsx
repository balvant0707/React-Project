// Started as a 1:1 port of the NPM tool (app/src/components/inboxNavIcon.tsx); hand-maintained since 2026-11-12.
// Changed: the sidebar entry is "Mail" (email threads only); unread notes are counted by
// the Messages entry, so the notes check and its realtime listeners on messages / conversation_participants are gone.
import { useCallback, useEffect, useRef, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { Badge } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";

// Sidebar "Mail" icon with the number of unread email threads of mine (rpc my_unread_email_threads; 0 for a user without a
// mailbox). Events only mark that a check is due; one timer runs it, so a burst of events is one request.
export const InboxNavIcon = ({ tab = false }: { tab?: boolean }) => {
  const { data: identity } = useGetIdentity<{ id: string }>();
  // On a phone the bottom tab shows the badge; the drawer's copy stays a plain icon (no second channel and no second polling).
  const isPhone = useIsMobile();
  const active = tab || !isPhone;
  const userId = active ? identity?.id : undefined;
  const [unreadEmails, setUnreadEmails] = useState(0);
  // The sidebar and the phone's bottom tabs both show this icon; a Realtime channel name must be unique per instance.
  const instance = useRef(Math.random().toString(36).slice(2));

  const checkEmails = useCallback(async () => {
    const { data: count } = await supabaseClient.rpc("my_unread_email_threads");
    setUnreadEmails(typeof count === "number" ? count : 0);
  }, []);

  // Realtime alone has a gap (an update landing before the channel is SUBSCRIBED is missed, postgres_changes has no
  // backfill), so focus and a slow poll check again; realtime is the fast path for a mail arriving meanwhile.
  useEffect(() => {
    if (!userId) return;
    void checkEmails();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void checkEmails();
      }, 1000);
    };
    const onFocus = () => void checkEmails();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(onFocus, 60_000);
    const channel = supabaseClient
      .channel(`inbox_unread:${instance.current}:user_id=eq.${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_thread_reads", filter: `user_id=eq.${userId}` }, schedule)
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      supabaseClient.removeChannel(channel);
    };
  }, [userId, checkEmails]);

  return (
    // antd's Menu only adds "ant-menu-item-icon" (the icon's spacing) to a plain AntdIcon; wrapped in a Badge it does not
    // recognise it, so the class is set here.
    <Badge count={unreadEmails > 0 ? unreadEmails : undefined} overflowCount={99} size="small" offset={[-1, 1]} className={tab ? undefined : "ant-menu-item-icon"}>
      <MailOutlined />
    </Badge>
  );
};
