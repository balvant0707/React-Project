// Ported 1:1 from the NPM tool (supabase/functions/supplier-api/index.ts).
// Sends availability requests (specifications) and orders to suppliers that expose an API.
// See ~/npm_tool/docs/supplier-api-integration.md. Body:
//   { action: "availability_send", specification_id, estimated_arrival }   create, or update once sent
//   { action: "order_send", order_id }                                     create-if-needed, then confirm
//   { action: "availability_email", request_id, mailbox_id, to, cc, subject, body_html }
//                                                                          send a prepared request by email (Graph)
//   { action: "transport_email", kind: request|award|reject, transport_id + forwarder_company_id | quote_id,
//     mailbox_id, to, cc, subject, body_html }                             mail a forwarder about a transport (Graph)
// The caller's JWT decides whether they may edit the record (can_access_entity); everything is
// then read and written with the service role, since users have no write access to the new tables.
// The response is always JSON { ok, error?, missing? }; every call is logged in supplier_api_calls.
import { serviceClient, userClient } from "../_shared/msgraph.ts";
import { recordSentMail, sendTrackedMail, type SentMail, type TrackedMailInput } from "../_shared/trackedMail.ts";
import { adapterConfig, getAdapter } from "../_shared/supplierApi/index.ts";
import { buildLines, orderTypeFor } from "../_shared/supplierApi/payload.ts";
import type { AdapterConfig, AdapterResult, NeutralEnquiry, SupplierApiAdapter } from "../_shared/supplierApi/types.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Ctx = {
  svc: ReturnType<typeof serviceClient>;
  userId: string;
  userEmail: string;
};

async function logCall(
  ctx: Ctx,
  entityType: "availability_requests" | "orders",
  entityId: string,
  action: string,
  adapter: SupplierApiAdapter,
  r: AdapterResult,
) {
  await ctx.svc.from("supplier_api_calls").insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    adapter: adapter.id,
    success: r.success,
    http_status: r.httpStatus,
    request_body: r.requestBody,
    response_body: r.responseBody,
    error_message: r.error,
    user_id: ctx.userId,
  });
}

async function loadSupplier(ctx: Ctx, supplierId: string | null) {
  if (!supplierId) return { error: "The supplier is not set" } as const;
  const { data } = await ctx.svc
    .from("companies")
    .select("id, name, short_code, supplier_api_adapter")
    .eq("id", supplierId)
    .maybeSingle();
  const adapter = getAdapter(data?.supplier_api_adapter);
  if (!data || !adapter) return { error: `${data?.name ?? "This supplier"} has no API connection` } as const;
  const config = adapterConfig(adapter.id, data.short_code, Deno.env);
  if (!config) return { error: `The API connection for ${data.name} is not configured on the server` } as const;
  return { supplier: data, adapter, config } as const;
}

// Requests made from a specification are numbered <specification_number>-A01, -A02, ...; a request created for an
// order carries the order number instead and must never be picked up as one of these. LIKE wildcards in the
// specification number are escaped (callers re-check the prefix exactly).
function requestPrefix(specificationNumber: string) {
  const prefix = `${specificationNumber}-A`;
  return { prefix, escaped: prefix.replace(/[\\%_]/g, (c) => `\\${c}`) };
}

async function nextRequestNumber(ctx: Ctx, specificationNumber: string): Promise<string> {
  // Next suffix = highest existing + 1 (a count would reuse a number after a delete).
  const { prefix, escaped } = requestPrefix(specificationNumber);
  const { data } = await ctx.svc.from("availability_requests").select("request_number").like("request_number", `${escaped}%`);
  let highest = 0;
  for (const row of data ?? []) {
    const rest = String(row.request_number).slice(prefix.length);
    if (String(row.request_number).startsWith(prefix) && /^\d+$/.test(rest)) highest = Math.max(highest, Number(rest));
  }
  return `${prefix}${String(highest + 1).padStart(2, "0")}`;
}

const SPEC_SELECT =
  "id, specification_number, hull_event_type_code, supplier_id, delivery_date, currency, " +
  "vessels(imo, name, group_owner), ports(name), country:countries!location_country_id(name_en)";
