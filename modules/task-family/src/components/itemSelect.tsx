// Ported 1:1 from COMPASS (app/src/components/itemSelect.tsx).
import { useCallback } from "react";
import { RemoteSelect } from "@rbp/ui";
import { useTranslation } from "react-i18next";
import { searchItems, itemLabels } from "../lib/items";
import { ItemThumb } from "./itemPhoto";

// Server-side search over the active catalogue (item number, manufacturer number, ERP number, name), optionally only
// items of some categories (what a task type offers).
export const ItemSelect = ({
  value,
  onChange,
  autoFocus,
  style,
  categoryIds,
}: {
  value?: string;
  onChange?: (id: string) => void;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  categoryIds?: string[];
}) => {
  const { t } = useTranslation();
  const key = (categoryIds ?? []).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback((term: string) => searchItems(term, categoryIds), [key]);
  return (
    <RemoteSelect
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      minChars={1}
      loadOptions={load}
      loadLabels={itemLabels}
      placeholder={t("items.searchPlaceholder")}
      style={style}
      optionRender={(o) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ItemThumb path={o.thumb} size={32} />
          <span>{o.label}</span>
        </div>
      )}
    />
  );
};
