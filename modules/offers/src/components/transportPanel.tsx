// Ported 1:1 from the NPM tool (app/src/components/transportPanel.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Alert, Button, Card, Col, ConfigProvider, DatePicker, Form, Input, InputNumber, Row, Select } from "antd";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { loadCompanyOptions } from "@rbp/module-companies/src/modules/companies/companies.ts";
import type { PhraseOption as Option } from "@rbp/core";
import { TransportQuotes } from "./transportQuotes";
import { DATE_FORMAT } from "@rbp/ui";

// Transportation of one deal: a single transport record shared by the offer and the order (it is created on the
// offer; the first order of the offer takes it over, see migration 20261023130000). The freight cost is always
// ours; passing it on to the customer is the transport / customs surcharge of the offer. Saved on its own button,
// independent of the page's own Save.


type TransportRow = {
  id: string;
  forwarder_company_id: string | null;
  planned_date: string | null;
  tracking_number: string | null;
  freight_cost_estimated: number | null;
  freight_cost_quoted: number | null;
  freight_cost_actual: number | null;
  notes: string | null;
};

export function TransportPanel({
  specificationId,
  orderId,
  disabled,
  currency,
  incotermCode,
  onCostChange,
}: {
  // On an order page both are given (the transport keeps its specification); on an offer only the specification.
  specificationId?: string | null;
  orderId?: string | null;
  disabled?: boolean;
  currency?: string | null;
  incotermCode?: string | null;
  // The freight cost the deal calculates with: the actual cost once known, else the awarded quote, else the estimate.
  onCostChange?: (cost: number) => void;
}) {
  const { message } = AntdApp.useApp();
  // component={false}: this panel sits inside the page's own <Form>; no nested <form> element.
  const [form] = Form.useForm();
  const [row, setRow] = useState<TransportRow | null>(null);
  const [forwarders, setForwarders] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const estimated = Form.useWatch("freight_cost_estimated", form);
  const actual = Form.useWatch("freight_cost_actual", form);
  const quoted = row?.freight_cost_quoted ?? null;
  useEffect(() => {
    onCostChange?.(actual ?? quoted ?? estimated ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimated, quoted, actual]);

  useEffect(() => {
    loadCompanyOptions("forwarder").then(setForwarders);
  }, []);

  const load = async () => {
    if (!orderId && !specificationId) return;
    let query = supabaseClient.from("transports").select("*");
    query = orderId ? query.eq("order_id", orderId) : query.eq("specification_id", specificationId!).order("created_at");
    const { data } = await query.limit(1).maybeSingle();
    const r = (data as TransportRow | null) ?? null;
    setRow(r);
    form.resetFields();
    form.setFieldsValue(r ? { ...r, planned_date: r.planned_date ? dayjs(r.planned_date) : null } : {});
    setDirty(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, specificationId]);

  // Saves the form (creating the record on the first save) and returns the record id; used by Save and by the quote mails.
  const save = async (): Promise<string | null> => {
    const v = form.getFieldsValue();
    const payload = {
      forwarder_company_id: v.forwarder_company_id ?? null,
      planned_date: v.planned_date ? v.planned_date.format("YYYY-MM-DD") : null,
      tracking_number: v.tracking_number?.trim() || null,
      freight_cost_estimated: v.freight_cost_estimated ?? null,
      freight_cost_actual: v.freight_cost_actual ?? null,
      notes: v.notes?.trim() || null,
    };
    setSaving(true);
    let id = row?.id ?? null;
    let error: { message: string } | null;
    if (row) {
      ({ error } = await supabaseClient.from("transports").update(payload).eq("id", row.id));
    } else {
      const res = await supabaseClient
        .from("transports")
        .insert({ ...payload, specification_id: specificationId ?? null, order_id: orderId ?? null })
        .select("id")
        .single();
      error = res.error;
      id = (res.data as any)?.id ?? null;
    }
    setSaving(false);
    if (error) {
      message.error(`Couldn't save the transport: ${error.message}`);
      return null;
    }
    message.success("Transport saved");
    await load();
    return id;
  };

  const suffix = currency ?? "";

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      {incotermCode === "EXW" && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Incoterm EXW: the customer collects the goods, no transport is organised by us. Nothing needs to be entered here."
        />
      )}
      <Form form={form} component={false} layout="vertical" disabled={disabled} onValuesChange={() => setDirty(true)}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Forwarder" name="forwarder_company_id">
              <Select options={forwarders} showSearch optionFilterProp="label" allowClear placeholder="Companies of the type Forwarder" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Planned date" name="planned_date">
              <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Tracking number" name="tracking_number">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Freight cost, estimated" name="freight_cost_estimated" tooltip="Used for the gross profit until the actual cost is known.">
              <InputNumber style={{ width: "100%" }} min={0} precision={2} addonAfter={suffix || undefined} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Freight cost, quoted" tooltip="Set when a forwarder quote is awarded; replaces the estimate in the gross profit.">
              <InputNumber style={{ width: "100%" }} value={row?.freight_cost_quoted ?? undefined} readOnly addonAfter={suffix || undefined} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Freight cost, actual" name="freight_cost_actual" tooltip="Entered after the delivery; replaces the quote and the estimate in the gross profit.">
              <InputNumber style={{ width: "100%" }} min={0} precision={2} addonAfter={suffix || undefined} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item label="Notes" name="notes">
              <Input.TextArea rows={3} maxLength={1000} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
      {!disabled && (
        <Button type="primary" onClick={() => save()} loading={saving} disabled={!dirty && !!row}>
          Save transport
        </Button>
      )}
      {/* The page form around this panel may be frozen (accepted offer); the transport follows its own disabled flag. */}
      <ConfigProvider componentDisabled={!!disabled}>
        <TransportQuotes
          transportId={row?.id ?? null}
          ensureTransport={async () => row?.id ?? (await save())}
          specificationId={specificationId}
          orderId={orderId}
          plannedDate={form.getFieldValue("planned_date") ? form.getFieldValue("planned_date").format("YYYY-MM-DD") : null}
          currency={currency}
          disabled={disabled}
          onChanged={load}
        />
      </ConfigProvider>
    </Card>
  );
}
