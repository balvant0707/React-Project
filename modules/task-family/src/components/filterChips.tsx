// Ported 1:1 from COMPASS (app/src/components/filterChips.tsx).
import { useState } from "react";
import { Badge, Button, Checkbox, Popover, Space } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@rbp/ui";
import { FilterChip } from "@rbp/core";

type FilterChipItem = { key: string; label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };

// A row of quick filters. Desktop: the chips side by side. Phone: with more than two of them they would wrap into
// several lines above the list, so they fold into one "Quick filters" button whose popover holds them as checkboxes
// (the badge counts the active ones).
export const FilterChips = ({ items }: { items: FilterChipItem[] }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (!isMobile || items.length <= 2) {
    return (
      <Space size={8} wrap>
        {items.map((i) => (
          <FilterChip key={i.key} checked={i.checked} onChange={i.onChange} disabled={i.disabled}>{i.label}</FilterChip>
        ))}
      </Space>
    );
  }
  const active = items.filter((i) => i.checked).length;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={
        <Space direction="vertical" size={10}>
          {items.map((i) => (
            <Checkbox key={i.key} checked={i.checked} disabled={i.disabled} onChange={(e) => i.onChange(e.target.checked)}>{i.label}</Checkbox>
          ))}
        </Space>
      }
    >
      <Badge count={active} size="small" offset={[-4, 4]}>
        <Button icon={<FilterOutlined />}>{t("common.quickFilters")}</Button>
      </Badge>
    </Popover>
  );
};
