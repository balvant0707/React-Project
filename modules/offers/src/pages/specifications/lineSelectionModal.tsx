// Ported 1:1 from the NPM tool (app/src/pages/specifications/lineSelectionModal.tsx).
import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Modal, Table, Typography } from "antd";
import { formatNumber } from "@rbp/ui";
import { PacksInput, UnitQuantityInput } from "../../components/packQuantityInputs";
import { packsOfQuantity, type LineItemRow } from "./lineItemCalc";
import type { PackagingInfo } from "./areasEditor";

// Which offered lines the customer took - asked on Accept (all types; for Seastock the order is created from
// exactly these) and on Create Order (DD/NB, one order per delivery). Preselected: every offered line not
// declined before. Saved by accept_specification / create_order_from_specification (migration 20261022100000).
//
// editQuantities: the customer may take a different number of packs than offered (Seastock accept, DD/NB create
// order). Packs or quantity can be typed, the other follows. Less is fine; more than offered asks for a
// confirmation. onConfirm gets the lines whose pack count differs from the offer ({line id: packs}).
// The pack count the dialog starts from: the offer's, else derived from its quantity, else 0 (nothing offered yet).
const initialPacksOf = (li: LineItemRow, packagingById: Map<string, PackagingInfo>) => {
  if (li.offered_packs != null) return li.offered_packs;
  const size = packagingById.get(li.product_packaging_id ?? "")?.pack_size;
  return li.offered_qty != null && size ? packsOfQuantity(li.offered_qty, size) : 0;
};

export function LineSelectionModal({
  open,
  title,
  okText,
  description,
  lineItems,
  packagingById,
  editQuantities,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  okText: string;
  description?: React.ReactNode;
  lineItems: LineItemRow[];
  packagingById: Map<string, PackagingInfo>;
  editQuantities?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (lineItemIds: string[], packs: Record<string, number>) => void;
}) {
  const { modal } = AntdApp.useApp();
  const offered = useMemo(() => lineItems.filter((li) => li.is_offered && li.id), [lineItems]);
  const [selected, setSelected] = useState<string[]>([]);
  const [packs, setPacks] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      setSelected(offered.filter((li) => li.is_accepted !== false).map((li) => li.id as string));
      setPacks(Object.fromEntries(offered.map((li) => [li.id as string, initialPacksOf(li, packagingById)])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offered]);

  const packsOf = (li: LineItemRow) => packs[li.id as string] ?? initialPacksOf(li, packagingById);
  // Price per unit x quantity of the chosen packs.
  const totalOf = (li: LineItemRow) => {
    const size = packagingById.get(li.product_packaging_id ?? "")?.pack_size;
    return li.net_price == null || !size ? (li.total_price ?? 0) : li.net_price * packsOf(li) * size;
  };
  const total = offered.filter((li) => selected.includes(li.id as string)).reduce((sum, li) => sum + totalOf(li), 0);

  const submit = () => {
    const chosen = offered.filter((li) => selected.includes(li.id as string));
    const changed: Record<string, number> = {};
    if (editQuantities) {
      for (const li of chosen) if (packsOf(li) !== initialPacksOf(li, packagingById)) changed[li.id as string] = packsOf(li);
    }
    const over = chosen.filter((li) => packsOf(li) > initialPacksOf(li, packagingById));
    if (over.length === 0) {
      onConfirm(selected, changed);
      return;
    }
    modal.confirm({
      title: "More than offered",
      content: (
        <>
          <Typography.Paragraph>The quantity of these lines is above the offer:</Typography.Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {over.map((li) => {
              const pkg = packagingById.get(li.product_packaging_id ?? "");
              return (
                <li key={li.id as string}>
                  {pkg?.label ?? "?"}: {formatNumber(packsOf(li))} packs ordered, {formatNumber(initialPacksOf(li, packagingById))} offered
                </li>
              );
            })}
          </ul>
          <Typography.Paragraph style={{ marginBottom: 0 }}>Continue with the higher quantity?</Typography.Paragraph>
        </>
      ),
      okText: "Continue",
      onOk: () => onConfirm(selected, changed),
    });
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={submit}
      okText={okText}
      okButtonProps={{ disabled: selected.length === 0 || (editQuantities &&
          selected.some((id) => {
            const li = offered.find((o) => o.id === id);
            // Only a pack count the user changed has to be a real number; a line that never had one is left as offered.
            return !!li && packs[id] !== initialPacksOf(li, packagingById) && !(packs[id] > 0);
          })), loading }}
      width={editQuantities ? 980 : 760}
      destroyOnHidden
    >
      {description && <Typography.Paragraph>{description}</Typography.Paragraph>}
      <Table
        dataSource={offered}
        rowKey={(r) => r.id as string}
        pagination={false}
        size="small"
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={editQuantities ? 5 : 4} align="right">
              <strong>Selected total</strong>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <strong>{formatNumber(total)}</strong>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      >
        <Table.Column title="Product" render={(_, r: LineItemRow) => packagingById.get(r.product_packaging_id ?? "")?.label ?? "?"} />
        <Table.Column
          title="Offered"
          align="right"
          width={150}
          render={(_, r: LineItemRow) => {
            const unit = packagingById.get(r.product_packaging_id ?? "")?.unit ?? "";
            return `${formatNumber(r.offered_packs)} packs / ${formatNumber(r.offered_qty)} ${unit}`;
          }}
        />
        {editQuantities && (
          <Table.Column
            title="Packs"
            width={100}
            render={(_, r: LineItemRow) => <PacksInput packs={packsOf(r)} min={1} onPacksChange={(v) => setPacks((p) => ({ ...p, [r.id as string]: v ?? 0 }))} />}
          />
        )}
        {editQuantities && (
          <Table.Column
            title="Quantity"
            width={150}
            render={(_, r: LineItemRow) => {
              const pkg = packagingById.get(r.product_packaging_id ?? "");
              return (
                <UnitQuantityInput
                  packs={packsOf(r)}
                  packSize={pkg?.pack_size}
                  unit={pkg?.unit}
                  onPacksChange={(v) => setPacks((p) => ({ ...p, [r.id as string]: Math.max(1, v) }))}
                />
              );
            }}
          />
        )}
        <Table.Column title="Comment" dataIndex="comment" render={(v) => <Typography.Text type="secondary">{v}</Typography.Text>} />
        <Table.Column title="Total price" align="right" width={120} render={(_, r: LineItemRow) => formatNumber(totalOf(r))} />
      </Table>
      {offered.length < lineItems.length && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          Lines not in the offer are not listed.
        </Typography.Paragraph>
      )}
    </Modal>
  );
}