// Packs of a quantity in the packaging unit (an offer line saved before offered_packs existed). Same rounding as
// packsOfQuantity in app/src/pages/specifications/lineItemCalc.ts, which this function cannot import.
const packsOf = (quantity: number | string | null | undefined, packSize: number | string | null | undefined) =>
  quantity == null || !Number(packSize) ? quantity : Math.ceil(Number(quantity) / Number(packSize));

const PACKAGING_SELECT = "product_packagings(supplier_key, pack_size, unit, products(name, colour))";

async function availabilitySend(ctx: Ctx, specificationId: string, estimatedArrival: string | null) {
  const { data: spec } = await ctx.svc.from("specifications").select(SPEC_SELECT).eq("id", specificationId).maybeSingle();
  if (!spec) return json({ ok: false, error: "Specification not found" }, 404);
  const s = spec as any;

  const sup = await loadSupplier(ctx, s.supplier_id);
  if ("error" in sup) return json({ ok: false, error: sup.error });

  const { data: items } = await ctx.svc
    .from("specification_line_items")
    .select(`id, sequence, offered_qty, offered_packs, real_quantity, quantity_product, product_packaging_id, ${PACKAGING_SELECT}`)
    .eq("specification_id", specificationId)
    .order("sequence");
  const rows = (items ?? []) as any[];
  const { lines, missing } = buildLines(
    rows.map((r) => ({ quantity: r.offered_packs ?? packsOf(r.offered_qty ?? r.real_quantity ?? r.quantity_product, r.product_packagings?.pack_size), product_packagings: r.product_packagings })),
  );

  // Existing specification request for this spec and supplier (sent -> update; unsent after a failure -> reuse).
  // Requests created for an order (numbered by order number) are not ours to update, nor is one already sent by
  // email or recorded by hand (the supplier's system does not know it); an unsent one of any channel is reused.
  const { prefix, escaped } = requestPrefix(s.specification_number);
  const { data: existingRows } = await ctx.svc
    .from("availability_requests")
    .select("*")
    .eq("specification_id", specificationId)
    .eq("supplier_id", s.supplier_id)
    .like("request_number", `${escaped}%`)
    .or("channel.eq.api,requested_at.is.null")
    .order("created_at", { ascending: false });
  const existing = (existingRows ?? []).find((r: any) => String(r.request_number).startsWith(prefix)) ?? null;

  const arrival = estimatedArrival ?? existing?.estimated_arrival ?? s.delivery_date ?? null;
  if (!s.vessels?.imo) missing.push("vessel IMO");
  if (!s.vessels?.name) missing.push("vessel name");
  if (!s.vessels?.group_owner) missing.push("vessel group owner");
  if (!s.ports?.name) missing.push("port (set it on the specification)");
  if (!s.country?.name_en) missing.push("country (set it on the specification)");
  if (!arrival) missing.push("estimated arrival");
  if (missing.length > 0) return json({ ok: false, error: `Missing: ${missing.join(", ")}`, missing }, 422);

  let request = existing;
  if (!request) {
    // A concurrent request for the same spec can take the same number: retry on the unique violation.
    for (let attempt = 0; attempt < 3 && !request; attempt++) {
      const { data, error } = await ctx.svc
        .from("availability_requests")
        .insert({
          specification_id: specificationId,
          supplier_id: s.supplier_id,
          request_number: await nextRequestNumber(ctx, s.specification_number),
          estimated_arrival: arrival,
          created_by_user_id: ctx.userId,
        })
        .select("*")
        .single();
      if (!error) request = data;
      else if (error.message.includes("availability_requests_one_unsent_idx")) {
        // A concurrent call just created the unsent request for this spec and supplier.
        return json({ ok: false, error: "An availability request for this specification is already being sent" });
      } else if (error.code !== "23505" || attempt === 2) return json({ ok: false, error: error.message }, 500);
    }
  } else if (request.estimated_arrival !== arrival || request.channel !== "api") {
    await ctx.svc.from("availability_requests").update({ estimated_arrival: arrival, channel: "api" }).eq("id", request.id);
  }

  // Claim the request so a double click cannot send it twice; a claim older than 5 minutes is treated as abandoned.
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: claimed } = await ctx.svc
    .from("availability_requests")
    .update({ send_started_at: new Date().toISOString() })
    .eq("id", request.id)
    .or(`send_started_at.is.null,send_started_at.lt.${staleBefore}`)
    .select("id");
  if (!claimed?.length) return json({ ok: false, error: "This availability request is already being sent" });
  try {
    return await availabilitySendClaimed(ctx, request, s, sup, rows, lines, arrival);
  } finally {
    await ctx.svc.from("availability_requests").update({ send_started_at: null }).eq("id", request.id);
  }
}

