// Ported 1:1 from COMPASS (app/src/components/stockItemSelect.tsx).
import { RemoteSelect, type RemoteOption } from "@rbp/ui";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";

const search = async (term: string): Promise<RemoteOption[]> => {
  const like = `%${term.replace(/[%_,()"]/g, " ").trim()}%`;
  const { data } = await supabaseClient
    .from("item_stock_overview")
    .select("item_id, item_number, name")
    .eq("is_active", true)
    .or(`item_number.ilike.${like},name.ilike.${like}`)
    .order("item_number")
    .limit(30);
  return (data ?? []).map((p) => ({ value: p.item_id as string, label: `${p.item_number} · ${p.name}` }));
};

const labels = async (ids: string[]): Promise<RemoteOption[]> => {
  const { data } = await supabaseClient.from("item_stock_overview").select("item_id, item_number, name").in("item_id", ids);
  return (data ?? []).map((p) => ({ value: p.item_id as string, label: `${p.item_number} · ${p.name}` }));
};

// Picks among the items that are kept in stock (the catalogue select would also offer the ones that are not, and booking
// stock for those is refused).
export const StockItemSelect = ({ value, onChange, autoFocus, style }: { value?: string; onChange?: (id: string) => void; autoFocus?: boolean; style?: React.CSSProperties }) => {
  const { t } = useTranslation();
  return <RemoteSelect value={value} onChange={onChange} autoFocus={autoFocus} minChars={1} loadOptions={search} loadLabels={labels} placeholder={t("stock.searchPlaceholder")} style={style} />;
};
