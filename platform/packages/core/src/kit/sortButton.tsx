// Copied 1:1 from COMPASS (app/src/components/sortButton.tsx): the phone UI of both apps comes from COMPASS (docs/shared-parts.md). Changed: imports.
import { useState } from "react";
import { Button, Popover, Radio, Space } from "antd";
import { SortAscendingOutlined } from "@ant-design/icons";
import type { CrudSort } from "@refinedev/core";
import { useTranslation } from "react-i18next";

export type SortOption = { key: string; label: string; field: string; order: "asc" | "desc" };

// Sorting for a list shown as cards on a phone, where there is no table header to click. One button whose popover
// offers the few orders that matter; picking one closes it. Feed it `sorters` / `setSorters` from `useTable`.
export const SortButton = ({ options, sorters, onChange }: { options: SortOption[]; sorters: CrudSort[]; onChange: (sorters: CrudSort[]) => void }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = sorters[0];
  const selected = options.find((o) => current && o.field === current.field && o.order === current.order)?.key;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      title={t("common.sortBy")}
      content={
        <Radio.Group
          value={selected}
          onChange={(e) => {
            const o = options.find((x) => x.key === e.target.value);
            if (o) onChange([{ field: o.field, order: o.order }]);
            setOpen(false);
          }}
        >
          <Space direction="vertical" size={10}>
            {options.map((o) => (
              <Radio key={o.key} value={o.key}>{o.label}</Radio>
            ))}
          </Space>
        </Radio.Group>
      }
    >
      <Button icon={<SortAscendingOutlined />}>{t("common.sort")}</Button>
    </Popover>
  );
};
