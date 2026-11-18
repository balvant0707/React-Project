// Ported 1:1 from the NPM tool (app/src/pages/specifications/availabilityPanel.tsx).
import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Button, Card, DatePicker, Dropdown, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CopyOutlined,
  ExclamationCircleFilled,
  DownOutlined,
  MailOutlined,
  MinusCircleFilled,
  FormOutlined,
  QuestionCircleOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { supabaseClient } from "@rbp/core";
import { formatDate, formatDateTime, DATE_FORMAT } from "@rbp/ui";
import { formatNumber } from "@rbp/ui";
import { useGetIdentity } from "@rbp/core";
import { invokeSupplierApi } from "../../components/supplierApiButtons";
import type { SupplierConnectionMethod } from "@rbp/module-companies/src/modules/companies/supplierConnection.ts";
import { escapeHtml, paragraphs } from "@rbp/ui";
import type { PackagingInfo } from "./areasEditor";
import {
  CHANNEL_LABELS,
  availabilityState,
  availabilityTone,
  type AvailabilityLine,
  type AvailabilityRequest,
  type AvailabilityState,
  type LineAvailability,
} from "./availability";
import { errorText } from "@rbp/core";

// Availability on the Paint List: the line's Availability cell (+ its single-line modal), the requests card
// (+ the answer dialog), and the header menu for requests without an API (email via Graph or copied, phone).
// Data: ./availability.ts; write path: the RPCs of migration 20261022100000 and the supplier-api Edge Function.


const STATE_ICON: Record<AvailabilityState, React.ReactNode> = {
  available: <CheckCircleFilled style={{ color: "#52c41a" }} />,
  partial: <MinusCircleFilled style={{ color: "#faad14" }} />,
  unavailable: <CloseCircleFilled style={{ color: "#ff4d4f" }} />,
  pending: <QuestionCircleOutlined style={{ opacity: 0.6 }} />,
};

const TONE_COLOR = { green: "#52c41a", yellow: "#faad14", red: "#ff4d4f" } as const;

const rpcError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

// ---------------------------------------------------------------------
// Availability column
// ---------------------------------------------------------------------

export function AvailabilityCell({
  availability,
  unit,
  userName,
  onEdit,
  editDisabledReason,
  deliveryDate,
}: {
  availability: LineAvailability | undefined;
  unit: string;
  // End of the offer's delivery window: an answer for a later date is coloured yellow / red.
  deliveryDate?: string | null;
  userName: (id: string | null | undefined) => string;
  onEdit?: () => void;
  // Shown instead of opening the modal (unsaved line, no supplier, ...).
  editDisabledReason?: string;
}) {
  const state = availability ? availabilityState(availability) : null;
  const { tone, lateDays } = availability ? availabilityTone(availability, deliveryDate) : { tone: "none" as const, lateDays: 0 };
  // Available but too late shows a warning sign instead of the tick; partly / not available keep their icons, in red.
  const icon =
    tone === "none" || !state
      ? state && STATE_ICON[state]
      : lateDays > 0
        ? <ExclamationCircleFilled style={{ color: TONE_COLOR[tone as "yellow" | "red"] }} />
        : state === "partial"
          ? <MinusCircleFilled style={{ color: TONE_COLOR.red }} />
          : STATE_ICON[state];
  const status = !availability ? (
    <Typography.Text type="secondary">–</Typography.Text>
  ) : state === "pending" ? (
    <Space size={4}>
      {STATE_ICON.pending}
      <Typography.Text type="secondary">requested</Typography.Text>
    </Space>
  ) : (
    <Space size={4}>
      {icon}
      <span>
        {formatNumber(availability.confirmed_qty)} {unit}
        {availability.confirmed_date ? (
          <span style={lateDays > 0 ? { color: TONE_COLOR[tone as "yellow" | "red"], fontWeight: 500 } : undefined}>
            {` · ${dayjs(availability.confirmed_date).format("DD.MM.")}`}
          </span>
        ) : (
          ""
        )}
      </span>
    </Space>
  );
  // The supplier's comment of the answer shows on the line itself (full text in the tooltip).
  const content = availability?.comment ? (
    <>
      {status}
      <Typography.Text type="secondary" ellipsis style={{ display: "block", fontSize: 12, maxWidth: 220, whiteSpace: "nowrap" }}>
        {availability.comment}
      </Typography.Text>
    </>
  ) : (
    status
  );
  const tooltip = availability ? (
    <>
      <div>
        {availability.request.request_number} ({CHANNEL_LABELS[availability.request.channel]}), asked {formatNumber(availability.requested_qty)} {unit}
      </div>
      {availability.answered_at && (
        <div>
          Answer entered {formatDateTime(availability.answered_at)} by {userName(availability.answered_by_user_id)}
        </div>
      )}
      {lateDays > 0 && deliveryDate && (
        <div>
          Confirmed for {formatDate(availability.confirmed_date)}: {lateDays} day{lateDays === 1 ? "" : "s"} after the delivery date {formatDate(deliveryDate)}
        </div>
      )}
      {availability.comment && <div>“{availability.comment}”</div>}
      {editDisabledReason ? <div>{editDisabledReason}</div> : onEdit && <div>Click to change</div>}
    </>
  ) : (
    editDisabledReason ?? (onEdit ? "Not asked yet - click to enter the availability" : undefined)
  );
  const clickable = !!onEdit && !editDisabledReason;
  return (
    <Tooltip title={tooltip}>
      <span
        role={clickable ? "button" : undefined}
        style={{ cursor: clickable ? "pointer" : undefined, whiteSpace: "nowrap", display: "inline-block" }}
        onClick={clickable ? onEdit : undefined}
      >
        {content}
      </span>
    </Tooltip>
  );
}