async function availabilitySendClaimed(
  ctx: Ctx,
  request: any,
  s: any,
  sup: { adapter: SupplierApiAdapter; config: AdapterConfig },
  rows: any[],
  lines: NeutralEnquiry["lines"],
  arrival: string,
) {
  const enquiry: NeutralEnquiry = {
    requestNumber: request.request_number,
    userEmail: ctx.userEmail,
    internalReference: s.specification_number,
    countryName: s.country.name_en,
    orderType: orderTypeFor(s.hull_event_type_code),
    imo: s.vessels.imo,
    shipName: s.vessels.name,
    portName: s.ports.name,
    estimatedArrival: arrival,
    estimatedDelivery: s.delivery_date ?? null,
    groupOwner: s.vessels.group_owner,
    currency: s.currency ?? null,
    lines,
  };

  const isUpdate = request.requested_at != null;
  const result = isUpdate
    ? await sup.adapter.updateEnquiry(sup.config, enquiry)
    : await sup.adapter.createEnquiry(sup.config, enquiry);
  await logCall(ctx, "availability_requests", request.id, isUpdate ? "availability_update" : "availability_create", sup.adapter, result);
  if (!result.success) return json({ ok: false, error: result.error, request_id: request.id });

  await ctx.svc
    .from("availability_requests")
    .update({
      requested_at: request.requested_at ?? new Date().toISOString(),
      requested_by_user_id: request.requested_by_user_id ?? ctx.userId,
      supplier_enquiry_number: result.supplierEnquiryNumber ?? request.supplier_enquiry_number,
    })
    .eq("id", request.id);

  // Snapshot of what was asked (replaced on update). An answer already entered for a line is carried over
  // while the line is still asked for. New rows go in before the old ones are removed, so a failure never
  // leaves the request without its snapshot.
  const { data: oldLines } = await ctx.svc
    .from("availability_request_lines")
    .select("id, specification_line_item_id, confirmed_qty, confirmed_date, comment, answered_at, answered_by_user_id")
    .eq("availability_request_id", request.id);
  const answerByItem = new Map((oldLines ?? []).filter((l: any) => l.specification_line_item_id).map((l: any) => [l.specification_line_item_id, l]));
  const sentRows = rows.filter((r) => Number(r.offered_qty ?? r.real_quantity ?? r.quantity_product ?? 0) > 0 && r.product_packagings?.supplier_key);
  const { error: insertError } = await ctx.svc.from("availability_request_lines").insert(
    sentRows.map((r, i) => {
      const answer: any = answerByItem.get(r.id);
      return {
        availability_request_id: request.id,
        specification_line_item_id: r.id,
        product_packaging_id: r.product_packaging_id,
        line_number: i + 1,
        requested_qty: r.offered_qty ?? r.real_quantity ?? r.quantity_product,
        confirmed_qty: answer?.confirmed_qty ?? null,
        confirmed_date: answer?.confirmed_date ?? null,
        comment: answer?.comment ?? null,
        answered_at: answer?.answered_at ?? null,
        answered_by_user_id: answer?.answered_by_user_id ?? null,
      };
    }),
  );
  let warning: string | undefined;
  if (insertError) {
    warning = `Sent, but the line snapshot was not saved: ${insertError.message}`;
  } else if (oldLines?.length) {
    const { error: deleteError } = await ctx.svc.from("availability_request_lines").delete().in("id", oldLines.map((l) => l.id));
    if (deleteError) warning = `Sent, but the previous line snapshot was not removed: ${deleteError.message}`;
  }
  return json({ ok: true, request_id: request.id, request_number: request.request_number, updated: isUpdate, warning });
}

