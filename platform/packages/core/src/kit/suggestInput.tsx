// A text field that learns: it suggests the values already stored in a column (e.g. users.site), so the same place is
// typed the same way without a lookup list to maintain. New values become suggestions once saved.
import { useMemo } from "react";
import { AutoComplete } from "antd";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "../supabase";

export const SuggestInput = ({ table, column, value, onChange, disabled, placeholder }: {
  table: string; column: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string;
}) => {
  const { data: known } = useQuery({
    queryKey: ["suggest-input", table, column],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabaseClient.from(table).select(column).not(column, "is", null).limit(1000);
      const values = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => String(r[column] ?? "").trim()).filter(Boolean);
      return [...new Set(values)].sort((a, b) => a.localeCompare(b));
    },
  });
  const options = useMemo(() => {
    const typed = value.trim().toLowerCase();
    return (known ?? []).filter((v) => v.toLowerCase().includes(typed) && v.toLowerCase() !== typed).map((v) => ({ value: v }));
  }, [known, value]);
  return <AutoComplete value={value} onChange={(v) => onChange(v ?? "")} options={options} disabled={disabled} placeholder={placeholder} allowClear style={{ width: "100%" }} />;
};
