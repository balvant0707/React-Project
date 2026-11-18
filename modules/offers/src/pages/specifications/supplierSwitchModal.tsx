// Ported 1:1 from the NPM tool (app/src/pages/specifications/supplierSwitchModal.tsx).
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Select, Spin, Table, Tag, Typography } from "antd";
import { loadSupplierPackagingsForProducts } from "@rbp/module-products/src/modules/products/packagings.ts";
import { formatNumber } from "@rbp/ui";
import type { AreaRow, PackagingInfo } from "./areasEditor";
import type { LineItemRow } from "./lineItemCalc";

// The supplier of a specification was changed while lines or coat lines still point at packagings of the old one. A
// packaging is product + supplier + pack size, and the cost price belongs to it, so each packaging in use is mapped to
// the same product and pack size at the new supplier (picked automatically when there is exactly that, else chosen here)
// and the cost price follows. The sales price (entered by hand on the paint list, there is no catalog price) is NOT
// touched; the margin it gives at the new cost price is shown, a negative one is marked.

const KEEP = "__keep__";

export type SupplierSwitchResult = { mapping: Map<string, string>; newPackagings: PackagingInfo[] };

export const SupplierSwitchModal = ({
  open,
  newSupplierName,
  newSupplierId,
  lineItems,
  areas,
  packagingById,
  onApply,
  onSupplierOnly,
  onCancel,
}: {
  open: boolean;
  newSupplierName: string;
  newSupplierId: string;
  lineItems: LineItemRow[];
  areas: AreaRow[];
  packagingById: Map<string, PackagingInfo>;
  onApply: (result: SupplierSwitchResult) => void;
  onSupplierOnly: () => void;
  onCancel: () => void;
}) => {
  const [candidates, setCandidates] = useState<PackagingInfo[] | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});

  // Packagings in use that do not belong to the new supplier.
  const oldIds = useMemo(() => {
    const ids = new Set<string>();
    for (const li of lineItems) if (li.product_packaging_id) ids.add(li.product_packaging_id);
    for (const a of areas) for (const p of a.products) if (p.product_packaging_id) ids.add(p.product_packaging_id);
    return Array.from(ids).filter((id) => packagingById.get(id)?.supplier_id !== newSupplierId);
  }, [lineItems, areas, packagingById, newSupplierId]);

  useEffect(() => {
    if (!open) return;
    setCandidates(null);
    const productIds = Array.from(new Set(oldIds.map((id) => packagingById.get(id)?.product_id).filter((x): x is string => !!x)));
    loadSupplierPackagingsForProducts(productIds, newSupplierId).then((list) => {
      setCandidates(list);
      const initial: Record<string, string> = {};
      for (const id of oldIds) {
        const old = packagingById.get(id);
        const same = list.filter((c) => c.product_id === old?.product_id && c.pack_size === old?.pack_size && c.unit === old?.unit);
        initial[id] = same.length === 1 ? same[0].id : KEEP;
      }
      setChoice(initial);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, newSupplierId]);

  const candidateById = useMemo(() => new Map((candidates ?? []).map((c) => [c.id, c])), [candidates]);

  const rows = oldIds.map((id) => {
    const old = packagingById.get(id)!;
    const target = candidateById.get(choice[id] ?? KEEP);
    const lines = lineItems.filter((li) => li.product_packaging_id === id);
    // Worst margin of the lines at the new cost price, on the net price (sales price after the line discount).
    const margins = target?.cost_price == null ? [] : lines.filter((li) => li.net_price).map((li) => (li.net_price! - target.cost_price!) / li.net_price!);
    return { id, old, target, lineCount: lines.length, areaCount: areas.reduce((n, a) => n + a.products.filter((p) => p.product_packaging_id === id).length, 0), worst: margins.length ? Math.min(...margins) : null };
  });
  const mapped = rows.filter((r) => r.target);

  return (
    <Modal
      open={open}
      title={`Change supplier to ${newSupplierName}?`}
      width={820}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="only" onClick={onSupplierOnly}>
          Change supplier only
        </Button>,
        <Button key="apply" type="primary" disabled={candidates === null} onClick={() => onApply({ mapping: new Map(mapped.map((r) => [r.id, r.target!.id])), newPackagings: mapped.map((r) => r.target!) })}>
          Switch lines to {newSupplierName}
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Packagings and cost prices belong to the supplier."
        description="Each product is switched to the same pack size at the new supplier and takes its current cost price. Sales prices and discounts stay as they are - there is no catalog sales price - so check the margin."
      />
      {candidates === null ? (
        <Spin />
      ) : (
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          dataSource={rows}
          columns={[
            { title: "Now", render: (_: unknown, r) => <span>{r.old.label}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.lineCount} line(s){r.areaCount ? `, ${r.areaCount} coat line(s)` : ""}</Typography.Text></span> },
            {
              title: `At ${newSupplierName}`,
              render: (_: unknown, r) => (
                <Select
                  size="small"
                  style={{ width: 280 }}
                  value={choice[r.id] ?? KEEP}
                  onChange={(v) => setChoice((c) => ({ ...c, [r.id]: v }))}
                  options={[
                    ...candidates.filter((c) => c.product_id === r.old.product_id).map((c) => ({ value: c.id, label: c.label })),
                    { value: KEEP, label: "Keep (no change)" },
                  ]}
                />
              ),
            },
            { title: "Cost price", align: "right" as const, render: (_: unknown, r) => (r.target ? `${formatNumber(r.old.cost_price)} -> ${r.target.cost_price == null ? "no price" : formatNumber(r.target.cost_price)}` : "-") },
            {
              title: "Margin",
              align: "right" as const,
              render: (_: unknown, r) => (r.worst == null ? "-" : <Tag color={r.worst < 0 ? "error" : "default"}>{`${(r.worst * 100).toFixed(1)} %`}</Tag>),
            },
          ]}
        />
      )}
    </Modal>
  );
};
