// Ported 1:1 from the NPM tool (app/src/pages/specifications/availability.ts).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@rbp/core";

// Availability requests of one specification and the supplier's answers (~/npm_tool/docs/supplier-api-integration.md,
// "Availability answers"). Users only read these tables; writes go through the RPCs of migration
// 20261022100000 (manual / email) and the supplier-api Edge Function (API, Graph email).

export type AvailabilityChannel = "api" | "email" | "manual";

export type AvailabilityLine = {
  id: string;
  availability_request_id: string;
  specification_line_item_id: string | null;
  product_packaging_id: string;
  line_number: number;
  requested_qty: number;
  confirmed_qty: number | null;
  confirmed_date: string | null;
  comment: string | null;
  answered_at: string | null;
  answered_by_user_id: string | null;
};

export type AvailabilityRequest = {
  id: string;
  request_number: string;
  supplier_id: string;
  channel: AvailabilityChannel;
  supplier_enquiry_number: string | null;
  estimated_arrival: string | null;
  requested_at: string | null;
  requested_by_user_id: string | null;
  email_thread_id: string | null;
  created_at: string;
  availability_request_lines: AvailabilityLine[];
};

// A line's state from its answer: confirmed >= asked -> available, 0 -> not available, between -> partly.
export type AvailabilityState = "available" | "partial" | "unavailable" | "pending";

export const availabilityState = (line: Pick<AvailabilityLine, "requested_qty" | "confirmed_qty">): AvailabilityState =>
  line.confirmed_qty == null
    ? "pending"
    : Number(line.confirmed_qty) <= 0
      ? "unavailable"
      : Number(line.confirmed_qty) >= Number(line.requested_qty)
        ? "available"
        : "partial";

// How the Availability cell colours an answer: green = available on or before the delivery date (end of the
// range), yellow = confirmed up to LATE_YELLOW_DAYS after it, red = later than that, partly available or not
// available. No answer yet = no colour.
export const LATE_YELLOW_DAYS = 14;
export type AvailabilityTone = "green" | "yellow" | "red" | "none";

export function availabilityTone(
  line: Pick<AvailabilityLine, "requested_qty" | "confirmed_qty" | "confirmed_date">,
  deliveryDate: string | null | undefined,
): { tone: AvailabilityTone; lateDays: number } {
  const state = availabilityState(line);
  if (state === "pending") return { tone: "none", lateDays: 0 };
  if (state === "unavailable" || state === "partial") return { tone: "red", lateDays: 0 };
  const lateDays =
    line.confirmed_date && deliveryDate
      ? Math.round((Date.parse(line.confirmed_date) - Date.parse(deliveryDate)) / 86_400_000)
      : 0;
  if (lateDays <= 0) return { tone: "green", lateDays: 0 };
  return { tone: lateDays <= LATE_YELLOW_DAYS ? "yellow" : "red", lateDays };
}

export const CHANNEL_LABELS: Record<AvailabilityChannel, string> = { api: "API", email: "Email", manual: "Manual" };

// The line's latest entry in a sent request: what the Availability column shows and the single-line modal edits.
export type LineAvailability = AvailabilityLine & { request: AvailabilityRequest };

export function useSpecificationAvailability(specificationId: string | null | undefined) {
  const [requests, setRequests] = useState<AvailabilityRequest[]>([]);

  const reload = useCallback(async () => {
    if (!specificationId) {
      setRequests([]);
      return;
    }
    const { data } = await supabaseClient
      .from("availability_requests")
      .select(
        "id, request_number, supplier_id, channel, supplier_enquiry_number, estimated_arrival, requested_at, requested_by_user_id, email_thread_id, created_at, " +
          "availability_request_lines(id, availability_request_id, specification_line_item_id, product_packaging_id, line_number, requested_qty, confirmed_qty, confirmed_date, comment, answered_at, answered_by_user_id)",
      )
      .eq("specification_id", specificationId)
      .order("created_at", { ascending: false });
    setRequests(
      ((data ?? []) as any[]).map((r) => ({
        ...r,
        availability_request_lines: [...(r.availability_request_lines ?? [])].sort((a: any, b: any) => a.line_number - b.line_number),
      })),
    );
  }, [specificationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const byLineItemId = useMemo(() => {
    const map = new Map<string, LineAvailability>();
    const sent = requests
      .filter((r) => r.requested_at)
      .sort((a, b) => (b.requested_at ?? "").localeCompare(a.requested_at ?? ""));
    for (const request of sent) {
      for (const line of request.availability_request_lines) {
        if (line.specification_line_item_id && !map.has(line.specification_line_item_id)) {
          map.set(line.specification_line_item_id, { ...line, request });
        }
      }
    }
    return map;
  }, [requests]);

  const hasSentRequest = requests.some((r) => r.requested_at);

  return { requests, byLineItemId, hasSentRequest, reload };
}
