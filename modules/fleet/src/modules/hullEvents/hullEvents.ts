// Ported 1:1 from the NPM tool (app/src/modules/hullEvents/hullEvents.ts).
import { supabaseClient } from "@rbp/core";
import { orFilterTerm } from "@rbp/ui";

const HULL_EVENT_SEARCH_LIMIT = 50;

type HullEventRow = {
  id: string;
  event_date: string | null;
  vessels: { name: string | null; imo: string } | null;
  phrases: { code: string; text_en: string } | null;
};

// Hull events are month-grain (day always the 1st) - see utils/formatDate.ts's
// own formatMonthYear comment for the same fact about the column.
const monthYear = (v: string | null) => (v ? v.slice(0, 7).split("-").reverse().join("/") : "?");

const hullEventLabel = (h: HullEventRow) =>
  `${h.vessels?.name ?? "?"} (${h.vessels?.imo ?? "?"}) - ${h.phrases?.code ?? "?"} ${monthYear(h.event_date)}`;

// Hull events whose vessel's name or IMO contains `term` (server-side,
// capped) - for the order-creation "pick a hull event to prefill vessel +
// customer" picker. Filters through the embedded vessels resource (`!inner`
// so the filter narrows the parent rows, not just the embed - see
// modules/vessels/vessels.ts's own searchVesselOptions for the same
// or()-escaping reasoning).
export async function searchHullEventOptions(term: string): Promise<{ value: string; label: string }[]> {
  const safe = orFilterTerm(term);
  if (!safe) return [];
  const { data } = await supabaseClient
    .from("hull_events")
    .select("id, event_date, vessels!inner(name, imo), phrases(code, text_en)")
    .or(`name.ilike.%${safe}%,imo.ilike.%${safe}%`, { referencedTable: "vessels" })
    .order("event_date", { ascending: false })
    .limit(HULL_EVENT_SEARCH_LIMIT);
  return ((data ?? []) as unknown as HullEventRow[]).map((h) => ({ value: h.id, label: hullEventLabel(h) }));
}

// Labels for specific hull event ids (restoring a saved order's picker, or a
// value just set programmatically).
export async function loadHullEventOptionsByIds(ids: string[]): Promise<{ value: string; label: string }[]> {
  if (!ids.length) return [];
  const { data } = await supabaseClient
    .from("hull_events")
    .select("id, event_date, vessels(name, imo), phrases(code, text_en)")
    .in("id", ids);
  return ((data ?? []) as unknown as HullEventRow[]).map((h) => ({ value: h.id, label: hullEventLabel(h) }));
}