// One line's availability, written to its latest sent request (or added to one; set_line_item_availability).
export function LineAvailabilityModal({
  open,
  lineItemId,
  label,
  unit,
  currentQuantity,
  availability,
  onClose,
  onSaved,
}: {
  open: boolean;
  lineItemId: string | null;
  label: string;
  unit: string;
  currentQuantity: number | null;
  availability: LineAvailability | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const asked = availability?.requested_qty ?? currentQuantity ?? null;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      confirmed_qty: availability?.confirmed_qty ?? null,
      confirmed_date: availability?.confirmed_date ? dayjs(availability.confirmed_date) : null,
      comment: availability?.comment ?? "",
    });
  }, [open, availability, form]);

  const save = async (clear = false) => {
    if (!lineItemId) return;
    const values = clear ? { confirmed_qty: null, confirmed_date: null, comment: "" } : form.getFieldsValue();
    setSaving(true);
    try {
      const { error } = await supabaseClient.rpc("set_line_item_availability", {
        p_specification_line_item_id: lineItemId,
        p_confirmed_qty: values.confirmed_qty ?? null,
        p_confirmed_date: values.confirmed_date ? (values.confirmed_date as Dayjs).format("YYYY-MM-DD") : null,
        p_comment: values.comment ?? null,
      });
      rpcError(error);
      message.success("Availability saved");
      onSaved();
      onClose();
    } catch (e: any) {
      message.error(errorText(e, "Could not save the availability"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Availability"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="clear" danger onClick={() => save(true)} disabled={availability?.confirmed_qty == null} loading={saving}>
          Clear answer
        </Button>,
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={() => save()} loading={saving}>
          Save
        </Button>,
      ]}
    >
      <Typography.Paragraph>
        <strong>{label}</strong>
        <br />
        {availability
          ? `Asked ${formatNumber(asked)} ${unit} in ${availability.request.request_number} (${CHANNEL_LABELS[availability.request.channel]}).`
          : "Not asked yet: the answer is added to the latest availability request (a manual one is created if there is none)."}
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Space align="end" wrap>
          <Form.Item label={`Confirmed quantity (${unit})`} name="confirmed_qty" style={{ marginBottom: 12 }}>
            <InputNumber min={0} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button onClick={() => form.setFieldValue("confirmed_qty", asked)} disabled={asked == null}>
              All available
            </Button>
            <Button onClick={() => form.setFieldValue("confirmed_qty", 0)} style={{ marginLeft: 8 }}>
              Not available
            </Button>
          </Form.Item>
        </Space>
        <Form.Item label="Available from" name="confirmed_date">
          <DatePicker format={DATE_FORMAT} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item label="Supplier comment" name="comment">
          <Input maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Answer dialog for a whole request
// ---------------------------------------------------------------------

type AnswerRow = { id: string; confirmed_qty: number | null; confirmed_date: Dayjs | null; comment: string };

// The offer's "to be accepted by" moment, often given with the supplier's answer: shown in the response dialog and
// saved with it (the page writes specifications.valid_until_at).
export type OfferValidUntil = { value: string | null; save: (iso: string | null) => Promise<void> };

function AnswerModal({
  request,
  packagingById,
  validUntil,
  onClose,
  onSaved,
}: {
  request: AvailabilityRequest | null;
  packagingById: Map<string, PackagingInfo>;
  validUntil?: OfferValidUntil;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [rows, setRows] = useState<AnswerRow[]>([]);
  const [supplierReference, setSupplierReference] = useState("");
  const [allDate, setAllDate] = useState<Dayjs | null>(null);
  const [acceptBy, setAcceptBy] = useState<Dayjs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request) return;
    setRows(
      request.availability_request_lines.map((l) => ({
        id: l.id,
        confirmed_qty: l.confirmed_qty,
        confirmed_date: l.confirmed_date ? dayjs(l.confirmed_date) : null,
        comment: l.comment ?? "",
      })),
    );
    setSupplierReference(request.supplier_enquiry_number ?? "");
    setAllDate(request.estimated_arrival ? dayjs(request.estimated_arrival) : null);
    setAcceptBy(validUntil?.value ? dayjs(validUntil.value) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const linesById = useMemo(() => new Map((request?.availability_request_lines ?? []).map((l) => [l.id, l])), [request]);
  const update = (id: string, patch: Partial<AnswerRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const allAvailable = () =>
    setRows((rs) => rs.map((r) => ({ ...r, confirmed_qty: linesById.get(r.id)?.requested_qty ?? r.confirmed_qty, confirmed_date: allDate ?? r.confirmed_date })));

  const save = async () => {
    if (!request) return;
    setSaving(true);
    try {
      const { error } = await supabaseClient.rpc("save_availability_answers", {
        p_request_id: request.id,
        p_lines: rows.map((r) => ({
          id: r.id,
          confirmed_qty: r.confirmed_qty,
          confirmed_date: r.confirmed_date ? r.confirmed_date.format("YYYY-MM-DD") : null,
          comment: r.comment,
        })),
        p_supplier_enquiry_number: supplierReference,
      });
      rpcError(error);
      // The answers are stored now; the offer's validity is a second write that may fail on its own (e.g. the offer
      // was locked meanwhile) - say so precisely instead of reporting the whole response as failed.
      const acceptByIso = acceptBy ? acceptBy.toISOString() : null;
      let validityError: string | null = null;
      if (validUntil && acceptByIso !== (validUntil.value ? dayjs(validUntil.value).toISOString() : null)) {
        try {
          await validUntil.save(acceptByIso);
        } catch (e: any) {
          validityError = errorText(e, "unknown error");
        }
      }
      if (validityError) message.warning(`Availability response saved, but the offer's valid-until could not be changed: ${validityError}`);
      else message.success("Availability response saved");
      onSaved();
      onClose();
    } catch (e: any) {
      message.error(errorText(e, "Could not save the availability response"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={request ? `Availability response - ${request.request_number}` : "Availability response"}
      open={!!request}
      onCancel={onClose}
      onOk={save}
      okText="Save"
      okButtonProps={{ loading: saving }}
      width={900}
      destroyOnHidden
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <span>Supplier reference</span>
        <Input value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} style={{ width: 180 }} />
        <span style={{ marginLeft: 16 }}>Available from</span>
        <DatePicker value={allDate} onChange={setAllDate} format={DATE_FORMAT} />
        <Button onClick={allAvailable}>All available</Button>
        {validUntil && (
          <>
            <Tooltip title="The offer's Valid until: the customer has to accept by this date and time (often given by the supplier's answer).">
              <span style={{ marginLeft: 16 }}>Offer to be accepted by</span>
            </Tooltip>
            <DatePicker value={acceptBy} onChange={setAcceptBy} showTime={{ format: "HH:mm" }} format={`${DATE_FORMAT} HH:mm`} />
          </>
        )}
      </Space>
      <Table dataSource={rows} rowKey="id" pagination={false} size="small">
        <Table.Column
          title="Product"
          render={(_, r: AnswerRow) => packagingById.get(linesById.get(r.id)?.product_packaging_id ?? "")?.label ?? "?"}
        />
        <Table.Column
          title="Asked"
          align="right"
          width={100}
          render={(_, r: AnswerRow) => {
            const line = linesById.get(r.id);
            return `${formatNumber(line?.requested_qty)} ${packagingById.get(line?.product_packaging_id ?? "")?.unit ?? ""}`;
          }}
        />
        <Table.Column
          title="Confirmed"
          width={120}
          render={(_, r: AnswerRow) => <InputNumber min={0} value={r.confirmed_qty} onChange={(v) => update(r.id, { confirmed_qty: v })} style={{ width: "100%" }} />}
        />
        <Table.Column
          title="Available from"
          width={140}
          render={(_, r: AnswerRow) => <DatePicker value={r.confirmed_date} onChange={(v) => update(r.id, { confirmed_date: v })} format={DATE_FORMAT} />}
        />
        <Table.Column
          title="Comment"
          render={(_, r: AnswerRow) => <Input value={r.comment} maxLength={200} onChange={(e) => update(r.id, { comment: e.target.value })} />}
        />
      </Table>
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
        A line without a confirmed quantity stays unanswered.
      </Typography.Paragraph>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Requests card (Paint List tab)
// ---------------------------------------------------------------------

export function AvailabilityRequestsCard({
  requests,
  packagingById,
  userName,
  canEdit,
  validUntil,
  onChanged,
}: {
  requests: AvailabilityRequest[];
  packagingById: Map<string, PackagingInfo>;
  userName: (id: string | null | undefined) => string;
  canEdit: boolean;
  validUntil?: OfferValidUntil;
  onChanged: () => void;
}) {
  const [answering, setAnswering] = useState<AvailabilityRequest | null>(null);
  if (requests.length === 0) return null;

  const answered = (r: AvailabilityRequest) => r.availability_request_lines.filter((l) => l.confirmed_qty != null);
  const lastAnswer = (lines: AvailabilityLine[]) =>
    lines.reduce<AvailabilityLine | null>((best, l) => (!best || (l.answered_at ?? "") > (best.answered_at ?? "") ? l : best), null);

  return (
    <Card title="Availability requests" size="small" style={{ marginBottom: 16 }}>
      <Table dataSource={requests} rowKey="id" pagination={false} size="small">
        <Table.Column title="Request" dataIndex="request_number" width={160} />
        <Table.Column title="Channel" dataIndex="channel" width={130} render={(v: AvailabilityRequest["channel"]) => CHANNEL_LABELS[v]} />
        <Table.Column
          title="Sent"
          render={(_, r: AvailabilityRequest) =>
            r.requested_at ? `${formatDateTime(r.requested_at)} by ${userName(r.requested_by_user_id)}` : <Tag>Not sent</Tag>
          }
        />
        <Table.Column title="ETA" dataIndex="estimated_arrival" width={110} render={formatDate} />
        <Table.Column
          title="Answered"
          render={(_, r: AvailabilityRequest) => {
            const done = answered(r);
            const last = lastAnswer(done);
            if (!r.requested_at) return null;
            return (
              <span>
                {done.length} / {r.availability_request_lines.length} lines
                {last?.answered_at ? `, ${formatDateTime(last.answered_at)} (${userName(last.answered_by_user_id)})` : ""}
              </span>
            );
          }}
        />
        <Table.Column title="Supplier ref." dataIndex="supplier_enquiry_number" width={130} />
        {canEdit && (
          <Table.Column
            title=""
            width={140}
            render={(_, r: AvailabilityRequest) =>
              r.requested_at && (
                <Button size="small" onClick={() => setAnswering(r)}>
                  {answered(r).length > 0 ? "Edit response" : "Availability response"}
                </Button>
              )
            }
          />
        )}
      </Table>
      <AnswerModal request={answering} packagingById={packagingById} validUntil={validUntil} onClose={() => setAnswering(null)} onSaved={onChanged} />
    </Card>
  );
}

// ---------------------------------------------------------------------
// Requests without an API: email (Graph, or copied by hand) and phone
// ---------------------------------------------------------------------

type EmailLine = {
  line_number: number;
  requested_qty: number;
  supplier_key: string | null;
  code: string | null;
  name: string;
  colour: string | null;
  pack_size: number;
  unit: string;
};

type EmailContext = {
  requestId: string;
  requestNumber: string;
  specificationNumber: string;
  vesselName: string | null;
  imo: string | null;
  portName: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  userName: string | null;
  userEmail: string | null;
  lines: EmailLine[];
};

const CELL = 'style="border:1px solid #bfbfbf;padding:4px 8px;text-align:left"';
const CELL_RIGHT = 'style="border:1px solid #bfbfbf;padding:4px 8px;text-align:right"';

// No prices, same rule as the API payload.
function buildAvailabilityEmailHtml(ctx: EmailContext, intro: string, closing: string, eta: Dayjs | null): string {
  const rows = ctx.lines
    .map((l) => {
      const packs = l.pack_size ? Math.ceil(Number(l.requested_qty) / Number(l.pack_size)) : null;
      return (
        `<tr><td ${CELL_RIGHT}>${l.line_number}</td><td ${CELL}>${escapeHtml(l.supplier_key ?? "")}</td>` +
        `<td ${CELL}>${escapeHtml([l.code, l.name].filter(Boolean).join(" - "))}</td><td ${CELL}>${escapeHtml(l.colour ?? "")}</td>` +
        `<td ${CELL_RIGHT}>${escapeHtml(`${formatNumber(l.pack_size)} ${l.unit}`)}</td><td ${CELL_RIGHT}>${packs ?? ""}</td>` +
        `<td ${CELL_RIGHT}>${escapeHtml(`${formatNumber(l.requested_qty)} ${l.unit}`)}</td></tr>`
      );
    })
    .join("");
  const facts = [
    ["Vessel", [ctx.vesselName, ctx.imo ? `IMO ${ctx.imo}` : null].filter(Boolean).join(", ")],
    ["Port", ctx.portName ?? ""],
    ["Estimated arrival", eta ? eta.format(DATE_FORMAT) : ""],
    ["Our reference", ctx.requestNumber],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0"><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px">` +
    paragraphs(intro) +
    `<table style="border-collapse:collapse;margin:8px 0">${facts}</table>` +
    `<table style="border-collapse:collapse;margin:8px 0"><thead><tr>` +
    ["#", "Supplier code", "Product", "Colour", "Pack", "Packs", "Quantity"].map((h) => `<th ${CELL}>${h}</th>`).join("") +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    paragraphs(closing) +
    `</div>`
  );
}

const DEFAULT_INTRO =
  "Dear Sir or Madam,\n\nplease confirm the availability of the following products, with quantities and the earliest delivery date.\n\n" +
  "Please also let us know:\n- the delivery lead time\n- the transportation cost to the port below";
const defaultClosing = (requestNumber: string, userName: string | null) =>
  `Please quote our reference ${requestNumber} in your reply.\n\nKind regards\n${userName ?? ""}`.trim();

async function loadEmailContext(specificationId: string, requestId: string): Promise<EmailContext> {
  const [{ data: spec }, { data: request }, { data: auth }] = await Promise.all([
    supabaseClient
      .from("specifications")
      .select("specification_number, vessels(name, imo), ports(name), supplier:companies!specifications_supplier_id_fkey(name, email)")
      .eq("id", specificationId)
      .single(),
    supabaseClient
      .from("availability_requests")
      .select(
        "id, request_number, availability_request_lines(line_number, requested_qty, product_packagings(supplier_key, pack_size, unit, products(code, name, colour)))",
      )
      .eq("id", requestId)
      .single(),
    supabaseClient.auth.getUser(),
  ]);
  const userId = auth.user?.id;
  const { data: me } = userId ? await supabaseClient.from("users").select("name, email").eq("id", userId).maybeSingle() : { data: null };
  const s: any = spec;
  const r: any = request;
  return {
    requestId,
    requestNumber: r?.request_number ?? "",
    specificationNumber: s?.specification_number ?? "",
    vesselName: s?.vessels?.name ?? null,
    imo: s?.vessels?.imo ?? null,
    portName: s?.ports?.name ?? null,
    supplierName: s?.supplier?.name ?? null,
    supplierEmail: s?.supplier?.email ?? null,
    userName: me?.name ?? null,
    userEmail: me?.email ?? auth.user?.email ?? null,
    lines: ((r?.availability_request_lines ?? []) as any[])
      .sort((a, b) => a.line_number - b.line_number)
      .map((l) => ({
        line_number: l.line_number,
        requested_qty: l.requested_qty,
        supplier_key: l.product_packagings?.supplier_key ?? null,
        code: l.product_packagings?.products?.code ?? null,
        name: l.product_packagings?.products?.name ?? "?",
        colour: l.product_packagings?.products?.colour ?? null,
        pack_size: l.product_packagings?.pack_size,
        unit: l.product_packagings?.unit ?? "",
      })),
  };
}

export type MailboxOption = { value: string; label: string; connected: boolean };

export async function loadMailboxOptions(): Promise<MailboxOption[]> {
  const [{ data: mailboxes }, { data: connections }] = await Promise.all([
    supabaseClient.from("mailboxes").select("id, address, display_name").order("display_name"),
    supabaseClient.from("mailbox_connections").select("mailbox_id, status"),
  ]);
  const ok = new Set(((connections ?? []) as any[]).filter((c) => c.status === "ok").map((c) => c.mailbox_id));
  return ((mailboxes ?? []) as any[]).map((m) => ({
    value: m.id,
    label: `${m.display_name} <${m.address}>${ok.has(m.id) ? "" : " - not connected"}`,
    connected: ok.has(m.id),
  }));
}

export const splitAddresses = (v: string) =>
  v
    .split(/[;,\s]+/)
    .map((a) => a.trim())
    .filter(Boolean);

function EmailRequestModal({
  open,
  specificationId,
  defaultEta,
  onClose,
  onDone,
}: {
  open: boolean;
  specificationId: string;
  defaultEta: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [ctx, setCtx] = useState<EmailContext | null>(null);
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [busy, setBusy] = useState<"send" | "copy" | "mark" | null>(null);
  const [copied, setCopied] = useState(false);
  const values = Form.useWatch([], form);

  // Opening takes the snapshot (the unsent request of this spec is reused, so its number stays the same).
  useEffect(() => {
    if (!open) return;
    setCtx(null);
    setCopied(false);
    let cancelled = false;
    (async () => {
      try {
        const { data: requestId, error } = await supabaseClient.rpc("prepare_availability_request", {
          p_specification_id: specificationId,
          p_channel: "email",
          p_estimated_arrival: defaultEta,
        });
        rpcError(error);
        const [context, boxes] = await Promise.all([loadEmailContext(specificationId, requestId as string), loadMailboxOptions()]);
        if (cancelled) return;
        setCtx(context);
        setMailboxes(boxes);
        const eta = defaultEta ? dayjs(defaultEta) : null;
        form.setFieldsValue({
          mailbox_id: boxes.find((b) => b.connected)?.value ?? null,
          to: context.supplierEmail ?? "",
          cc: context.userEmail ?? "",
          subject: [
            `Availability request ${context.requestNumber}`,
            [context.vesselName, context.imo ? `(IMO ${context.imo})` : null].filter(Boolean).join(" "),
            [context.portName, eta ? `ETA ${eta.format(DATE_FORMAT)}` : null].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" – "),
          eta,
          intro: DEFAULT_INTRO,
          closing: defaultClosing(context.requestNumber, context.userName),
        });
      } catch (e: any) {
        if (cancelled) return;
        message.error(errorText(e, "Could not prepare the request"));
        onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, specificationId]);

  const html = ctx && values ? buildAvailabilityEmailHtml(ctx, values.intro ?? "", values.closing ?? "", values.eta ?? null) : "";
  const selectedMailbox = mailboxes.find((m) => m.value === values?.mailbox_id);

  // The arrival date may have changed in the dialog: refresh the request (same number) before it goes out.
  const refresh = async () => {
    const eta: Dayjs | null = form.getFieldValue("eta");
    const { error } = await supabaseClient.rpc("prepare_availability_request", {
      p_specification_id: specificationId,
      p_channel: "email",
      p_estimated_arrival: eta ? eta.format("YYYY-MM-DD") : null,
    });
    rpcError(error);
  };

  const send = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !ctx) return;
    setBusy("send");
    try {
      await refresh();
      const res = await invokeSupplierApi({
        action: "availability_email",
        request_id: ctx.requestId,
        mailbox_id: v.mailbox_id,
        to: splitAddresses(v.to),
        cc: splitAddresses(v.cc ?? ""),
        subject: v.subject,
        body_html: html,
      });
      if (!res.ok) throw new Error(res.error ?? "Could not send the email");
      if (res.warning) message.warning(res.warning);
      else message.success(`Availability request ${ctx.requestNumber} sent`);
      onDone();
      onClose();
    } catch (e: any) {
      message.error(errorText(e, "Could not send the email"));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!ctx) return;
    setBusy("copy");
    try {
      const plain = new DOMParser().parseFromString(html, "text/html").body.innerText;
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      message.success("Email copied - paste it into a new mail, then click “Mark as sent”");
    } catch (e: any) {
      message.error(errorText(e, "Could not copy"));
    } finally {
      setBusy(null);
    }
  };

  const markSent = async () => {
    if (!ctx) return;
    setBusy("mark");
    try {
      await refresh();
      const { error } = await supabaseClient.rpc("mark_availability_request_sent", { p_request_id: ctx.requestId });
      rpcError(error);
      message.success(`Availability request ${ctx.requestNumber} marked as sent`);
      onDone();
      onClose();
    } catch (e: any) {
      message.error(errorText(e, "Could not mark the request as sent"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title={ctx ? `Availability request by email - ${ctx.requestNumber}` : "Availability request by email"}
      open={open}
      onCancel={onClose}
      width={960}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="copy" icon={<CopyOutlined />} onClick={copy} loading={busy === "copy"} disabled={!ctx}>
          Copy email
        </Button>,
        <Tooltip key="mark" title="After sending the copied email from your own mail program">
          <Button onClick={markSent} loading={busy === "mark"} disabled={!ctx} type={copied ? "primary" : "default"}>
            Mark as sent
          </Button>
        </Tooltip>,
        <Tooltip key="send" title={selectedMailbox?.connected ? undefined : "No connected mailbox selected - copy the email instead"}>
          <Button type="primary" icon={<MailOutlined />} onClick={send} loading={busy === "send"} disabled={!ctx || !selectedMailbox?.connected}>
            Send
          </Button>
        </Tooltip>,
      ]}
    >
      <Form form={form} layout="vertical" disabled={!ctx}>
        <Space style={{ width: "100%" }} align="start" wrap>
          <Form.Item label="From" name="mailbox_id" style={{ minWidth: 360 }}>
            <Select options={mailboxes} placeholder="No mailbox available" allowClear />
          </Form.Item>
          <Form.Item label="Estimated arrival of the vessel" name="eta">
            <DatePicker format={DATE_FORMAT} />
          </Form.Item>
        </Space>
        <Form.Item label="To" name="to" rules={[{ required: true, message: "Recipient is required" }]} extra={ctx && !ctx.supplierEmail ? "The supplier has no email address on its company page." : undefined}>
          <Input placeholder="supplier@example.com; second@example.com" />
        </Form.Item>
        <Form.Item label="Cc" name="cc">
          <Input />
        </Form.Item>
        <Form.Item label="Subject" name="subject" rules={[{ required: true, message: "Subject is required" }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Text before the products" name="intro">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
        </Form.Item>
        <Form.Item label="Text after the products" name="closing">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary">Preview (no prices are sent)</Typography.Text>
      <div
        style={{ border: "1px solid rgba(128,128,128,0.35)", borderRadius: 6, padding: 12, marginTop: 4, background: "#fff", color: "#000", overflowX: "auto" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Modal>
  );
}

// An internal supplier (connection method "in app"): the request is recorded and the offer handed over to a
// colleague with the reason "Check availability"; they enter the answers in the app and hand it back. The
// supplier's own tenant is listed first.
function InAppHandoverModal({
  open,
  specificationId,
  supplierId,
  defaultEta,
  onClose,
  onDone,
}: {
  open: boolean;
  specificationId: string;
  supplierId: string | null | undefined;
  defaultEta: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [form] = Form.useForm();
  const [candidates, setCandidates] = useState<{ id: string; label: string; team: boolean }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ note: "Please check the availability of the products on this offer and enter the answers." });
    (async () => {
      const [{ data: users }, { data: tenants }] = await Promise.all([
        supabaseClient.rpc("assignable_users", { p_entity_type: "specifications", p_entity_id: specificationId }),
        supplierId ? supabaseClient.from("owner_associate_teams").select("id:team_id").eq("company_id", supplierId) : Promise.resolve({ data: [] as { id: string }[] }),
      ]);
      const tenantIds = ((tenants ?? []) as { id: string }[]).map((t) => t.id);
      const { data: teamRows } = tenantIds.length
        ? await supabaseClient.from("users").select("id").in("default_team_id", tenantIds)
        : { data: [] as { id: string }[] };
      const team = new Set(((teamRows ?? []) as { id: string }[]).map((u) => u.id));
      setCandidates(
        ((users ?? []) as { id: string; name: string | null; email: string }[])
          .filter((u) => u.id !== identity?.id)
          .map((u) => ({ id: u.id, label: u.name ?? u.email, team: team.has(u.id) })),
      );
    })();
  }, [open, specificationId, supplierId, identity?.id, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      // One transaction: either the request is recorded and the offer handed over, or nothing happened.
      const { error } = await supabaseClient.rpc("hand_over_for_availability", {
        p_specification_id: specificationId,
        p_to_user_id: values.to_user_id,
        p_estimated_arrival: defaultEta,
        p_note: values.note ?? null,
      });
      rpcError(error);
      message.success("Handed over for the availability check");
      onClose();
      onDone();
    } catch (e: any) {
      message.error(errorText(e, "Could not hand over"));
    } finally {
      setSaving(false);
    }
  };

  const team = candidates.filter((c) => c.team);
  const others = candidates.filter((c) => !c.team);
  const toOption = (c: { id: string; label: string }) => ({ value: c.id, label: c.label });

  return (
    <Modal title="Hand over for availability" open={open} onCancel={onClose} onOk={submit} okText="Hand over" confirmLoading={saving} destroyOnHidden>
      <Typography.Paragraph type="secondary">
        The current line items are recorded as the availability request, and the offer goes to the colleague, who enters the supplier's answer on the offer and hands it back.
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item label="Hand over to" name="to_user_id" rules={[{ required: true, message: "Choose a colleague" }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select a colleague"
            options={(team.length > 0 ? [{ label: "Supplier's team", options: team.map(toOption) }, { label: "Others", options: others.map(toOption) }] : others.map(toOption)) as any[]}
          />
        </Form.Item>
        <Form.Item label="Note" name="note" extra="Appears in the Notes of the offer and in the colleague's notification.">
          <Input.TextArea rows={3} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Header menu next to the API button: hand over internally (supplier "in app"), email, or a request already made by phone.
export function AvailabilityMenuButton({
  specificationId,
  supplierId,
  connectionMethod,
  defaultEta,
  beforeStart,
  onChanged,
  onRecordedManual,
}: {
  specificationId: string;
  supplierId?: string | null;
  // companies.supplier_connection_method of the supplier; "in app" swaps the email option for the internal handover.
  connectionMethod?: SupplierConnectionMethod | null;
  defaultEta: string | null;
  // Called before a request is started (e.g. saves the page); false cancels.
  beforeStart?: () => Promise<boolean>;
  onChanged: () => void;
  // An availability response without a sent request (asked by phone, in person ...) was started: the caller opens
  // its response dialog.
  onRecordedManual: (requestId: string) => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const [emailOpen, setEmailOpen] = useState(false);
  const [inAppOpen, setInAppOpen] = useState(false);
  const inApp = connectionMethod === "in_app";

  const recordManual = () =>
    modal.confirm({
      title: "Enter an availability response?",
      content: "For an availability the supplier gave without a request from the app. Takes the current saved line items; enter the response next.",
      okText: "Continue",
      onOk: async () => {
        try {
          const { data: requestId, error } = await supabaseClient.rpc("prepare_availability_request", {
            p_specification_id: specificationId,
            p_channel: "manual",
            p_estimated_arrival: defaultEta,
          });
          rpcError(error);
          const { error: markError } = await supabaseClient.rpc("mark_availability_request_sent", { p_request_id: requestId });
          rpcError(markError);
          onChanged();
          onRecordedManual(requestId as string);
        } catch (e: any) {
          message.error(errorText(e, "Could not start the availability response"));
        }
      },
    });

  return (
    <>
      <Dropdown
        menu={{
          items: [
            inApp
              ? { key: "in_app", icon: <TeamOutlined />, label: "Hand over for availability…" }
              : { key: "email", icon: <MailOutlined />, label: "Request by email…" },
            { key: "manual", icon: <FormOutlined />, label: "Availability response…" },
          ],
          onClick: async ({ key }) => {
            if (beforeStart && !(await beforeStart())) return;
            if (key === "email") setEmailOpen(true);
            else if (key === "in_app") setInAppOpen(true);
            else recordManual();
          },
        }}
      >
        <Button type={inApp ? "primary" : "default"}>
          Availability <DownOutlined />
        </Button>
      </Dropdown>
      <InAppHandoverModal
        open={inAppOpen}
        specificationId={specificationId}
        supplierId={supplierId}
        defaultEta={defaultEta}
        onClose={() => setInAppOpen(false)}
        onDone={onChanged}
      />
      <EmailRequestModal
        open={emailOpen}
        specificationId={specificationId}
        defaultEta={defaultEta}
        onClose={() => setEmailOpen(false)}
        onDone={onChanged}
      />
    </>
  );
}

// Lets the page open a request's response dialog from outside the card (after starting a response without a request).
export function AnswerModalHost({
  requestId,
  requests,
  packagingById,
  validUntil,
  onClose,
  onSaved,
}: {
  requestId: string | null;
  requests: AvailabilityRequest[];
  packagingById: Map<string, PackagingInfo>;
  validUntil?: OfferValidUntil;
  onClose: () => void;
  onSaved: () => void;
}) {
  const request = requestId ? requests.find((r) => r.id === requestId) ?? null : null;
  return <AnswerModal request={request} packagingById={packagingById} validUntil={validUntil} onClose={onClose} onSaved={onSaved} />;
}