async function orderSend(ctx: Ctx, orderId: string) {
  // Claim the order so a double click cannot send it twice; a claim older than 5 minutes is treated as abandoned.
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await ctx.svc
    .from("orders")
    .update({ supplier_send_started_at: claimedAt })
    .eq("id", orderId)
    .or(`supplier_send_started_at.is.null,supplier_send_started_at.lt.${staleBefore}`)
    .select("id");
  if (!claimed?.length) {
    const { data: exists } = await ctx.svc.from("orders").select("id").eq("id", orderId).maybeSingle();
    if (!exists) return json({ ok: false, error: "Order not found" }, 404);
    return json({ ok: false, error: "This order is already being sent to the supplier" });
  }
  try {
    return await orderSendClaimed(ctx, orderId);
  } finally {
    // Only release our own claim: after the stale timeout another call may have taken over.
    await ctx.svc.from("orders").update({ supplier_send_started_at: null }).eq("id", orderId).eq("supplier_send_started_at", claimedAt);
  }
}

async function orderSendClaimed(ctx: Ctx, orderId: string) {
  const { data: order } = await ctx.svc
    .from("orders")
    .select(
      "id, order_number, specification_id, availability_request_id, supplier_id, delivery_port, requested_date, currency, mof_sent_at, deleted_at, " +
        "delivery_country_id, delivery_country:countries!delivery_country_id(name_en), " +
        "vessels(imo, name, group_owner), specifications(hull_event_type_code, ports(name), country:countries!location_country_id(name_en))",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return json({ ok: false, error: "Order not found" }, 404);
  const o = order as any;
  if (o.deleted_at) return json({ ok: false, error: "This order is deleted" });

  const { count: alreadyConfirmed } = await ctx.svc
    .from("supplier_api_calls")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "orders")
    .eq("entity_id", orderId)
    .eq("action", "order_confirm")
    .eq("success", true);
  if ((alreadyConfirmed ?? 0) > 0) return json({ ok: false, error: "This order was already sent to the supplier" });

  const sup = await loadSupplier(ctx, o.supplier_id);
  if ("error" in sup) return json({ ok: false, error: sup.error });

  const { data: lineRows } = await ctx.svc
    .from("order_lines")
    .select(`sequence, ordered_packs, ${PACKAGING_SELECT}`)
    .eq("order_id", orderId)
    .order("sequence");
  const { lines, missing } = buildLines(
    ((lineRows ?? []) as any[]).map((r) => ({ quantity: r.ordered_packs, product_packagings: r.product_packagings })),
  );

  let request: any = null;
  if (o.availability_request_id) {
    const { data } = await ctx.svc.from("availability_requests").select("*").eq("id", o.availability_request_id).maybeSingle();
    request = data;
  }

  const portName = o.delivery_port || o.specifications?.ports?.name;
  const arrival = request?.estimated_arrival ?? o.requested_date ?? null;
  if (!o.vessels?.imo) missing.push("vessel IMO");
  if (!o.vessels?.name) missing.push("vessel name");
  if (!o.vessels?.group_owner) missing.push("vessel group owner");
  if (!portName) missing.push("delivery port");
  const countryName = o.delivery_country?.name_en ?? o.specifications?.country?.name_en;
  if (!countryName) missing.push("delivery country");
  if (!arrival) missing.push("requested date");
  if (missing.length > 0) return json({ ok: false, error: `Missing: ${missing.join(", ")}`, missing }, 422);

  const enquiry: NeutralEnquiry = {
    requestNumber: request?.request_number ?? o.order_number,
    salesOrderNumber: o.order_number,
    userEmail: ctx.userEmail,
    internalReference: o.order_number,
    countryName,
    orderType: orderTypeFor(o.specifications?.hull_event_type_code),
    imo: o.vessels.imo,
    shipName: o.vessels.name,
    portName,
    estimatedArrival: arrival,
    estimatedDelivery: o.requested_date ?? null,
    groupOwner: o.vessels.group_owner,
    currency: o.currency ?? null,
    lines,
  };

  // No linked request (direct order, or a second order of the same spec): open the enquiry first,
  // under the order number, and link it so a retry goes straight to the confirm.
  if (!request) {
    const created = await sup.adapter.createEnquiry(sup.config, enquiry);
    if (!created.success) {
      await logCall(ctx, "orders", orderId, "availability_create", sup.adapter, created);
      return json({ ok: false, error: created.error });
    }
    await logCall(ctx, "orders", orderId, "availability_create", sup.adapter, created);
    const { data, error } = await ctx.svc
      .from("availability_requests")
      .insert({
        specification_id: o.specification_id,
        supplier_id: o.supplier_id,
        request_number: o.order_number,
        supplier_enquiry_number: created.supplierEnquiryNumber,
        estimated_arrival: arrival,
        requested_at: new Date().toISOString(),
        requested_by_user_id: ctx.userId,
        created_by_user_id: ctx.userId,
      })
      .select("*")
      .single();
    if (error) return json({ ok: false, error: `Enquiry created at the supplier but not recorded: ${error.message}` }, 500);
    request = data;
    await ctx.svc.from("orders").update({ availability_request_id: request.id }).eq("id", orderId);
  }

  const result = await sup.adapter.confirmOrder(sup.config, enquiry);
  await logCall(ctx, "orders", orderId, "order_confirm", sup.adapter, result);
  if (!result.success) return json({ ok: false, error: result.error });

  await ctx.svc
    .from("orders")
    .update({ mof_sent_at: o.mof_sent_at ?? new Date().toISOString() })
    .eq("id", orderId);
  return json({ ok: true, request_number: request.request_number });
}

