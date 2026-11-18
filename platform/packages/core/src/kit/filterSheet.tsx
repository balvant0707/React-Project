// Copied 1:1 from COMPASS (app/src/components/filterSheet.tsx): the phone UI of both apps comes from COMPASS (docs/shared-parts.md). Changed: imports.
import { useState } from "react";
import { Badge, Button, Drawer, Space, Typography, theme as antdTheme } from "antd";
import { CheckOutlined, FilterOutlined, RightOutlined } from "@ant-design/icons";
import type { CrudSort } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { FilterChip } from "./filterChip";
import type { FilterField } from "./listFilterBar";
import type { SortOption } from "./sortButton";

type QuickFilter = { key: string; label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };

// Phone: everything that narrows or orders a list behind one "Filter" button next to the search box (a dot when
// anything is set): quick filters as chips, the orders, and the columns of the filter bar (a tap opens its modal).
// `ignore`: filter columns whose value comes from a tab above the list (it shows them already), so they set no dot.
export const FilterSheet = ({
  quick = [],
  sort,
  fields = [],
  onEdit,
  ignore = [],
}: {
  quick?: QuickFilter[];
  sort?: { options: SortOption[]; sorters: CrudSort[]; onChange: (sorters: CrudSort[]) => void };
  fields?: FilterField[];
  onEdit?: (key: string) => void;
  ignore?: string[];
}) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const [open, setOpen] = useState(false);
  const active = quick.some((q) => q.checked) || fields.some((f) => f.active && !ignore.includes(f.key));
  const current = sort?.sorters[0];
  const heading = (text: string) => (
    <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 0 8px" }}>
      {text}
    </Typography.Text>
  );
  return (
    <>
      <Badge dot={active} offset={[-6, 6]} color={token.colorError}>
        <Button icon={<FilterOutlined />} onClick={() => setOpen(true)}>{t("common.filter")}</Button>
      </Badge>
      <Drawer open={open} onClose={() => setOpen(false)} placement="bottom" height="auto" title={t("common.filter")} styles={{ body: { paddingTop: 0, maxHeight: "75dvh", overflowY: "auto" } }}>
        {quick.length > 0 && (
          <>
            {heading(t("common.quickFilters"))}
            <Space size={8} wrap>
              {quick.map((q) => (
                <FilterChip key={q.key} checked={q.checked} onChange={q.onChange} disabled={q.disabled}>{q.label}</FilterChip>
              ))}
            </Space>
          </>
        )}
        {sort && (
          <>
            {heading(t("common.sortBy"))}
            <Space size={8} wrap>
              {sort.options.map((o) => (
                <FilterChip key={o.key} checked={!!current && current.field === o.field && current.order === o.order} onChange={() => sort.onChange([{ field: o.field, order: o.order }])}>
                  {o.label}
                </FilterChip>
              ))}
            </Space>
          </>
        )}
        {fields.length > 0 && onEdit && (
          <>
            {heading(t("common.moreFilters"))}
            <div>
              {fields.map((f) => (
                <div
                  key={f.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setOpen(false);
                    onEdit(f.key);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (setOpen(false), onEdit(f.key))}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", borderBottom: `1px solid ${token.colorBorderSecondary}`, cursor: "pointer" }}
                >
                  <span style={{ flex: 1, fontWeight: f.active ? 600 : 400 }}>{f.label}</span>
                  {f.active && <CheckOutlined style={{ color: token.colorError }} />}
                  <RightOutlined style={{ color: token.colorTextTertiary, fontSize: 12 }} />
                </div>
              ))}
            </div>
          </>
        )}
      </Drawer>
    </>
  );
};
