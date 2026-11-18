// Ported 1:1 from COMPASS (app/src/components/stockLocationSelect.tsx).
import { Select } from "antd";
import { useTranslation } from "react-i18next";
import { useStockLocations } from "../hooks/useStock";

// Picks a stock location by its path ("Store › Shelf A"). `filter` narrows the offer (e.g. the locations the user may book
// at); inactive locations are offered only when they are the current value.
export const StockLocationSelect = ({
  value,
  onChange,
  filter,
  allowClear,
  exclude,
  style,
  autoFocus,
}: {
  value?: string | null;
  onChange?: (id: string | undefined) => void;
  filter?: (location: { id: string; team_id: string | null }) => boolean;
  allowClear?: boolean;
  exclude?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
}) => {
  const { t } = useTranslation();
  const { nodes } = useStockLocations();
  return (
    <Select
      showSearch
      allowClear={allowClear}
      autoFocus={autoFocus}
      optionFilterProp="label"
      placeholder={t("stock.location")}
      style={style ?? { width: "100%" }}
      value={value ?? undefined}
      onChange={(v) => onChange?.(v)}
      options={nodes
        .filter((n) => n.id !== exclude && (n.is_active || n.id === value) && (!filter || filter(n)))
        .map((n) => ({ value: n.id, label: `${n.path} (${n.code})` }))}
    />
  );
};