type EmailBody = {
  request_id?: string;
  mailbox_id?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  body_html?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sends a request prepared by prepare_availability_request (snapshot taken, still unsent) from a mailbox the
// caller has access to, records it as an email thread linked to the specification, and marks the request sent.
// The body is built by the browser from the same saved line items, so it can also be copied by hand while no
// mailbox is connected.
async function availabilityEmail(ctx: Ctx, uc: ReturnType<typeof userClient>, body: EmailBody) {
  const to = (body.to ?? []).map((a) => a.trim()).filter(Boolean);
  const cc = (body.cc ?? []).map((a) => a.trim()).filter(Boolean);
  const invalid = [...to, ...cc].filter((a) => !EMAIL_PATTERN.test(a));
  if (to.length === 0) return json({ ok: false, error: "Add at least one recipient" }, 422);
  if (invalid.length > 0) return json({ ok: false, error: `Not an email address: ${invalid.join(", ")}` }, 422);
  if (!body.subject?.trim() || !body.body_html?.trim()) return json({ ok: false, error: "Subject and text are required" }, 422);

  const { data: request } = await ctx.svc
    .from("availability_requests")
    .select("id, specification_id, request_number, requested_at, channel")
    .eq("id", body.request_id!)
    .maybeSingle();
  if (!request?.specification_id) return json({ ok: false, error: "Availability request not found" }, 404);
  if (request.requested_at) return json({ ok: false, error: "This availability request was already sent" });
  const { data: mayEdit } = await uc.rpc("can_access_entity", {
    p_entity_type: "specifications",
    p_entity_id: request.specification_id,
    p_grant_type: "edit",
  });
  if (mayEdit !== true) return json({ ok: false, error: "Not allowed" }, 403);

  const { data: mayUseMailbox } = await uc.rpc("can_access_mailbox", { p_mailbox_id: body.mailbox_id });
  if (mayUseMailbox !== true) return json({ ok: false, error: "You have no access to this mailbox" }, 403);
  const { data: mailbox } = await ctx.svc.from("mailboxes").select("address, display_name").eq("id", body.mailbox_id!).maybeSingle();
  if (!mailbox) return json({ ok: false, error: "Mailbox not found" }, 404);

  // Same claim as availability_send, so a double click cannot send the mail twice.
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await ctx.svc
    .from("availability_requests")
    .update({ send_started_at: claimedAt })
    .eq("id", request.id)
    .is("requested_at", null)
    .or(`send_started_at.is.null,send_started_at.lt.${staleBefore}`)
    .select("id");
  if (!claimed?.length) return json({ ok: false, error: "This availability request is already being sent" });

  let keepClaim = false;
  try {
    const mail: TrackedMailInput = {
      mailboxId: body.mailbox_id!,
      mailboxAddress: mailbox.address,
      mailboxDisplayName: mailbox.display_name,
      to,
      cc,
      subject: body.subject!,
      bodyHtml: body.body_html!,
    };
    let sent: SentMail;
    try {
      sent = await sendTrackedMail(ctx.svc, mail);
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
    }

    const { error: markError } = await ctx.svc
      .from("availability_requests")
      .update({ requested_at: sent.sentAt, requested_by_user_id: ctx.userId, channel: "email" })
      .eq("id", request.id);
    // The mail is out: when it cannot be marked, the claim stays (it expires after 5 minutes) instead of inviting a second mail.
    if (markError) {
      keepClaim = true;
      return json({ ok: false, error: `The mail was sent, but the request could not be marked as sent: ${markError.message}` }, 500);
    }

    // The mail went out; recording it as a thread is best effort and reported as a warning.
    const { threadId, warning } = await recordSentMail(ctx.svc, {
      ...mail,
      sent,
      userId: ctx.userId,
      links: [{ entity_type: "specifications", entity_id: request.specification_id }],
    });
    if (threadId) await ctx.svc.from("availability_requests").update({ email_thread_id: threadId }).eq("id", request.id);
    return json({ ok: true, request_id: request.id, request_number: request.request_number, warning });
  } finally {
    if (!keepClaim) await ctx.svc.from("availability_requests").update({ send_started_at: null }).eq("id", request.id).eq("send_started_at", claimedAt);
  }
}

type TransportEmailBody = EmailBody & {
  kind?: "request" | "award" | "reject";
  transport_id?: string;
  forwarder_company_id?: string;
  quote_id?: string;
};

// Mails to forwarders of a transport, sent from a mailbox through Graph like the availability emails:
//   request  {transport_id, forwarder_company_id}  ask for a quote; creates / refreshes the quote row (status requested)
//   award    {quote_id}                            confirm the order to the awarded forwarder
//   reject   {quote_id}                            tell a forwarder it was not chosen
// Each mail is recorded as an email thread linked to the offer (and the order); a request keeps its thread on the quote.
async function transportEmail(ctx: Ctx, uc: ReturnType<typeof userClient>, body: TransportEmailBody) {
  const to = (body.to ?? []).map((a) => a.trim()).filter(Boolean);
  const cc = (body.cc ?? []).map((a) => a.trim()).filter(Boolean);
  const invalid = [...to, ...cc].filter((a) => !EMAIL_PATTERN.test(a));
  if (to.length === 0) return json({ ok: false, error: "Add at least one recipient" }, 422);
  if (invalid.length > 0) return json({ ok: false, error: `Not an email address: ${invalid.join(", ")}` }, 422);
  if (!body.subject?.trim() || !body.body_html?.trim()) return json({ ok: false, error: "Subject and text are required" }, 422);
  if (body.kind !== "request" && body.kind !== "award" && body.kind !== "reject") return json({ ok: false, error: "unknown kind" }, 400);
  if (to.length + cc.length > 10) return json({ ok: false, error: "Too many recipients" }, 422);

  let quote: { id: string; transport_id: string; forwarder_company_id: string; status: string } | null = null;
  let transportId = body.transport_id ?? null;
  let forwarderId = body.forwarder_company_id ?? null;
  if (body.kind === "request") {
    if (!transportId || !forwarderId) return json({ ok: false, error: "transport_id and forwarder_company_id are required" }, 400);
    // Only companies of the type forwarder can be asked for a quote.
    const { data: forwarder } = await ctx.svc.from("companies").select("id").eq("id", forwarderId).contains("company_types", ["forwarder"]).maybeSingle();
    if (!forwarder) return json({ ok: false, error: "This company is not a forwarder" }, 422);
    const { data } = await ctx.svc
      .from("transport_quotes")
      .select("id, transport_id, forwarder_company_id, status")
      .eq("transport_id", transportId)
      .eq("forwarder_company_id", forwarderId)
      .maybeSingle();
    quote = data;
    if (quote && !["requested", "declined"].includes(quote.status)) {
      return json({ ok: false, error: "This forwarder has already quoted - change the quote instead of asking again" });
    }
  } else {
    if (!body.quote_id) return json({ ok: false, error: "quote_id is required" }, 400);
    const { data } = await ctx.svc
      .from("transport_quotes")
      .select("id, transport_id, forwarder_company_id, status")
      .eq("id", body.quote_id)
      .maybeSingle();
    quote = data;
    if (!quote) return json({ ok: false, error: "Quote not found" }, 404);
    transportId = quote.transport_id;
    forwarderId = quote.forwarder_company_id;
    if (body.kind === "award" && quote.status !== "awarded") return json({ ok: false, error: "Award the quote first" });
    if (body.kind === "reject" && quote.status !== "rejected") return json({ ok: false, error: "This quote was not rejected" });
  }

  const { data: transport } = await ctx.svc.from("transports").select("id, specification_id, order_id").eq("id", transportId!).maybeSingle();
  if (!transport) return json({ ok: false, error: "Transport not found" }, 404);
  const { data: mayEdit } = await uc.rpc("can_access_entity", {
    p_entity_type: transport.order_id ? "orders" : "specifications",
    p_entity_id: transport.order_id ?? transport.specification_id,
    p_grant_type: "edit",
  });
  if (mayEdit !== true) return json({ ok: false, error: "Not allowed" }, 403);

  const { data: mayUseMailbox } = await uc.rpc("can_access_mailbox", { p_mailbox_id: body.mailbox_id });
  if (mayUseMailbox !== true) return json({ ok: false, error: "You have no access to this mailbox" }, 403);
  const { data: mailbox } = await ctx.svc.from("mailboxes").select("address, display_name").eq("id", body.mailbox_id!).maybeSingle();
  if (!mailbox) return json({ ok: false, error: "Mailbox not found" }, 404);

  const mail: TrackedMailInput = {
    mailboxId: body.mailbox_id!,
    mailboxAddress: mailbox.address,
    mailboxDisplayName: mailbox.display_name,
    to,
    cc,
    subject: body.subject!,
    bodyHtml: body.body_html!,
  };
  let sent: SentMail;
  try {
    sent = await sendTrackedMail(ctx.svc, mail);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }

  const sentAt = sent.sentAt;
  let quoteId = quote?.id ?? null;
  if (body.kind === "request") {
    const { data: saved } = await ctx.svc
      .from("transport_quotes")
      .upsert(
        { transport_id: transportId, forwarder_company_id: forwarderId, status: "requested", requested_at: sentAt, requested_by_user_id: ctx.userId },
        { onConflict: "transport_id,forwarder_company_id" },
      )
      .select("id")
      .single();
    quoteId = saved?.id ?? quoteId;
  } else {
    await ctx.svc
      .from("transport_quotes")
      .update(body.kind === "award" ? { confirmation_sent_at: sentAt } : { rejection_sent_at: sentAt })
      .eq("id", quote!.id);
  }

  // The mail went out; recording it as a thread is best effort and reported as a warning.
  const { threadId, warning } = await recordSentMail(ctx.svc, {
    ...mail,
    sent,
    userId: ctx.userId,
    links: [
      ...(transport.specification_id ? [{ entity_type: "specifications", entity_id: transport.specification_id }] : []),
      ...(transport.order_id ? [{ entity_type: "orders", entity_id: transport.order_id }] : []),
    ],
  });
  if (threadId && body.kind === "request" && quoteId) await ctx.svc.from("transport_quotes").update({ email_thread_id: threadId }).eq("id", quoteId);
  return json({ ok: true, quote_id: quoteId, warning });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let body: { action?: string; specification_id?: string; order_id?: string; estimated_arrival?: string | null } & TransportEmailBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const uc = userClient(req.headers.get("Authorization"));
  const { data: authData, error: authError } = await uc.auth.getUser();
  if (authError || !authData.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const ctx: Ctx = { svc: serviceClient(), userId: authData.user.id, userEmail: authData.user.email ?? "" };
  if (!ctx.userEmail) return json({ ok: false, error: "Your account has no email address" }, 400);

  const mayEdit = async (entityType: string, id: string) => {
    const { data } = await uc.rpc("can_access_entity", { p_entity_type: entityType, p_entity_id: id, p_grant_type: "edit" });
    return data === true;
  };

  if (body.action === "availability_send" && body.specification_id) {
    if (!(await mayEdit("specifications", body.specification_id))) return json({ ok: false, error: "Not allowed" }, 403);
    return availabilitySend(ctx, body.specification_id, body.estimated_arrival ?? null);
  }
  if (body.action === "availability_email" && body.request_id && body.mailbox_id) {
    return availabilityEmail(ctx, uc, body);
  }
  if (body.action === "transport_email" && body.mailbox_id) {
    return transportEmail(ctx, uc, body);
  }
  if (body.action === "order_send" && body.order_id) {
    if (!(await mayEdit("orders", body.order_id))) return json({ ok: false, error: "Not allowed" }, 403);
    return orderSend(ctx, body.order_id);
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
