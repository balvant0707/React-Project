import { Button, Popover } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";

// Read receipts (~/maintenance_tool/docs/messaging.md "Read receipts"): who has read a conversation up to when (RPC conversation_readers;
// the read markers of others are not readable directly). Loaded with the conversation, not polled: `parentKey` is the
// view's own query key, so refreshing the view (new message, Realtime) refreshes the readers too.
type Reader = { user_id: string; last_read_at: string };

export function useConversationReaders(conversationId: string | null, parentKey: readonly unknown[]) {
  const { data } = useQuery({
    queryKey: [...parentKey, "readers", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data: rows, error } = await supabaseClient.rpc("conversation_readers", { p_conversation_id: conversationId });
      if (error) throw error;
      return (rows ?? []) as Reader[];
    },
  });
  return data ?? [];
}

// Who has seen a message: everybody but its author whose read marker is at or after it.
export const seenByNames = (readers: Reader[], message: { created_at: string; author_user_id: string | null }, nameOf: (id: string) => string) =>
  readers.filter((r) => r.last_read_at >= message.created_at && r.user_id !== message.author_user_id).map((r) => ({ id: r.user_id, name: nameOf(r.user_id) }));

// An eye with the number next to the time of one's own newest message; the names only on a click.
export const SeenBy = ({ readers }: { readers: { id: string; name: string }[] }) => {
  const { t } = useTranslation();
  if (!readers.length) return null;
  return (
    <Popover
      trigger="click"
      title={t("messages.seenBy")}
      content={<div style={{ maxHeight: 240, overflowY: "auto" }}>{readers.map((r) => <div key={r.id}>{r.name}</div>)}</div>}
    >
      <Button type="text" size="small" aria-label={t("messages.seenByCount", { count: readers.length })} style={{ height: 20, padding: "0 4px", fontSize: 11, gap: 2 }} icon={<EyeOutlined style={{ fontSize: 12 }} />}>
        {readers.length}
      </Button>
    </Popover>
  );
};
