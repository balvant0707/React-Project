// Ported 1:1 from the NPM tool (app/src/components/supplierApiButtons.tsx).
import { useCallback, useEffect, useState } from "react";
import { Button, DatePicker, Form, Input, Modal, Select, Tooltip, message } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined, SendOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { supabaseClient } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";
import { PortSelect, usePorts } from "./portSelect";
import { DateRangeFields } from "./dateRangeFields";
import { useSupplierConnection, usesSupplierApi, type SupplierConnection } from "@rbp/module-companies/src/modules/companies/supplierConnection.ts";
import { errorText } from "@rbp/core";

// Explicit buttons that send an availability request / order to a supplier whose system has an API
// (companies.supplier_api_adapter; ~/npm_tool/docs/supplier-api-integration.md). The work happens in the
// `supplier-api` Edge Function; these only show state and trigger it. A supplier without an adapter
// gets no button here - availability goes by email or phone instead (pages/specifications/availabilityPanel.tsx).

type CallRow = { success: boolean; error_message: string | null; created_at: string; action: string };

const SENT_STYLE = { borderColor: "#52c41a", color: "#389e0d" } as const;

function useHasAdapter(supplierId: string | null | undefined, connection?: SupplierConnection | null) {
  return usesSupplierApi(useSupplierConnection(supplierId, connection));
}

function useCountryOptions(enabled: boolean) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!enabled || options.length > 0) return;
    supabaseClient
      .from("countries")
      .select("id, name_en")
      .order("name_en")
      .then(({ data }) => setOptions((data ?? []).map((c: any) => ({ value: c.id, label: c.name_en }))));
  }, [enabled, options.length]);
  return options;
}

export async function invokeSupplierApi(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const { data, error } = await supabaseClient.functions.invoke("supplier-api", { body });
  if (error) {
    // A non-2xx response still carries our JSON body (missing fields, auth, ...).
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json().catch(() => null);
      if (parsed?.error) return { ok: false, error: parsed.error };
    }
    return { ok: false, error: error.message };
  }
  return data as { ok: boolean; error?: string; warning?: string };
}

async function latestCall(entityType: string, entityId: string): Promise<CallRow | null> {
  const { data } = await supabaseClient
    .from("supplier_api_calls")
    .select("success, error_message, created_at, action")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CallRow | null) ?? null;
}

