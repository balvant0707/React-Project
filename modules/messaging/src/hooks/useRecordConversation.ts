import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { EntityType } from "@rbp/core";

// The conversation of a record, null until the first message is written. While there is none, listen for the one
// that somebody else creates (Realtime on conversations, as the activity feed does), otherwise the open chat would
// have nothing to subscribe to and show that first message only after a reload.
export function useRecordConversation(entityType: EntityType, entityId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["record-conversation", entityType, entityId];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await supabaseClient.from("conversations").select("id").eq("kind", "record").eq("anchor_type", entityType).eq("anchor_id", entityId).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });
  const missing = query.isSuccess && !query.data;
  useEffect(() => {
    if (!missing) return;
    const channel = supabaseClient
      .channel(`record-conversation:${entityType}:${entityId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: `anchor_id=eq.${entityId}` }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      void supabaseClient.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, entityType, entityId]);
  return query;
}
