// Ported 1:1 from the NPM tool (app/src/pages/orders/statusColor.ts).
// Shared status-color mapping for orders - used by list.tsx, show.tsx, and
// the "Show Orders" links' target list, so the same status always renders
// the same color everywhere an order shows up.
export type OrderStatusCode = "confirmed" | "delivered" | "invoiced" | "cancelled";

export const ORDER_STATUS_COLOR: Record<OrderStatusCode, string> = {
  confirmed: "yellow",
  delivered: "blue",
  invoiced: "green",
  cancelled: "red",
};

// Offers & Orders list: one hex per status, used for the row strip and the status tag (offer and order codes are disjoint).
export const DEAL_STATUS_COLOR: Record<string, string> = {
  draft: "#bfbfbf",
  under_review: "#fa8c16",
  approved: "#13c2c2",
  accepted: "#722ed1",
  lost: "#cf1322",
  confirmed: "#faad14",
  delivered: "#1677ff",
  invoiced: "#52c41a",
  cancelled: "#a8071a",
};

export const DEAL_STATUS_LEGEND: { code: string; label: string }[] = [
  { code: "draft", label: "Offer: Draft" },
  { code: "under_review", label: "Offer: Under review" },
  { code: "approved", label: "Offer: Approved" },
  { code: "accepted", label: "Offer: Accepted" },
  { code: "lost", label: "Offer: Lost" },
  { code: "confirmed", label: "Order: Confirmed" },
  { code: "delivered", label: "Order: Delivered" },
  { code: "invoiced", label: "Order: Invoiced" },
  { code: "cancelled", label: "Order: Cancelled" },
];
