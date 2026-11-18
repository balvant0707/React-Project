// Ported 1:1 from the NPM tool (app/src/pages/specifications/PaintListPanel.tsx).
import { useState } from "react";
import { Card, Table, InputNumber, Typography, Form, Input, Button, Checkbox, Tooltip } from "antd";
import { SyncOutlined, DeleteOutlined, PercentageOutlined } from "@ant-design/icons";
import { formatNumber } from "@rbp/ui";
import type { LineItemRow } from "./lineItemCalc";
import type { PackagingInfo } from "./areasEditor";
import type { DiscountRow } from "./mappers";
import { ProductPackagingSelect } from "./productPackagingSelect";
import { AvailabilityCell } from "./availabilityPanel";
import type { LineAvailability } from "./availability";
import { gridCell, useGridKeyNav } from "@rbp/ui";
import { newRowKey } from "@rbp/ui";
import { PacksInput, UnitQuantityInput } from "../../components/packQuantityInputs";
import { SalesPriceMarkupModal, salesPriceFromCost } from "./salesPriceMarkupModal";
import { DiscountsAndTotals } from "../../components/dealTotals";

const currency = formatNumber;

// The two rows of a product read as one block: no line between them, the line only after the second.
const PAINT_LINE_CSS = `
.paint-lines .ant-table-tbody > tr.paint-line-main > td { border-bottom: 0; padding-bottom: 4px; }
.paint-lines .ant-table-tbody > tr.ant-table-expanded-row > td { padding-top: 0; padding-bottom: 10px; }
`;

const LineFact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {label}
    </Typography.Text>
    <span>{children}</span>
  </span>
);

