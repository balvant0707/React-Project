// Platform: the asset names of COMPASS's useFeedContext (components/feed/useFeedContext.ts: the assets named in the event
// metadata) as the messaging module's name source 'assets' (history sentences of task-family's eventSentences.ts).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { registerFeedNames } from "@rbp/module-messaging/src/feed/useFeedContext.ts";

export const registerAssetFeedNames = () =>
  registerFeedNames("assets", (_entityType, _entityId, events) => {
    const assetIds = useMemo(() => {
      const ids = new Set<string>();
      for (const e of events) {
        for (const key of ["new_parent_asset_id", "new_asset_id"]) if (e.metadata?.[key]) ids.add(e.metadata[key] as string);
      }
      return [...ids].sort();
    }, [events]);
    const { data: assetNames } = useQuery({
      queryKey: ["feed-assets", assetIds],
      enabled: assetIds.length > 0,
      queryFn: async () => {
        const { data: rows } = await supabaseClient.from("assets").select("id, name").in("id", assetIds);
        return Object.fromEntries((rows ?? []).map((r) => [r.id as string, r.name as string])) as Record<string, string>;
      },
    });
    return (id) => assetNames?.[id] ?? "…";
  });
