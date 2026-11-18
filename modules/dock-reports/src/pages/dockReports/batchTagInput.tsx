// Ported 1:1 from the NPM tool (app/src/pages/dockReports/batchTagInput.tsx).
import { useState } from "react";
import { Input, InputNumber, DatePicker, Button, Tag, Space, Tooltip, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { uuidv7 } from "@rbp/ui";
import type { DraftBatch as BatchRow } from "./offline/types";

// Deliberately NOT a data-grid (~/npm_tool/docs/dock-report-module.md "Batch/drum
// tracking" - an explicit design decision): type a batch number + quantity,
// it appears as a closable chip. consumption_date is a third, optional small
// control on the same row rather than its own column - it's what lets a
// daily-consumption rollup (`group by consumption_date`) work later, but
// isn't part of the "tag" gesture itself.
export const BatchTagInput = ({
  batches,
  onChange,
  disabled,
}: {
  batches: BatchRow[];
  onChange: (batches: BatchRow[]) => void;
  disabled?: boolean;
}) => {
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState<number | null>(null);
  const [consumptionDate, setConsumptionDate] = useState<string | null>(null);

  const add = () => {
    const trimmed = batchNumber.trim();
    if (!trimmed) return;
    const id = uuidv7();
    onChange([...batches, { key: id, id, batch_number: trimmed, drum_quantity: quantity, consumption_date: consumptionDate }]);
    setBatchNumber("");
    setQuantity(null);
  };

  const remove = (key: string) => onChange(batches.filter((b) => b.key !== key));

  return (
    <div>
      <div style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {batches.map((b) => (
          <Tooltip key={b.key} title={b.consumption_date ? dayjs(b.consumption_date).format("DD.MM.YYYY") : undefined}>
            <Tag closable={!disabled} onClose={() => remove(b.key)}>
              {b.batch_number}
              {b.drum_quantity != null ? ` ×${b.drum_quantity}` : ""}
            </Tag>
          </Tooltip>
        ))}
        {batches.length === 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            No batches yet
          </Typography.Text>
        )}
      </div>
      {!disabled && (
        <Space.Compact size="small">
          <Input placeholder="Batch #" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} onPressEnter={add} style={{ width: 100 }} />
          <InputNumber placeholder="Drums" value={quantity} onChange={(v) => setQuantity(v)} onPressEnter={add} style={{ width: 80 }} min={0} />
          <DatePicker
            placeholder="Date"
            size="small"
            value={consumptionDate ? dayjs(consumptionDate) : null}
            onChange={(d) => setConsumptionDate(d ? d.format("YYYY-MM-DD") : null)}
            style={{ width: 110 }}
          />
          <Button icon={<PlusOutlined />} onClick={add} />
        </Space.Compact>
      )}
    </div>
  );
};