// The Paint List tab: line items, discounts and totals. The state stays with the page (show.tsx).
export const PaintListPanel = ({
  supplierId,
  lineItems,
  packagings,
  onPackagingsLoaded,
  discounts,
  usesAreaBreakdown,
  areaLinkedPackagingIds,
  disabled,
  grossPrice,
  specPrice,
  priceAfterDiscounts,
  netSales,
  totalCost,
  freightCost,
  onRecomputeFromAreas,
  onAddLineItem,
  onPackagingChange,
  onUpdateLineItem,
  onRemoveLineItem,
  onAddDiscount,
  onUpdateDiscount,
  onRemoveDiscount,
  onMarkDirty,
  showRequested,
  availabilityByLineItemId,
  deliveryDate,
  userName,
  onEditAvailability,
  availabilityEditDisabledReason,
  availabilityCard,
}: {
  // The specification's supplier: the product picker offers only its products.
  supplierId?: string | null;
  lineItems: LineItemRow[];
  // The packagings this spec has loaded so far (its own plus any picked in this
  // session) - the product picker searches the catalog on the server and
  // registers each result here through onPackagingsLoaded.
  packagings: PackagingInfo[];
  onPackagingsLoaded: (list: PackagingInfo[]) => Promise<void>;
  discounts: DiscountRow[];
  usesAreaBreakdown: boolean;
  // Which packaging ids are used by an Area - a DD/NB row on one of these
  // is derived from the Areas tab (paintListRecompute.ts)
  // and locked here accordingly. Ignored entirely when !usesAreaBreakdown
  // (Seastock has no areas, so nothing is ever area-linked there).
  areaLinkedPackagingIds: Set<string>;
  disabled?: boolean;
  // Sum of the offered lines before line discounts (Totals card).
  grossPrice: number;
  specPrice: number;
  priceAfterDiscounts: number;
  netSales: number;
  // Cost of the offered lines (cost price x packed quantity).
  totalCost: number;
  // Freight cost of the transport (actual, else estimated); the surcharge in netSales is what the customer pays for it.
  freightCost: number;
  onRecomputeFromAreas: () => void;
  // `init` = the blank row at the end got its product (see below); omitted = a plain empty row.
  onAddLineItem: (init?: { key: string; packagingId: string }) => void;
  onPackagingChange: (key: string, packagingId: string) => void;
  onUpdateLineItem: (key: string, patch: Partial<LineItemRow>) => void;
  onRemoveLineItem: (key: string) => void;
  onAddDiscount: () => void;
  onUpdateDiscount: (key: string, patch: Partial<DiscountRow>) => void;
  onRemoveDiscount: (key: string) => void;
  onMarkDirty: () => void;
  // Seastock only: the "Requested" column (part of the customer's initial request).
  showRequested: boolean;
  availabilityByLineItemId: Map<string, LineAvailability>;
  // End of the delivery window, the date availability answers are measured against.
  deliveryDate?: string | null;
  userName: (id: string | null | undefined) => string;
  // Undefined = availability is read-only for this user.
  onEditAvailability?: (record: LineItemRow) => void;
  availabilityEditDisabledReason: (record: LineItemRow) => string | undefined;
  // The availability requests card, shown under the line items.
  availabilityCard?: React.ReactNode;
}) => {
  // The table always ends with one blank row. Picking a product on it makes it a real line (it keeps the blank
  // row's key, so the DOM row and the focus stay put) and a fresh blank row appears below. Enter walks through the
  // cells (useGridKeyNav), so a whole offer can be typed without the mouse.
  const [blankKey, setBlankKey] = useState(() => newRowKey("lineitem"));
  const grid = useGridKeyNav();
  const [markupOpen, setMarkupOpen] = useState(false);
  const isBlank = (record: LineItemRow) => record.key === blankKey;
  const packagingOf = (record: LineItemRow) => packagings.find((p) => p.id === record.product_packaging_id);
  const blankRow: LineItemRow = {
    key: blankKey,
    id: null,
    sequence: lineItems.length + 1,
    product_packaging_id: null,
    quantity_product: null,
    thin_pct: null,
    sales_price: null,
    discount_pct: null,
    cost_price: null,
    real_quantity: null,
    offered_qty: null,
    offered_packs: null,
    net_price: null,
    gross_profit: null,
    gross_profit_pct: null,
    total_price: null,
    total_gross_profit: null,
    comment: null,
    is_requested: false,
    is_offered: true,
    is_accepted: null,
  };
  const pickProduct = (record: LineItemRow, packagingId: string) => {
    if (isBlank(record)) {
      onAddLineItem({ key: record.key, packagingId });
      setBlankKey(newRowKey("lineitem"));
    } else {
      onPackagingChange(record.key, packagingId);
    }
    grid.focusNextAfter(record.key, "product");
  };

  return (
  <>
    <SalesPriceMarkupModal
      open={markupOpen}
      lines={lineItems}
      onCancel={() => setMarkupOpen(false)}
      onApply={(markupPct, onlyEmpty) => {
        for (const line of lineItems) {
          if (line.cost_price == null || (onlyEmpty && line.sales_price != null)) continue;
          onUpdateLineItem(line.key, { sales_price: salesPriceFromCost(line.cost_price, markupPct) });
        }
        setMarkupOpen(false);
      }}
    />
    <Card
      title="Line items"
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        !disabled && (
          <>
            {usesAreaBreakdown && (
              <Button icon={<SyncOutlined />} size="small" onClick={onRecomputeFromAreas} style={{ marginRight: 8 }}>
                Recompute from areas
              </Button>
            )}
            {!usesAreaBreakdown && (
              <Button icon={<PercentageOutlined />} size="small" onClick={() => setMarkupOpen(true)} disabled={lineItems.length === 0}>
                Set sales prices
              </Button>
            )}
          </>
        )
      }
    >
      <style>{PAINT_LINE_CSS}</style>
      <div ref={grid.ref} onKeyDownCapture={grid.onKeyDownCapture} className="paint-lines">
      <Table
        dataSource={disabled ? lineItems : [...lineItems, blankRow]}
        rowKey="key"
        pagination={false}
        size="small"
        scroll={{ x: true }}
        // A line outside the offer stays visible but greyed; it counts nowhere (totals, PDFs, orders).
        onRow={(record: LineItemRow) => (record.is_offered || isBlank(record) ? {} : { style: { opacity: 0.5 } })}
        rowClassName={(record: LineItemRow) => (isBlank(record) ? "" : "paint-line-main")}
        // The second row of every product: quantities, cost and profit, comment. Always open, no expand icon.
        expandable={{
          expandedRowKeys: lineItems.map((r) => r.key),
          expandIcon: () => null,
          showExpandColumn: false,
          rowExpandable: (record: LineItemRow) => !isBlank(record),
          expandedRowRender: (record: LineItemRow) => (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 24, rowGap: 6, opacity: record.is_offered ? 1 : 0.5 }}>
              {usesAreaBreakdown && <LineFact label="Real qty">{currency(record.real_quantity)}</LineFact>}
              <LineFact label="Cost price">{currency(record.cost_price)}</LineFact>
              <LineFact label="GP">{currency(record.gross_profit)}</LineFact>
              <LineFact label="GP %">{currency(record.gross_profit_pct)}</LineFact>
              <LineFact label="Total GP">{currency(record.total_gross_profit)}</LineFact>
              <div {...gridCell(record.key, "comment")} style={{ flex: "1 1 260px", minWidth: 220 }}>
                <Input
                  value={record.comment ?? ""}
                  maxLength={200}
                  placeholder="Comment"
                  disabled={disabled}
                  onChange={(e) => onUpdateLineItem(record.key, { comment: e.target.value })}
                />
              </div>
            </div>
          ),
        }}
      >
        {showRequested && (
          <Table.Column
            title={<Tooltip title="Part of the customer's initial request">Req.</Tooltip>}
            dataIndex="is_requested"
            width={50}
            align="center"
            render={(v: boolean, record: LineItemRow) =>
              isBlank(record) ? null : (
                <Checkbox checked={v} disabled={disabled} onChange={(e) => onUpdateLineItem(record.key, { is_requested: e.target.checked })} />
              )
            }
          />
        )}
        <Table.Column
          title={<Tooltip title="Part of the offer - only these count in totals, PDFs and orders">Offer</Tooltip>}
          dataIndex="is_offered"
          width={55}
          align="center"
          render={(v: boolean, record: LineItemRow) =>
            isBlank(record) ? null : (
              <Checkbox checked={v} disabled={disabled} onChange={(e) => onUpdateLineItem(record.key, { is_offered: e.target.checked })} />
            )
          }
        />
        <Table.Column
          title="Product"
          dataIndex="product_packaging_id"
          width={260}
          render={(v, record: LineItemRow) => (
            <div {...gridCell(record.key, "product")}>
              <ProductPackagingSelect
                value={v ?? undefined}
                packagings={packagings}
                supplierId={supplierId}
                onPackagingsLoaded={onPackagingsLoaded}
                onChange={(val) => pickProduct(record, val)}
                style={{ width: "100%" }}
                disabled={disabled || record.origin === "thinner" || (usesAreaBreakdown && !!v && areaLinkedPackagingIds.has(v))}
              />
            </div>
          )}
        />
        <Table.Column
          title="Availability"
          width={130}
          render={(_, record: LineItemRow) =>
            isBlank(record) ? null : (
            <AvailabilityCell
              availability={record.id ? availabilityByLineItemId.get(record.id) : undefined}
              unit={packagings.find((p) => p.id === record.product_packaging_id)?.unit ?? ""}
              userName={userName}
              deliveryDate={deliveryDate}
              onEdit={onEditAvailability ? () => onEditAvailability(record) : undefined}
              editDisabledReason={onEditAvailability ? availabilityEditDisabledReason(record) : undefined}
            />
            )
          }
        />
        <Table.Column
          title="Quantity"
          dataIndex="quantity_product"
          width={130}
          align="right"
          render={(v, record: LineItemRow) => {
            // Locked only for a row an Area actually derives (recomputed via
            // "Recompute from areas" above) - never hand-edited, per
            // domain-model.md, since it'd just be overwritten on the next
            // recompute anyway. A manually-added line (Technical Service, or
            // anything typed in via "Add line") has no Area to derive a
            // quantity from, so it needs to stay editable even on a DD/NB
            // spec; Seastock has no areas at all, so nothing there is ever
            // locked.
            const isAreaLinked = record.origin === "thinner" || (usesAreaBreakdown && !!record.product_packaging_id && areaLinkedPackagingIds.has(record.product_packaging_id));
            return isAreaLinked ? (
              <Typography.Text>{currency(v)}</Typography.Text>
            ) : (
              <div {...gridCell(record.key, "quantity")}>
                {!usesAreaBreakdown && packagingOf(record) ? (
                  // Seastock: the quantity is always whole packs, rounded up when the field is left.
                  <UnitQuantityInput
                    packs={record.offered_packs}
                    packSize={packagingOf(record)!.pack_size}
                    unit={packagingOf(record)!.unit}
                    disabled={disabled || isBlank(record)}
                    onPacksChange={(packs) => onUpdateLineItem(record.key, { quantity_product: packs * packagingOf(record)!.pack_size })}
                  />
                ) : (
                  <InputNumber value={v} suffix={packagingOf(record)?.unit} onChange={(val) => onUpdateLineItem(record.key, { quantity_product: val })} disabled={disabled || isBlank(record)} />
                )}
              </div>
            );
          }}
        />
        <Table.Column
          title="Packs"
          dataIndex="offered_packs"
          width={90}
          align="right"
          render={(v: number | null, record: LineItemRow) => {
            const pkg = packagingOf(record);
            // Seastock: type the packs and the quantity follows (and the other way round). DD/NB quantities
            // come from the areas and the thinner share, so the pack count is only shown.
            if (usesAreaBreakdown || disabled || isBlank(record) || !pkg) return <Typography.Text>{currency(v)}</Typography.Text>;
            return (
              <div {...gridCell(record.key, "packs")}>
                <PacksInput packs={v} onPacksChange={(packs) => onUpdateLineItem(record.key, { quantity_product: packs == null ? null : packs * pkg.pack_size })} />
              </div>
            );
          }}
        />
        {usesAreaBreakdown && (
          <Table.Column
            title="Thinner %"
            dataIndex="thin_pct"
            width={90}
            align="right"
            render={(v, record: LineItemRow) => (
              <div {...gridCell(record.key, "thin")}>
                <InputNumber value={v} onChange={(val) => onUpdateLineItem(record.key, { thin_pct: val })} disabled={disabled || isBlank(record) || record.origin === "thinner"} />
              </div>
            )}
          />
        )}
        <Table.Column
          title="Sales price"
          dataIndex="sales_price"
          width={110}
          align="right"
          render={(v, record: LineItemRow) => (
            <div {...gridCell(record.key, "price")}>
              <InputNumber value={v} onChange={(val) => onUpdateLineItem(record.key, { sales_price: val })} precision={2} disabled={disabled || isBlank(record)} />
            </div>
          )}
        />
        <Table.Column
          title="Discount %"
          dataIndex="discount_pct"
          width={100}
          align="right"
          render={(v, record: LineItemRow) => (
            <div {...gridCell(record.key, "discount")}>
              <InputNumber value={v} onChange={(val) => onUpdateLineItem(record.key, { discount_pct: val })} disabled={disabled || isBlank(record)} />
            </div>
          )}
        />
        <Table.Column title="Net price" dataIndex="net_price" width={100} align="right" render={currency} />
        <Table.Column title="Total price" dataIndex="total_price" width={110} align="right" render={currency} />
        {!disabled && (
          <Table.Column
            title=""
            width={40}
            render={(_, record: LineItemRow) => {
              // Removing an area-linked row is a no-op in effect - it just
              // reappears on the next recompute (from areas), since that's
              // still where it lives. Remove it there (the Areas tab)
              // instead of here.
              const locked = record.origin === "thinner" || (usesAreaBreakdown && !!record.product_packaging_id && areaLinkedPackagingIds.has(record.product_packaging_id));
              if (isBlank(record)) return null;
              return <Button icon={<DeleteOutlined />} danger size="small" disabled={locked} onClick={() => onRemoveLineItem(record.key)} />;
            }}
          />
        )}
      </Table>
      </div>
    </Card>

    {availabilityCard}

    <DiscountsAndTotals
      discounts={discounts}
      onAddDiscount={onAddDiscount}
      onUpdateDiscount={onUpdateDiscount}
      onRemoveDiscount={onRemoveDiscount}
      totals={{ grossPrice, price: specPrice, priceAfterDiscounts, netSales, totalCost }}
      freightCost={freightCost}
      priceLabel="Spec price"
      surcharge={
        <Form.Item name="transport_customs_surcharge" noStyle>
          <InputNumber style={{ width: 160 }} precision={2} disabled={disabled} onChange={onMarkDirty} />
        </Form.Item>
      }
      disabled={disabled}
    />
  </>
  );
};
