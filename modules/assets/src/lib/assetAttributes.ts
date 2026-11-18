// Ported 1:1 from COMPASS (app/src/lib/assetAttributes.ts).
import dayjs from "dayjs";
import type { TFunction } from "i18next";

// Asset attributes: typed technical data per asset type.
export const ATTRIBUTE_DATA_TYPES = ["text", "number", "date", "boolean", "list"] as const;
export type AttributeDataType = (typeof ATTRIBUTE_DATA_TYPES)[number];

export type AssetAttribute = {
  id: string;
  name: string;
  data_type: AttributeDataType;
  unit: string | null;
  description: string | null;
  // Asset types that offer this attribute.
  asset_type_ids: string[];
};

export type AttributeValue = string | number | boolean | null;

// Key of an attribute in assets_overview.attribute_values: "a" + id without dashes.
export const attributeKey = (id: string) => `a${id.replace(/-/g, "")}`;

// The PostgREST column for filtering/sorting on one attribute: ->> (text) for text, list and date
// (ISO dates sort as text), -> (JSON) for numbers and booleans so they compare as such.
export const attributeField = (a: Pick<AssetAttribute, "id" | "data_type">) =>
  `attribute_values${a.data_type === "number" || a.data_type === "boolean" ? "->" : "->>"}${attributeKey(a.id)}`;

export function formatAttributeValue(t: TFunction, a: Pick<AssetAttribute, "data_type" | "unit">, value: AttributeValue | undefined): string {
  if (value == null || value === "") return "—";
  switch (a.data_type) {
    case "number": {
      // dayjs carries the UI language (i18n/index.ts), so numbers match the dates next to them.
      const text = Number(value).toLocaleString(dayjs.locale() === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 6, useGrouping: false });
      return a.unit ? `${text} ${a.unit}` : text;
    }
    case "date":
      return dayjs(String(value)).format("L");
    case "boolean":
      return value === true || value === "true" ? t("common.yes") : t("common.no");
    default:
      return String(value);
  }
}