export function AvailabilityRequestButton({
  specificationId,
  supplierId,
  connection,
  beforeStart,
  onSent,
}: {
  specificationId: string;
  supplierId: string | null | undefined;
  // The supplier's connection when the page already loaded it (else it is looked up here).
  connection?: SupplierConnection | null;
  // Called before the dialog opens (e.g. saves the page); false cancels.
  beforeStart?: () => Promise<boolean>;
  onSent?: () => void;
}) {
  const hasAdapter = useHasAdapter(supplierId, connection);
  const countryOptions = useCountryOptions(hasAdapter);
  const { ports, reload: reloadPorts } = usePorts();
  const [form] = Form.useForm();
  const [request, setRequest] = useState<any>(null);
  const [lastCall, setLastCall] = useState<CallRow | null>(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!supplierId) return;
    const { data } = await supabaseClient
      .from("availability_requests")
      .select("id, request_number, supplier_enquiry_number, estimated_arrival, requested_at")
      .eq("specification_id", specificationId)
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRequest(data);
    setLastCall(data ? await latestCall("availability_requests", data.id) : null);
  }, [specificationId, supplierId]);

  useEffect(() => {
    if (hasAdapter) load();
  }, [hasAdapter, load]);

  if (!hasAdapter) return null;

  const sent = !!request?.requested_at;
  const failed = lastCall != null && !lastCall.success;

  // The API needs port, country and arrival. They are optional on the specification itself, so they
  // are asked for here (prefilled from the specification) and saved back to it on send.
  const openModal = async () => {
    if (beforeStart && !(await beforeStart())) return;
    const { data: spec } = await supabaseClient
      .from("specifications")
      .select("port_id, location_country_id, delivery_date")
      .eq("id", specificationId)
      .maybeSingle();
    const arrival = request?.estimated_arrival ?? spec?.delivery_date;
    form.setFieldsValue({
      estimated_arrival: arrival ? dayjs(arrival) : null,
      port_id: spec?.port_id ?? null,
      location_country_id: spec?.location_country_id ?? null,
    });
    setOpen(true);
  };

  const send = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSending(true);
    const { error: saveError } = await supabaseClient
      .from("specifications")
      .update({ port_id: values.port_id, location_country_id: values.location_country_id })
      .eq("id", specificationId);
    if (saveError) {
      setSending(false);
      message.error(errorText(saveError));
      return;
    }
    const res = await invokeSupplierApi({
      action: "availability_send",
      specification_id: specificationId,
      estimated_arrival: (values.estimated_arrival as Dayjs).format("YYYY-MM-DD"),
    });
    setSending(false);
    if (res.ok) {
      message.success(sent ? "Availability request updated" : "Availability request sent");
      setOpen(false);
    } else {
      message.error(res.error ?? "Could not send the request");
    }
    load();
    onSent?.();
  };

  const tooltip = failed
      ? `Last attempt failed (${formatDateTime(lastCall!.created_at)}): ${lastCall!.error_message ?? "unknown error"}`
      : sent
        ? `Sent ${formatDateTime(request.requested_at)} as ${request.request_number}${request.supplier_enquiry_number ? ` (supplier ${request.supplier_enquiry_number})` : ""}. Click to send changes.`
        : "Send the line items to the supplier to ask for availability.";

  return (
    <>
      <Tooltip title={tooltip}>
        <Button
          danger={failed}
          style={!failed && sent ? SENT_STYLE : undefined}
          icon={failed ? <ExclamationCircleOutlined /> : sent ? <CheckCircleOutlined /> : <SendOutlined />}
          onClick={openModal}
        >
          {sent ? "Update Availability Request" : "Request Availability"}
        </Button>
      </Tooltip>
      <Modal
        title={sent ? "Update availability request" : "Request availability"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={send}
        okText={sent ? "Send update" : "Send request"}
        okButtonProps={{ loading: sending }}
        destroyOnHidden
      >
        <div style={{ opacity: 0.65, marginBottom: 16 }}>
          The supplier needs the port, country and arrival date. They are saved on the specification.
        </div>
        <Form form={form} layout="vertical">
          <Form.Item label="Port" name="port_id" rules={[{ required: true, message: "Port is required" }]}>
            <PortSelect
              ports={ports}
              reloadPorts={reloadPorts}
              onCountryResolved={(countryId) => {
                if (countryId) form.setFieldValue("location_country_id", countryId);
              }}
            />
          </Form.Item>
          <Form.Item label="Country" name="location_country_id" rules={[{ required: true, message: "Country is required" }]}>
            <Select options={countryOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item label="Estimated arrival of the vessel" name="estimated_arrival" rules={[{ required: true, message: "Arrival date is required" }]}>
            <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
          </Form.Item>
        </Form>
        <div style={{ opacity: 0.65 }}>
          Sends the current line items (packs, no prices){request ? ` under ${request.request_number}` : ""}.
        </div>
      </Modal>
    </>
  );
}

export function SendOrderToSupplierButton({
  orderId,
  supplierId,
  onSent,
  dirty,
}: {
  orderId: string;
  supplierId: string | null | undefined;
  onSent: () => void;
  dirty?: boolean;
}) {
  const hasAdapter = useHasAdapter(supplierId);
  const countryOptions = useCountryOptions(hasAdapter);
  const [form] = Form.useForm();
  const [lastCall, setLastCall] = useState<CallRow | null>(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => setLastCall(await latestCall("orders", orderId)), [orderId]);
  useEffect(() => {
    if (hasAdapter) load();
  }, [hasAdapter, load]);

  if (!hasAdapter) return null;

  const sent = lastCall?.success === true && lastCall.action === "order_confirm";
  const failed = lastCall != null && !lastCall.success;

  // Port, country and date are optional on the order; the API needs them. Prefilled from the order, else
  // from its specification, and saved on the order on send.
  const openModal = async () => {
    const { data: order } = (await supabaseClient
      .from("orders")
      .select("delivery_port, delivery_country_id, requested_date_from, requested_date, specifications(location_country_id, ports(name))")
      .eq("id", orderId)
      .maybeSingle()) as any;
    form.setFieldsValue({
      delivery_port: order?.delivery_port ?? order?.specifications?.ports?.name ?? "",
      delivery_country_id: order?.delivery_country_id ?? order?.specifications?.location_country_id ?? null,
      requested_date_from: order?.requested_date_from ? dayjs(order.requested_date_from) : null,
      requested_date: order?.requested_date ? dayjs(order.requested_date) : null,
    });
    setOpen(true);
  };

  const send = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSending(true);
    const { error: saveError } = await supabaseClient
      .from("orders")
      .update({
        delivery_port: values.delivery_port.trim(),
        delivery_country_id: values.delivery_country_id,
        requested_date_from: values.requested_date_from ? (values.requested_date_from as Dayjs).format("YYYY-MM-DD") : null,
        requested_date: (values.requested_date as Dayjs).format("YYYY-MM-DD"),
      })
      .eq("id", orderId);
    if (saveError) {
      setSending(false);
      message.error(errorText(saveError));
      return;
    }
    const res = await invokeSupplierApi({ action: "order_send", order_id: orderId });
    setSending(false);
    if (res.ok) {
      message.success("Order sent to the supplier");
      setOpen(false);
      onSent();
    } else {
      message.error(res.error ?? "Could not send the order");
    }
    load();
  };

  const tooltip = dirty
    ? "Save the order first - it is sent as saved."
    : failed
      ? `Last attempt failed (${formatDateTime(lastCall!.created_at)}): ${lastCall!.error_message ?? "unknown error"}`
      : sent
        ? `Sent to the supplier ${formatDateTime(lastCall!.created_at)}.`
        : "Confirm this order with the supplier through their API.";

  return (
    <>
      <Tooltip title={tooltip}>
        {sent ? (
          <Button style={SENT_STYLE} icon={<CheckCircleOutlined />} disabled>
            Sent to Supplier
          </Button>
        ) : (
          <Button danger={failed} icon={failed ? <ExclamationCircleOutlined /> : <SendOutlined />} disabled={dirty} onClick={openModal}>
            {failed ? "Retry Send to Supplier" : "Send to Supplier"}
          </Button>
        )}
      </Tooltip>
      <Modal
        title="Send order to supplier"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={send}
        okText="Send order"
        okButtonProps={{ loading: sending }}
        destroyOnHidden
      >
        <div style={{ opacity: 0.65, marginBottom: 16 }}>
          The supplier needs the delivery port, country and date. They are saved on the order.
        </div>
        <Form form={form} layout="vertical">
          <Form.Item label="Delivery port" name="delivery_port" rules={[{ required: true, whitespace: true, message: "Port is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Delivery country" name="delivery_country_id" rules={[{ required: true, message: "Country is required" }]}>
            <Select options={countryOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <DateRangeFields label="Requested date" fromName="requested_date_from" toName="requested_date" toRequired />
        </Form>
      </Modal>
    </>
  );
}
