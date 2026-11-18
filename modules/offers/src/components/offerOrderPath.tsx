// Ported 1:1 from the NPM tool (app/src/components/offerOrderPath.tsx).
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Dropdown, Steps } from "antd";
import { FileTextOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { formatInstant } from "@rbp/ui";

// The path of one deal across its records: Request for Quotation -> Availability request -> Availability checked ->
// Offer -> Order (Seastock; DD/NB have no request step and call the offer "Specification"). Shown on top of the
// specification and the order page, with jump buttons between the two. Every step is derived from the records,
// nothing is stored; the offer page puts its availability request buttons into the "Availability request" step.

type TrailOrder = { id: string; order_number: string; status_text: string | null; status_code: string | null };

export type OfferOrderTrail = {
  specificationId: string;
  specificationNumber: string;
  version: number;
  status: string;
  isSeastock: boolean;
  requestReceivedAt: string | null;
  sentAt: string | null;
  requestedLines: number;
  sentRequests: number;
  askedLines: number;
  answeredLines: number;
  orders: TrailOrder[];
};

// reloadKey: anything that changes when the page changed one of these records (status, requests, answers).
export function useOfferOrderTrail(specificationId: string | null | undefined, reloadKey?: unknown): OfferOrderTrail | null {
  const [trail, setTrail] = useState<OfferOrderTrail | null>(null);
  useEffect(() => {
    if (!specificationId) {
      setTrail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: spec }, { data: requests }, { data: orders }] = await Promise.all([
        supabaseClient
          .from("specifications")
          .select("id, specification_number, version, status, hull_event_id, hull_event_type_code, request_received_at, sent_at, specification_line_items(is_requested)")
          .eq("id", specificationId)
          .maybeSingle(),
        supabaseClient
          .from("availability_requests")
          .select("requested_at, availability_request_lines(specification_line_item_id, confirmed_qty)")
          .eq("specification_id", specificationId)
          .not("requested_at", "is", null),
        supabaseClient
          .from("orders")
          .select("id, order_number, created_at, status:phrases!orders_status_phrase_id_fkey(code, text_en)")
          .eq("specification_id", specificationId)
          .is("deleted_at", null)
          .order("created_at"),
      ]);
      if (cancelled || !spec) return;
      const s: any = spec;
      // A line counts once, with its latest answer (requests come back in any order).
      const latest = new Map<string, { at: string; answered: boolean }>();
      for (const [ri, r] of ((requests ?? []) as any[]).entries()) {
        for (const [li, l] of ((r.availability_request_lines ?? []) as any[]).entries()) {
          // A line whose spec line was deleted has no item id; it counts on its own.
          const key = l.specification_line_item_id ?? `removed-${ri}-${li}`;
          const prev = latest.get(key);
          if (!prev || prev.at < r.requested_at) latest.set(key, { at: r.requested_at, answered: l.confirmed_qty != null });
        }
      }
      setTrail({
        specificationId: s.id,
        specificationNumber: s.specification_number,
        version: s.version,
        status: s.status,
        isSeastock: !s.hull_event_id || s.hull_event_type_code === "SS",
        requestReceivedAt: s.request_received_at ?? null,
        sentAt: s.sent_at ?? null,
        requestedLines: (s.specification_line_items ?? []).filter((li: any) => li.is_requested).length,
        sentRequests: (requests ?? []).length,
        askedLines: latest.size,
        answeredLines: [...latest.values()].filter((v) => v.answered).length,
        orders: ((orders ?? []) as any[]).map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status_text: o.status?.text_en ?? null,
          status_code: o.status?.code ?? null,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [specificationId, reloadKey]);
  return trail;
}

// What the bar shows before the records exist: a specification that is not saved yet, or an order without an
// offer. specificationId "" = no offer record (no links to it).
export function emptyTrail(isSeastock: boolean): OfferOrderTrail {
  return {
    specificationId: "",
    specificationNumber: "",
    version: 1,
    status: "draft",
    isSeastock,
    requestReceivedAt: null,
    sentAt: null,
    requestedLines: 0,
    sentRequests: 0,
    askedLines: 0,
    answeredLines: 0,
    orders: [],
  };
}

const OFFER_STATUS_TEXT: Record<string, string> = {
  draft: "Draft",
  under_review: "Under review",
  approved: "Approved",
  accepted: "Accepted",
  lost: "Lost",
};

// orderPage: the page is an order (also one that is not saved yet, then there is no currentOrderId).
// availabilityActions: the request buttons of the offer page, shown in the "Availability request" step.
export function OfferOrderPath({
  trail,
  currentOrderId,
  orderPage,
  availabilityActions,
}: {
  trail: OfferOrderTrail;
  currentOrderId?: string;
  orderPage?: boolean;
  availabilityActions?: ReactNode;
}) {
  const navigate = useNavigate();
  const offerLabel = trail.isSeastock ? "Offer" : "Specification";
  const hasOffer = !!trail.specificationId;
  const offerPath = hasOffer ? `/specifications/${trail.specificationId}` : undefined;
  const onOrderPage = orderPage || !!currentOrderId;
  const shownOrder = trail.orders.find((o) => o.id === currentOrderId) ?? trail.orders[trail.orders.length - 1];
  const offerDone = trail.status === "accepted";
  const requested = trail.sentRequests > 0;
  const allAnswered = requested && trail.answeredLines >= trail.askedLines;
  // The offer has moved on (sent, in review, approved, decided) or an order exists: the availability steps before
  // it are no longer "current", even if not every line was answered.
  const offerMovedOn = !!trail.sentAt || trail.status !== "draft" || trail.orders.length > 0 || onOrderPage;

  type Item = { key: string; title: string; description: ReactNode; status: "wait" | "process" | "finish" | "error"; to?: string | undefined };
  const items: Item[] = [];
  if (trail.isSeastock) {
    items.push({
      key: "request",
      title: "Request for Quotation",
      description: trail.requestReceivedAt
        ? `Received ${formatInstant(trail.requestReceivedAt, "DD.MM. HH:mm")}`
        : trail.requestedLines > 0
          ? `${trail.requestedLines} line${trail.requestedLines === 1 ? "" : "s"} requested`
          : hasOffer
            ? "No requested lines"
            : "-",
      // A deal that is just being opened starts here.
      status: !hasOffer && !onOrderPage ? "process" : hasOffer ? "finish" : "wait",
      to: offerPath,
    });
  }
  items.push({
    key: "availability-request",
    title: "Availability request",
    description: (
      <>
        <div>{!hasOffer ? "-" : requested ? `${trail.sentRequests} sent` : offerMovedOn ? "Not requested" : "Not sent yet"}</div>
        {availabilityActions && <div style={{ marginTop: 4 }}>{availabilityActions}</div>}
      </>
    ),
    status: requested ? "finish" : hasOffer && !offerMovedOn && trail.isSeastock ? "process" : "wait",
    to: offerPath,
  });
  items.push({
    key: "availability-checked",
    title: "Availability checked",
    description: !requested ? "-" : allAnswered ? "Answered" : `${trail.answeredLines} / ${trail.askedLines} answered`,
    status: allAnswered ? "finish" : requested && !offerMovedOn ? "process" : "wait",
    to: offerPath,
  });
  items.push({
    key: "offer",
    title: offerLabel,
    description: hasOffer
      ? `${trail.specificationNumber} v${trail.version} · ${OFFER_STATUS_TEXT[trail.status] ?? trail.status}${trail.sentAt ? ` · sent ${formatInstant(trail.sentAt, "DD.MM.")}` : ""}`
      : onOrderPage
        ? "No offer"
        : "Not saved yet",
    status: !hasOffer
      ? onOrderPage || trail.isSeastock
        ? "wait"
        : "process"
      : trail.status === "lost"
        ? "error"
        : offerDone
          ? "finish"
          : offerMovedOn || allAnswered || !trail.isSeastock
            ? "process"
            : "wait",
    to: offerPath,
  });
  items.push({
    key: "order",
    title: "Order",
    description: shownOrder
      ? `${shownOrder.order_number}${shownOrder.status_text ? ` · ${shownOrder.status_text}` : ""}${trail.orders.length > 1 ? ` (+${trail.orders.length - 1} more)` : ""}`
      : onOrderPage
        ? "Not saved yet"
        : "No order yet",
    status: !shownOrder ? (onOrderPage ? "process" : "wait") : shownOrder.status_code === "cancelled" ? "error" : "finish",
    to: shownOrder ? `/orders/${shownOrder.id}` : undefined,
  });

  // The step of the page you are on is not a link: the order, else the offer (a new Seastock offer: the request).
  const here = onOrderPage
    ? items.length - 1
    : !hasOffer && trail.isSeastock
      ? 0
      : items.findIndex((i) => i.key === "offer");
  return (
    <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: "12px 16px" } }}>
      <Steps
        size="small"
        current={here}
        onChange={(index) => {
          const to = items[index]?.to;
          if (to && index !== here) navigate(to);
        }}
        items={items.map((item, index) => ({
          title: item.title,
          description: item.description,
          status: item.status,
          disabled: !item.to || index === here || (item.key === "availability-request" && !!availabilityActions),
        }))}
      />
    </Card>
  );
}

