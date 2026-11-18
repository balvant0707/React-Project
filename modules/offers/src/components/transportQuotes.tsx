// Ported 1:1 from the NPM tool (app/src/components/transportQuotes.tsx).
import { useEffect, useMemo, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { App as AntdApp, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, MailOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { loadCompanyOptions } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { invokeSupplierApi } from "./supplierApiButtons";
import { loadMailboxOptions, splitAddresses, type MailboxOption } from "../pages/specifications/availabilityPanel";
import {
  buildTransportMailHtml,
  defaultClosing,
  defaultIntro,
  defaultSubject,
  loadTransportMailContext,
  type TransportMailContext,
  type TransportMailKind,
} from "../modules/transport/mail";
import { DATE_FORMAT, formatDateTime } from "@rbp/ui";
import { errorText } from "@rbp/core";

// Forwarder quotes of a transport: ask several forwarders by email, enter their answers, award one (the others are
// rejected) and mail the confirmation / the notices. The mails go out through the supplier-api Edge Function from a
// mailbox; the data lives in transport_quotes (migration 20261023140000).


type Quote = {
  id: string;
  forwarder_company_id: string;
  status: "requested" | "quoted" | "declined" | "awarded" | "rejected";
  price: number | null;
  valid_until: string | null;
  notes: string | null;
  requested_at: string | null;
  confirmation_sent_at: string | null;
  rejection_sent_at: string | null;
  companies: { name: string; email: string | null } | null;
};

const STATUS_COLOR: Record<Quote["status"], string> = { requested: "blue", quoted: "gold", declined: "default", awarded: "green", rejected: "default" };

type Target = { forwarderId: string; name: string; email: string; quoteId?: string };

export function TransportQuotes({
  transportId,
  ensureTransport,
  specificationId,
  orderId,
  plannedDate,
  currency,
  disabled,
  onChanged,
}: {
  transportId: string | null;
  // Saves the transport first when it does not exist yet; returns its id.
  ensureTransport: () => Promise<string | null>;
  specificationId?: string | null;
  orderId?: string | null;
  plannedDate: string | null;
  currency?: string | null;
  disabled?: boolean;
  // The transport changed (an award sets forwarder and quoted cost): the panel reloads it.
  onChanged: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [modal, setModal] = useState<{ kind: TransportMailKind; targets: Target[]; chooseForwarders: boolean } | null>(null);

  const load = async () => {
    if (!transportId) {
      setQuotes([]);
      return;
    }
    const { data } = await supabaseClient
      .from("transport_quotes")
      .select("*, companies:forwarder_company_id(name, email)")
      .eq("transport_id", transportId)
      .order("created_at");
    setQuotes((data as any) ?? []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportId]);

  const patch = async (id: string, values: Partial<Quote>) => {
    const { error } = await supabaseClient.from("transport_quotes").update(values).eq("id", id);
    if (error) message.error(`Couldn't save: ${error.message}`);
    await load();
  };

  const award = async (q: Quote) => {
    const { error } = await supabaseClient.rpc("award_transport_quote", { p_quote_id: q.id });
    if (error) {
      message.error(errorText(error));
      return;
    }
    message.success(`${q.companies?.name ?? "Forwarder"} awarded`);
    await load();
    onChanged();
  };

  const mailTarget = (q: Quote): Target => ({ forwarderId: q.forwarder_company_id, name: q.companies?.name ?? "Forwarder", email: q.companies?.email ?? "", quoteId: q.id });

  const columns = [
    { title: "Forwarder", render: (_: unknown, q: Quote) => q.companies?.name ?? "-" },
    { title: "Status", width: 110, render: (_: unknown, q: Quote) => <Tag color={STATUS_COLOR[q.status]}>{q.status}</Tag> },
    {
      title: `Price${currency ? ` (${currency})` : ""}`,
      width: 140,
      render: (_: unknown, q: Quote) => (
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          precision={2}
          defaultValue={q.price ?? undefined}
          disabled={disabled || q.status === "declined"}
          onBlur={(e) => {
            const value = e.target.value === "" ? null : Number(e.target.value.replace(/,/g, ""));
            if (value !== q.price && (value == null || !Number.isNaN(value))) {
              patch(q.id, { price: value, ...(value != null && q.status === "requested" ? { status: "quoted" } : {}) });
            }
          }}
        />
      ),
    },
    {
      title: "Valid until",
      width: 140,
      render: (_: unknown, q: Quote) => (
        <DatePicker
          style={{ width: "100%" }}
          format={DATE_FORMAT}
          defaultValue={q.valid_until ? dayjs(q.valid_until) : null}
          disabled={disabled}
          onChange={(d) => patch(q.id, { valid_until: d ? d.format("YYYY-MM-DD") : null })}
        />
      ),
    },
    {
      title: "Notes",
      render: (_: unknown, q: Quote) => (
        <Input defaultValue={q.notes ?? ""} disabled={disabled} maxLength={300} onBlur={(e) => e.target.value !== (q.notes ?? "") && patch(q.id, { notes: e.target.value || null })} />
      ),
    },
    {
      title: "",
      width: 260,
      render: (_: unknown, q: Quote) =>
        disabled ? null : (
          <Space size={4} wrap>
            {(q.status === "requested" || q.status === "quoted") && (
              <Button size="small" onClick={() => patch(q.id, { status: "declined" })}>
                Declined
              </Button>
            )}
            {(q.status === "quoted" || q.status === "rejected") && q.price != null && (
              <Popconfirm title="Award the transport to this forwarder? The other quotes are rejected." onConfirm={() => award(q)}>
                <Button size="small" type="primary" icon={<CheckOutlined />}>
                  Award
                </Button>
              </Popconfirm>
            )}
            {q.status === "awarded" && (
              <Tooltip title={q.confirmation_sent_at ? `Sent ${formatDateTime(q.confirmation_sent_at)}` : undefined}>
                <Button size="small" icon={<MailOutlined />} onClick={() => setModal({ kind: "award", targets: [mailTarget(q)], chooseForwarders: false })}>
                  {q.confirmation_sent_at ? "Confirm again" : "Send confirmation"}
                </Button>
              </Tooltip>
            )}
            {q.status === "rejected" && q.price != null && (
              <Button size="small" icon={<MailOutlined />} onClick={() => setModal({ kind: "reject", targets: [mailTarget(q)], chooseForwarders: false })}>
                {q.rejection_sent_at ? "Notice sent" : "Send notice"}
              </Button>
            )}
          </Space>
        ),
    },
  ];

  return (
    <div style={{ marginTop: 24 }}>
      <Space style={{ marginBottom: 8, justifyContent: "space-between", width: "100%" }}>
        <Typography.Text strong>Forwarder quotes</Typography.Text>
        {!disabled && (
          <Button icon={<MailOutlined />} onClick={() => setModal({ kind: "request", targets: [], chooseForwarders: true })}>
            Request quotes
          </Button>
        )}
      </Space>
      <Table<Quote> size="small" rowKey="id" dataSource={quotes} columns={columns as any} pagination={false} locale={{ emptyText: "No quotes requested yet" }} scroll={{ x: true }} />
      {modal && (
        <TransportMailModal
          kind={modal.kind}
          initialTargets={modal.targets}
          chooseForwarders={modal.chooseForwarders}
          existingForwarderIds={quotes.filter((q) => q.status !== "requested" && q.status !== "declined").map((q) => q.forwarder_company_id)}
          ensureTransport={ensureTransport}
          specificationId={specificationId}
          orderId={orderId}
          plannedDate={plannedDate}
          price={modal.kind === "award" ? quotes.find((q) => q.id === modal.targets[0]?.quoteId)?.price ?? null : null}
          onClose={() => setModal(null)}
          onDone={() => {
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function TransportMailModal({
  kind,
  initialTargets,
  chooseForwarders,
  existingForwarderIds,
  ensureTransport,
  specificationId,
  orderId,
  plannedDate,
  price,
  onClose,
  onDone,
}: {
  kind: TransportMailKind;
  initialTargets: Target[];
  chooseForwarders: boolean;
  existingForwarderIds: string[];
  ensureTransport: () => Promise<string | null>;
  specificationId?: string | null;
  orderId?: string | null;
  plannedDate: string | null;
  price: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [form] = Form.useForm();
  const [ctx, setCtx] = useState<TransportMailContext | null>(null);
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [forwarderOptions, setForwarderOptions] = useState<{ value: string; label: string }[]>([]);
  const [targets, setTargets] = useState<Target[]>(initialTargets);
  const [sending, setSending] = useState(false);
  const values = Form.useWatch([], form);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [context, boxes, forwarders] = await Promise.all([
        loadTransportMailContext(specificationId, orderId, identity?.id),
        loadMailboxOptions(),
        chooseForwarders ? loadCompanyOptions("forwarder") : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setCtx(context);
      setMailboxes(boxes);
      setForwarderOptions(forwarders.filter((f) => !existingForwarderIds.includes(f.value)));
      form.setFieldsValue({
        mailbox_id: boxes.find((b) => b.connected)?.value ?? null,
        cc: context.userEmail ?? "",
        subject: defaultSubject(kind, context),
        intro: defaultIntro(kind),
        closing: defaultClosing(kind, context),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.id]);

  // Picking a forwarder fills its address from the company record (still editable below).
  const pick = async (ids: string[]) => {
    const { data } = await supabaseClient.from("companies").select("id, name, email").in("id", ids);
    const byId = new Map(((data ?? []) as any[]).map((c) => [c.id, c]));
    setTargets((prev) =>
      ids.map((id) => prev.find((t) => t.forwarderId === id) ?? { forwarderId: id, name: byId.get(id)?.name ?? "Forwarder", email: byId.get(id)?.email ?? "" }),
    );
  };

  const html = useMemo(
    () =>
      ctx && values
        ? buildTransportMailHtml(kind, ctx, values.intro ?? "", values.closing ?? "", { plannedDate, price })
        : "",
    [ctx, values, kind, plannedDate, price],
  );
  const selectedMailbox = mailboxes.find((m) => m.value === values?.mailbox_id);

  const send = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !ctx) return;
    if (targets.length === 0) {
      message.warning("Choose at least one forwarder");
      return;
    }
    const missing = targets.filter((t) => splitAddresses(t.email).length === 0);
    if (missing.length > 0) {
      message.warning(`No email address for ${missing.map((t) => t.name).join(", ")}`);
      return;
    }
    setSending(true);
    try {
      const transportId = kind === "request" ? await ensureTransport() : "n/a";
      if (!transportId) throw new Error("Save the transport first");
      // The default greeting is personalised per forwarder; an edited greeting is sent as written.
      const personalise = (name: string) => `${v.intro ?? ""}`.replace("Dear Sir or Madam", `Dear ${name}`);
      const failures: string[] = [];
      for (const t of targets) {
        const res = await invokeSupplierApi({
          action: "transport_email",
          kind,
          ...(kind === "request" ? { transport_id: transportId, forwarder_company_id: t.forwarderId } : { quote_id: t.quoteId }),
          mailbox_id: v.mailbox_id,
          to: splitAddresses(t.email),
          cc: splitAddresses(v.cc ?? ""),
          subject: v.subject,
          body_html: buildTransportMailHtml(kind, ctx, personalise(t.name), v.closing ?? "", { plannedDate, price }),
        });
        if (!res.ok) failures.push(`${t.name}: ${res.error ?? "failed"}`);
        else if (res.warning) message.warning(res.warning);
      }
      if (failures.length > 0) message.error(failures.join("; "), 8);
      else message.success(targets.length === 1 ? "Email sent" : `${targets.length} emails sent`);
      onDone();
      if (failures.length === 0) onClose();
    } catch (e: any) {
      message.error(errorText(e, "Could not send"));
    } finally {
      setSending(false);
    }
  };

  const title = { request: "Request transport quotes", award: "Confirm the transport order", reject: "Notify a forwarder" }[kind];

  return (
    <Modal
      title={title}
      open
      onCancel={onClose}
      width={900}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Tooltip key="send" title={selectedMailbox?.connected ? undefined : "No connected mailbox selected"}>
          <Button type="primary" icon={<MailOutlined />} onClick={send} loading={sending} disabled={!ctx || !selectedMailbox?.connected}>
            {targets.length > 1 ? `Send ${targets.length} emails` : "Send email"}
          </Button>
        </Tooltip>,
      ]}
    >
      <Form form={form} layout="vertical">
        {chooseForwarders && (
          <Form.Item label="Forwarders" extra="Each forwarder gets its own email; they do not see each other.">
            <Select
              mode="multiple"
              options={forwarderOptions}
              optionFilterProp="label"
              placeholder="Companies of the type Forwarder"
              value={targets.map((t) => t.forwarderId)}
              onChange={pick}
            />
          </Form.Item>
        )}
        {targets.map((t) => (
          <Form.Item key={t.forwarderId} label={`To: ${t.name}`} style={{ marginBottom: 8 }}>
            <Input
              value={t.email}
              placeholder="email address(es), separated by comma"
              onChange={(e) => setTargets((prev) => prev.map((x) => (x.forwarderId === t.forwarderId ? { ...x, email: e.target.value } : x)))}
            />
          </Form.Item>
        ))}
        <Form.Item label="Send from" name="mailbox_id" rules={[{ required: true }]}>
          <Select options={mailboxes.map((m) => ({ value: m.value, label: m.label }))} />
        </Form.Item>
        <Form.Item label="Cc" name="cc">
          <Input />
        </Form.Item>
        <Form.Item label="Subject" name="subject" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Introduction" name="intro">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="Closing" name="closing">
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">Preview (the details table is added automatically)</Typography.Text>
      <div style={{ border: "1px solid rgba(128,128,128,.3)", borderRadius: 6, padding: 12, marginTop: 4, maxHeight: 280, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: html }} />
    </Modal>
  );
}
