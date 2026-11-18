// Ported 1:1 from the NPM tool (app/src/pages/orders/orderLinesTable.tsx).
// The order lines card: keyboard-driven grid (always one blank row at the end; picking a product on it makes it a
// real line under the same key, so the focus stays; Enter walks the cells, useGridKeyNav) with prices and gross profit.
import { useState } from "react";
import { Button, Card, InputNumber, Table } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { RemoteSelect } from "@rbp/ui";
import { PacksInput, UnitQuantityInput, quantityOfPacks } from "../../components/packQuantityInputs";
import { gridCell, useGridKeyNav } from "@rbp/ui";
import { formatNumber as money } from "@rbp/ui";
import { searchPackagings } from "@rbp/module-products/src/modules/products/packagings.ts";
import type { PackagingInfo } from "../specifications/areasEditor";
import { blankOrderLine, newOrderLineKey, orderLinePricing as pricing, type OrderLineRow } from "./orderLines";

export function OrderLinesTable(props: {
  lines: OrderLineRow[];
  packagingById: Map<string, PackagingInfo>;
  onPackagingsFound: (list: PackagingInfo[]) => void;
  onAddLine: (line: OrderLineRow) => void;
  onUpdateLine: (key: string, patch: Partial<OrderLineRow>) => void;
  onRemoveLine: (key: string) => void;
  disabled: boolean;
}) {
  const { lines, packagingById, onPackagingsFound: registerPackagings, onAddLine, onUpdateLine: updateLine, onRemoveLine: removeLine, disabled: isDeleted } = props;
  const [blankKey, setBlankKey] = useState(() => newOrderLineKey());
  const blankLine = blankOrderLine({ key: blankKey, sequence: lines.length + 1 });
  const grid = useGridKeyNav();

  // A new product keeps the pack count; the quantity follows the new pack size, the prices start over.
  const pickProduct = (r: OrderLineRow, packagingId: string) => {
    const pkg = packagingById.get(packagingId);
    if (r.key === blankKey) {
      onAddLine(blankOrderLine({ key: r.key, sequence: lines.length + 1, product_packaging_id: packagingId, cost_price: pkg?.cost_price ?? null }));
      setBlankKey(newOrderLineKey());
    } else {
      updateLine(r.key, { product_packaging_id: packagingId, sales_price: null, cost_price: pkg?.cost_price ?? null, ordered_qty: quantityOfPacks(r.ordered_packs, pkg?.pack_size) });
    }
    grid.focusNextAfter(r.key, "product");
  };

  return (
    <Card size="small" title="Order Lines" style={{ marginBottom: 16 }}>
      <div ref={grid.ref} onKeyDownCapture={grid.onKeyDownCapture}>
      <Table<OrderLineRow>
        dataSource={isDeleted ? lines : [...lines, blankLine]}
        rowKey="key"
        pagination={false}
        size="small"
      >
        <Table.Column<OrderLineRow>
          title="Product"
          render={(_, r) => (
            <div {...gridCell(r.key, "product")}>
              <RemoteSelect
                value={r.product_packaging_id ?? undefined}
                loadOptions={async (term) => {
                  const found = await searchPackagings(term);
                  registerPackagings(found);
                  return found.map((p) => ({ value: p.id, label: p.label }));
                }}
                knownLabels={r.product_packaging_id && packagingById.get(r.product_packaging_id) ? { [r.product_packaging_id]: packagingById.get(r.product_packaging_id)!.label } : undefined}
                onChange={(v) => v && pickProduct(r, v as string)}
              />
            </div>
          )}
        />
        <Table.Column<OrderLineRow>
          title="Packs"
          width={90}
          render={(_, r) => (
            <div {...gridCell(r.key, "packs")}>
              <PacksInput
                packs={r.ordered_packs}
                disabled={r.key === blankKey}
                onPacksChange={(packs) =>
                  updateLine(r.key, { ordered_packs: packs, ordered_qty: quantityOfPacks(packs, packagingById.get(r.product_packaging_id ?? "")?.pack_size) })
                }
              />
            </div>
          )}
        />
        <Table.Column<OrderLineRow>
          title="Quantity"
          width={140}
          render={(_, r) => {
            const pkg = packagingById.get(r.product_packaging_id ?? "");
            return (
              <div {...gridCell(r.key, "quantity")}>
                <UnitQuantityInput
                  packs={r.ordered_packs}
                  packSize={pkg?.pack_size}
                  unit={pkg?.unit}
                  disabled={r.key === blankKey}
                  onPacksChange={(packs) => updateLine(r.key, { ordered_packs: packs, ordered_qty: quantityOfPacks(packs, pkg?.pack_size) })}
                />
              </div>
            );
          }}
        />
        <Table.Column<OrderLineRow>
          title="Sales Price"
          width={110}
          render={(_, r) => (
            <div {...gridCell(r.key, "price")}>
              <InputNumber
                style={{ width: "100%" }}
                value={r.sales_price ?? undefined}
                disabled={r.key === blankKey}
                onChange={(v) => updateLine(r.key, { sales_price: v })}
              />
            </div>
          )}
        />
        <Table.Column<OrderLineRow>
          title="Discount %"
          width={100}
          render={(_, r) => (
            <div {...gridCell(r.key, "discount")}>
              <InputNumber
                style={{ width: "100%" }}
                value={r.discount_pct ?? undefined}
                disabled={r.key === blankKey}
                onChange={(v) => updateLine(r.key, { discount_pct: v })}
              />
            </div>
          )}
        />
        <Table.Column<OrderLineRow> title="Net Price" width={90} render={(_, r) => money(pricing(r).net_price)} />
        <Table.Column<OrderLineRow> title="Total" width={90} render={(_, r) => money(pricing(r).total_price)} />
        <Table.Column<OrderLineRow> title="Cost Price" width={90} align="right" render={(_, r) => money(r.cost_price)} />
        <Table.Column<OrderLineRow> title="GP" width={80} align="right" render={(_, r) => money(pricing(r).gross_profit)} />
        <Table.Column<OrderLineRow> title="GP %" width={80} align="right" render={(_, r) => money(pricing(r).gross_profit_pct)} />
        <Table.Column<OrderLineRow> title="Total GP" width={90} align="right" render={(_, r) => money(pricing(r).total_gross_profit)} />
        <Table.Column<OrderLineRow>
          title=""
          width={40}
          render={(_, r) => (r.key === blankKey ? null : <Button type="text" icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />)}
        />
      </Table>
      </div>
    </Card>
  );
}
