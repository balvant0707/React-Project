// Ported 1:1 from COMPASS (app/src/components/assetAttributeInput.tsx).
import { useEffect, useState } from "react";
import { AutoComplete, DatePicker, Input, InputNumber, Select } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import type { AssetAttribute, AttributeValue } from "../lib/assetAttributes";

// One input per attribute data type. The value is what asset_save_attribute_values takes: a string
// (text, list, date as YYYY-MM-DD), a number or a boolean; null/"" means empty.
export const AssetAttributeInput = ({
  attribute,
  value,
  onChange,
}: {
  attribute: AssetAttribute;
  value?: AttributeValue;
  onChange?: (value: AttributeValue) => void;
}) => {
  const { t, i18n } = useTranslation();
  switch (attribute.data_type) {
    case "number":
      return (
        <InputNumber<string>
          stringMode
          value={value == null || value === "" ? null : String(value)}
          onChange={(v) => onChange?.(v == null || v === "" ? null : Number(v))}
          // German shows a decimal comma; typing either comma or point works in both languages.
          decimalSeparator={i18n.language.startsWith("de") ? "," : "."}
          parser={(text) => (text ?? "").replace(/\s/g, "").replace(",", ".")}
          addonAfter={attribute.unit || undefined}
          style={{ width: "100%" }}
        />
      );
    case "date":
      return (
        <DatePicker
          value={value ? dayjs(String(value)) : null}
          onChange={(d) => onChange?.(d ? d.format("YYYY-MM-DD") : null)}
          format="L"
          style={{ width: "100%" }}
        />
      );
    case "boolean":
      return (
        <Select
          allowClear
          value={value == null || value === "" ? undefined : value === true || value === "true"}
          onChange={(v) => onChange?.(v ?? null)}
          options={[
            { value: true, label: t("common.yes") },
            { value: false, label: t("common.no") },
          ]}
        />
      );
    case "list":
      return <SuggestingInput attributeId={attribute.id} value={value == null ? "" : String(value)} onChange={(v) => onChange?.(v)} />;
    default:
      return <Input value={value == null ? "" : String(value)} onChange={(e) => onChange?.(e.target.value)} />;
  }
};

// Self-learning choice list: free text, suggesting the values already in use (most used first).
const SuggestingInput = ({ attributeId, value, onChange }: { attributeId: string; value: string; onChange: (value: string) => void }) => {
  const [term, setTerm] = useState<string | null>(null);
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (term === null) return;
    const handle = setTimeout(async () => {
      const { data } = await supabaseClient.rpc("asset_attribute_suggestions", { p_asset_attribute_id: attributeId, p_term: term, p_limit: 20 });
      setOptions(((data ?? []) as { value: string }[]).map((r) => ({ value: r.value, label: r.value })));
    }, 200);
    return () => clearTimeout(handle);
  }, [attributeId, term]);

  return (
    <AutoComplete
      value={value}
      options={options}
      onFocus={() => setTerm((cur) => cur ?? "")}
      onSearch={setTerm}
      onChange={onChange}
      allowClear
    />
  );
};
