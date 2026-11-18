// Ported 1:1 from COMPASS (app/src/components/assetSelect.tsx).
import { RemoteSelect, type RemoteOption } from "@rbp/ui";
import { supabaseClient } from "@rbp/core";
import { useTranslation } from "react-i18next";

// Server-searched asset picker (a plant can have thousands of assets).
async function searchAssetOptions(term: string, parentsOnly = false): Promise<RemoteOption[]> {
  let query = supabaseClient
    .from("assets_overview")
    .select("id, name, ancestor_path_label")
    .ilike("name", `%${term}%`);
  if (parentsOnly) query = query.gt("child_count", 0);
  const { data } = await query.order("name").limit(30);
  return (data ?? []).map((a) => ({
    value: a.id as string,
    label: a.ancestor_path_label ? `${a.name} (${a.ancestor_path_label})` : (a.name as string),
  }));
}

// Only assets that have children: the useful choices for a "below asset" filter.
export const searchParentAssetOptions = (term: string) => searchAssetOptions(term, true);

export async function loadAssetLabels(ids: string[]): Promise<RemoteOption[]> {
  if (!ids.length) return [];
  const { data } = await supabaseClient.from("assets").select("id, name").in("id", ids);
  return (data ?? []).map((a) => ({ value: a.id as string, label: a.name as string }));
}

export const AssetSelect = (props: {
  value?: string;
  onChange?: (value: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}) => {
  const { t } = useTranslation();
  return (
    <RemoteSelect
      minChars={0}
      loadOptions={searchAssetOptions}
      loadLabels={loadAssetLabels}
      placeholder={props.placeholder ?? t("assets.searchPlaceholder")}
      {...props}
    />
  );
};
