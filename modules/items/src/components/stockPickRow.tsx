// Ported 1:1 from COMPASS (app/src/components/stockPickRow.tsx).
import { useState } from "react";
import { Button, InputNumber, Select, Space, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useStockLocations } from "../hooks/useStock";
import { autoPicks, type ItemStock, type StockPick, type StockBalance } from "../lib/stock";

const round = (n: number) => Math.round(n * 100) / 100;

// Under a used item in the completion dialog: where the parts come from. Automatic by default (the default location, then
// whatever holds stock), shown as one line; "Change" opens the split over several locations. With one location nothing
// has to be answered.
export const StockPickRow = ({
  quantity,
  stock,
  balances,
  picks,
  onChange,
}: {
  quantity: number;
  stock: ItemStock;
  balances: StockBalance[];
  picks: StockPick[] | undefined;
  onChange: (picks: StockPick[] | undefined) => void;
}) => {
  const { t } = useTranslation();
  const { byId, nodes } = useStockLocations();
  const [editing, setEditing] = useState(false);
  const auto = autoPicks(balances, stock.default_stock_location_id, quantity);
  const effective = picks ?? auto;
  const available = balances.reduce((sum, b) => sum + Math.max(0, Number(b.quantity)), 0);
  const text = effective.map((p) => `${byId.get(p.location_id)?.path ?? "?"} (${p.quantity})`).join(", ");
  const sum = round(effective.reduce((s, p) => s + p.quantity, 0));
  const off = picks !== undefined && sum !== round(quantity);
  const holding = (id: string) => Number(balances.find((b) => b.stock_location_id === id)?.quantity ?? 0);

  const setPick = (index: number, patch: Partial<StockPick>) => onChange(effective.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <div style={{ marginLeft: 24, marginTop: 4, fontSize: 13 }}>
      <Space size={6} wrap>
        <Typography.Text type="secondary">{t("stock.takenFrom")}</Typography.Text>
        <Typography.Text>{text || "—"}</Typography.Text>
        {available < quantity && <Typography.Text type="warning">{t("stock.notEnoughAvailable", { count: available })}</Typography.Text>}
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setEditing((v) => !v)}>{editing ? t("stock.done") : t("stock.change")}</Button>
        {picks !== undefined && <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onChange(undefined)}>{t("stock.automatic")}</Button>}
      </Space>
      {editing && (
        <Space direction="vertical" size={4} style={{ width: "100%", marginTop: 6 }}>
          {effective.map((p, i) => (
            <Space key={`${p.location_id}-${i}`} size={4} wrap>
              <Select
                size="small"
                showSearch
                optionFilterProp="label"
                style={{ width: 240 }}
                value={p.location_id}
                onChange={(v) => setPick(i, { location_id: v })}
                options={nodes.filter((n) => n.is_active || n.id === p.location_id).map((n) => ({ value: n.id, label: `${n.path} · ${holding(n.id)}` }))}
              />
              <InputNumber size="small" min={0.01} precision={2} value={p.quantity} onChange={(v) => setPick(i, { quantity: Number(v ?? 0) })} style={{ width: 90 }} />
              <Button size="small" type="text" icon={<DeleteOutlined />} disabled={effective.length <= 1} onClick={() => onChange(effective.filter((_, k) => k !== i))} />
            </Space>
          ))}
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              const used = new Set(effective.map((p) => p.location_id));
              const next = nodes.find((n) => n.is_active && !used.has(n.id) && holding(n.id) > 0) ?? nodes.find((n) => n.is_active && !used.has(n.id));
              if (next) onChange([...effective, { location_id: next.id, quantity: Math.max(0, round(quantity - sum)) || 1 }]);
            }}
          >
            {t("stock.addLocation")}
          </Button>
          {off && <Typography.Text type="danger">{t("stock.picksOff", { sum, quantity })}</Typography.Text>}
        </Space>
      )}
    </div>
  );
};

// True when an explicit split does not add up (the usage dialog then cannot be saved).
export const picksInvalid = (picks: StockPick[] | undefined, quantity: number) =>
  picks !== undefined && (picks.length === 0 || round(picks.reduce((s, p) => s + p.quantity, 0)) !== round(quantity));
