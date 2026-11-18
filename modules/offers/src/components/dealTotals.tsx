// Ported 1:1 from the NPM tool (app/src/components/dealTotals.tsx).
// Discounts and totals of an offer (Paint List tab) and of an order: the same two cards side by side.
import type { ReactNode } from "react";
import { Button, Card, Col, Descriptions, Input, InputNumber, Row, Switch, Table, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { formatNumber } from "@rbp/ui";
import { grossProfit, type DealTotals } from "../pages/specifications/lineItemCalc";
import type { DiscountRow } from "../pages/specifications/mappers";

export function DiscountsAndTotals(props: {
  discounts: DiscountRow[];
  onAddDiscount: () => void;
  onUpdateDiscount: (key: string, patch: Partial<DiscountRow>) => void;
  onRemoveDiscount: (key: string) => void;
  totals: DealTotals;
  freightCost: number;
  // "Spec price" / "Order price": the sum of the lines before any discount.
  priceLabel: string;
  // The transport / customs surcharge cell (the offer edits it here, the order in its header).
  surcharge: ReactNode;
  disabled?: boolean;
}) {
  const { discounts, onAddDiscount, onUpdateDiscount, onRemoveDiscount, totals, freightCost, priceLabel, surcharge, disabled } = props;
  const gp = grossProfit(totals.netSales, totals.totalCost, freightCost);
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card
          title="Discounts"
          size="small"
          extra={
            !disabled && (
              <Button icon={<PlusOutlined />} onClick={onAddDiscount} size="small">
                Add
              </Button>
            )
          }
        >
          <Table dataSource={discounts} rowKey="key" pagination={false} size="small">
            <Table.Column
              title="Name"
              dataIndex="name"
              render={(v, record: DiscountRow) => <Input value={v} onChange={(e) => onUpdateDiscount(record.key, { name: e.target.value })} disabled={disabled} />}
            />
            <Table.Column
              title="Amount"
              width={90}
              align="center"
              render={(_, record: DiscountRow) => (
                <Switch
                  checkedChildren="Amt"
                  unCheckedChildren="%"
                  checked={record.discount_type === "amount"}
                  onChange={(checked) => onUpdateDiscount(record.key, { discount_type: checked ? "amount" : "pct" })}
                  disabled={disabled}
                />
              )}
            />
            <Table.Column
              title="Value"
              width={110}
              align="right"
              render={(_, record: DiscountRow) =>
                record.discount_type === "amount" ? (
                  <InputNumber value={record.amount} precision={2} onChange={(val) => onUpdateDiscount(record.key, { amount: val })} disabled={disabled} />
                ) : (
                  <InputNumber value={record.pct} addonAfter="%" onChange={(val) => onUpdateDiscount(record.key, { pct: val ?? 0 })} disabled={disabled} />
                )
              }
            />
            {!disabled && (
              <Table.Column
                title=""
                width={40}
                render={(_, record: DiscountRow) => <Button icon={<DeleteOutlined />} danger size="small" onClick={() => onRemoveDiscount(record.key)} />}
              />
            )}
          </Table>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="Totals" size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label={priceLabel}>{formatNumber(totals.grossPrice)}</Descriptions.Item>
            {/* Line discounts and the discounts above together. */}
            <Descriptions.Item label="Discounts">{formatNumber(-(totals.grossPrice - totals.priceAfterDiscounts))}</Descriptions.Item>
            <Descriptions.Item label="Price after discounts">{formatNumber(totals.priceAfterDiscounts)}</Descriptions.Item>
            <Descriptions.Item label="Transport / customs surcharge">{surcharge}</Descriptions.Item>
            <Descriptions.Item label="Net sales">
              <strong>{formatNumber(totals.netSales)}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Cost of goods">{formatNumber(totals.totalCost)}</Descriptions.Item>
            <Descriptions.Item label="Freight cost">{formatNumber(freightCost)}</Descriptions.Item>
            <Descriptions.Item label="Gross profit">
              <Typography.Text strong type={gp.value < 0 ? "danger" : undefined}>
                {formatNumber(gp.value)}
                {gp.pct != null && ` (${formatNumber(gp.pct)} %)`}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
    </Row>
  );
}
