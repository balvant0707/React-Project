// Ported 1:1 from the NPM tool (app/src/pages/specifications/salesPriceMarkupModal.tsx).
import { useEffect, useMemo, useState } from "react";
import { InputNumber, Modal, Radio, Typography } from "antd";
import type { LineItemRow } from "./lineItemCalc";

// Sales price = cost price + x % for the lines of a Seastock offer (markup on cost, not margin on the sales
// price). Prices are per unit like the cost price, rounded to cents. Lines without a cost price cannot be priced
// and are left alone.
export const salesPriceFromCost = (costPrice: number, markupPct: number) => Math.round(costPrice * (1 + markupPct / 100) * 100) / 100;

export function SalesPriceMarkupModal({
  open,
  lines,
  onApply,
  onCancel,
}: {
  open: boolean;
  lines: LineItemRow[];
  onApply: (markupPct: number, onlyEmpty: boolean) => void;
  onCancel: () => void;
}) {
  const [markupPct, setMarkupPct] = useState<number | null>(null);
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  useEffect(() => {
    if (open) {
      setMarkupPct(null);
      setOnlyEmpty(false);
    }
  }, [open]);

  const { affected, noCost } = useMemo(() => {
    const priceable = lines.filter((l) => l.cost_price != null);
    return {
      affected: priceable.filter((l) => !onlyEmpty || l.sales_price == null).length,
      noCost: lines.length - priceable.length,
    };
  }, [lines, onlyEmpty]);

  return (
    <Modal
      title="Set sales prices: cost plus %"
      open={open}
      onCancel={onCancel}
      onOk={() => markupPct != null && onApply(markupPct, onlyEmpty)}
      okText="Set prices"
      okButtonProps={{ disabled: markupPct == null || affected === 0 }}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Sets the sales price of the lines to their cost price plus the markup below. The prices stay editable per line; save the offer to keep them.
      </Typography.Paragraph>
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 4 }}>Markup on cost price</div>
        <InputNumber value={markupPct} onChange={setMarkupPct} min={-100} precision={2} addonAfter="%" autoFocus style={{ width: 160 }} />
      </div>
      <Radio.Group value={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.value)}>
        <Radio value={false}>All lines (overwrite existing prices)</Radio>
        <Radio value={true}>Only lines without a sales price</Radio>
      </Radio.Group>
      <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
        {affected} line{affected === 1 ? "" : "s"} will be priced
        {noCost > 0 ? `; ${noCost} without a cost price will be left as they are.` : "."}
      </Typography.Paragraph>
    </Modal>
  );
}
