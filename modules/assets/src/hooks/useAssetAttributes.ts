// Ported 1:1 from COMPASS (app/src/hooks/useAssetAttributes.ts).
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { AssetAttribute } from "../lib/assetAttributes";

// All attribute definitions with the asset types that offer them, ordered by name.
export function useAssetAttributes() {
  return useQuery({
    queryKey: ["asset-attributes"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("asset_attributes")
        .select("id, name, data_type, unit, description, asset_type_attributes(asset_type_id)")
        .order("name");
      if (error) throw error;
      return (data ?? []).map(({ asset_type_attributes, ...a }) => ({
        ...a,
        asset_type_ids: ((asset_type_attributes ?? []) as { asset_type_id: string }[]).map((x) => x.asset_type_id),
      })) as AssetAttribute[];
    },
  });
}