// Header buttons: from the offer to its order(s), and from an order back to its offer.
export function OrderLinksButton({ trail }: { trail: OfferOrderTrail | null }) {
  const navigate = useNavigate();
  if (!trail || trail.orders.length === 0) return null;
  if (trail.orders.length === 1) {
    const order = trail.orders[0];
    return (
      <Button icon={<ShoppingCartOutlined />} onClick={() => navigate(`/orders/${order.id}`)}>
        Order {order.order_number}
      </Button>
    );
  }
  return (
    <Dropdown
      menu={{
        items: trail.orders.map((o) => ({ key: o.id, label: `${o.order_number}${o.status_text ? ` · ${o.status_text}` : ""}` })),
        onClick: ({ key }) => navigate(`/orders/${key}`),
      }}
    >
      <Button icon={<ShoppingCartOutlined />}>Orders ({trail.orders.length})</Button>
    </Dropdown>
  );
}

export function OfferLinkButton({ trail }: { trail: OfferOrderTrail | null }) {
  const navigate = useNavigate();
  if (!trail) return null;
  return (
    <Button icon={<FileTextOutlined />} onClick={() => navigate(`/specifications/${trail.specificationId}`)}>
      {trail.isSeastock ? "Offer" : "Specification"} {trail.specificationNumber} v{trail.version}
    </Button>
  );
}
