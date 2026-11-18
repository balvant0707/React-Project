// Ported 1:1 from the NPM tool (app/src/modules/transport/mail.ts).
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { loadPackagingsByIds } from "@rbp/module-products/src/modules/products/packagings.ts";
import { loadPhraseOptions } from "@rbp/core";
import { incotermText } from "../phrases/incoterm";
import { formatNumber } from "@rbp/ui";
import { escapeHtml, paragraphs } from "@rbp/ui";
import { offeredLines } from "../../pages/specifications/lineItemCalc";

// The mails to forwarders about a transport (quote request, order confirmation to the awarded forwarder, notice to
// the others). The context is read from the offer or order the transport belongs to; the HTML is built here and sent
// by the Edge Function supplier-api (action transport_email).

export type TransportMailKind = "request" | "award" | "reject";

export type TransportMailContext = {
  reference: string;
  vesselName: string | null;
  imo: string | null;
  deliveryPlace: string | null;
  incoterm: string | null;
  currency: string | null;
  goods: { label: string; packs: number | null; packSize: number | null; unit: string | null }[];
  userName: string | null;
  userEmail: string | null;
};

export async function loadTransportMailContext(specificationId: string | null | undefined, orderId: string | null | undefined, userId: string | undefined): Promise<TransportMailContext> {
  const incotermOptions = await loadPhraseOptions("incoterm");
  const [{ data: user }] = await Promise.all([
    userId ? supabaseClient.from("users").select("name, email").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let reference = "";
  let vessel: any = null;
  let place: string | null = null;
  let incoterm: string | null = null;
  let currency: string | null = null;
  let rawLines: { product_packaging_id: string | null; packs: number | null }[] = [];

  if (orderId) {
    const { data: o } = (await supabaseClient
      .from("orders")
      .select("order_number, delivery_port, incoterm_phrase_id, incoterm_place, currency, vessels(name, imo), order_lines(product_packaging_id, ordered_packs)")
      .eq("id", orderId)
      .single()) as any;
    reference = o?.order_number ?? "";
    vessel = o?.vessels;
    place = o?.delivery_port ?? null;
    incoterm = incotermText(incotermOptions, o?.incoterm_phrase_id, o?.incoterm_place);
    currency = o?.currency ?? null;
    rawLines = (o?.order_lines ?? []).map((l: any) => ({ product_packaging_id: l.product_packaging_id, packs: l.ordered_packs }));
  } else if (specificationId) {
    const { data: s } = (await supabaseClient
      .from("specifications")
      .select("specification_number, version, incoterm_phrase_id, incoterm_place, currency, vessels(name, imo), ports(name), specification_line_items(is_offered, product_packaging_id, offered_packs)")
      .eq("id", specificationId)
      .single()) as any;
    reference = s ? `${s.specification_number} v${s.version}` : "";
    vessel = s?.vessels;
    place = s?.ports?.name ?? null;
    incoterm = incotermText(incotermOptions, s?.incoterm_phrase_id, s?.incoterm_place);
    currency = s?.currency ?? null;
    rawLines = offeredLines<any>(s?.specification_line_items ?? [])
      .map((l: any) => ({ product_packaging_id: l.product_packaging_id, packs: l.offered_packs }));
  }

  const packagings = await loadPackagingsByIds(rawLines.map((l) => l.product_packaging_id).filter(Boolean) as string[]);
  const byId = new Map(packagings.map((p) => [p.id, p]));
  const goods = rawLines
    .filter((l) => l.product_packaging_id)
    .map((l: any) => {
      const p = byId.get(l.product_packaging_id!);
      return { label: p?.label ?? "-", packs: l.packs ?? null, packSize: p?.pack_size ?? null, unit: p?.unit ?? null };
    });

  return {
    reference,
    vesselName: vessel?.name ?? null,
    imo: vessel?.imo ?? null,
    deliveryPlace: place,
    incoterm,
    currency,
    goods,
    userName: (user as any)?.name ?? null,
    userEmail: (user as any)?.email ?? null,
  };
}

export function defaultSubject(kind: TransportMailKind, ctx: TransportMailContext): string {
  const vessel = [ctx.vesselName, ctx.imo ? `(IMO ${ctx.imo})` : null].filter(Boolean).join(" ");
  const head = { request: "Transport quote request", award: "Transport order", reject: "Transport quote request" }[kind];
  return [`${head} ${ctx.reference}`, vessel].filter(Boolean).join(" - ") + (kind === "reject" ? " - not awarded" : "");
}

export function defaultIntro(kind: TransportMailKind): string {
  if (kind === "request") {
    return "Dear Sir or Madam,\n\nplease send us your quotation for the transport described below.";
  }
  if (kind === "award") {
    return "Dear Sir or Madam,\n\nthank you for your quotation. We would like to award the transport described below to you.";
  }
  return "Dear Sir or Madam,\n\nthank you for your quotation. We have decided to award this transport to another forwarder this time.";
}

export function defaultClosing(kind: TransportMailKind, ctx: TransportMailContext): string {
  const closing = {
    request: "Please include the transit time, validity of the offer and any surcharges.",
    award: "Please confirm the order and send us the pickup and delivery details.",
    reject: "We hope to work with you on another occasion.",
  }[kind];
  return `${closing}\n\nBest regards\n${ctx.userName ?? ""}`;
}

type BuildOptions = { plannedDate?: string | null; price?: number | null; currency?: string | null };

export function buildTransportMailHtml(kind: TransportMailKind, ctx: TransportMailContext, intro: string, closing: string, options: BuildOptions = {}): string {
  const cell = 'style="padding:2px 12px 2px 0"';
  const rows: [string, string | null | undefined][] = [
    ["Reference", ctx.reference],
    ["Vessel", [ctx.vesselName, ctx.imo ? `IMO ${ctx.imo}` : null].filter(Boolean).join(", ")],
    ["Delivery", [ctx.deliveryPlace, ctx.incoterm].filter(Boolean).join(" - ")],
    ["Planned date", options.plannedDate ? dayjs(options.plannedDate).format("DD.MM.YYYY") : null],
    ...(kind === "award" && options.price != null ? ([["Agreed price", `${formatNumber(options.price)} ${options.currency ?? ctx.currency ?? ""}`.trim()]] as [string, string][]) : []),
  ];
  const details =
    kind === "reject"
      ? ""
      : `<table style="border-collapse:collapse">${rows
          .filter(([, v]) => v)
          .map(([k, v]) => `<tr><td ${cell}><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v!)}</td></tr>`)
          .join("")}</table>`;
  const goods =
    kind === "reject" || ctx.goods.length === 0
      ? ""
      : `<p><strong>Goods</strong></p><table style="border-collapse:collapse">${ctx.goods
          .map(
            (g) =>
              `<tr><td ${cell}>${escapeHtml(g.label)}</td><td ${cell}>${g.packs != null ? `${formatNumber(g.packs)} x ${g.packSize != null ? formatNumber(g.packSize) : ""} ${escapeHtml(g.unit ?? "")}` : ""}</td></tr>`,
          )
          .join("")}</table>`;
  return `<div style="font-family:Arial,sans-serif;font-size:14px">${paragraphs(intro)}${details}${goods}${paragraphs(closing)}</div>`;
}
