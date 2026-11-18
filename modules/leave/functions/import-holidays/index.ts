// Ported 1:1 from COMPASS (supabase/functions/import-holidays/index.ts).
// Imports public holidays for Germany from Nager.Date (https://date.nager.at, open source, no key) into public_holidays.
// Admin only (~/maintenance_tool/docs/leave.md "Holidays").
//   POST { years: [2027, 2028] }  -> { ok, imported, years, sites_without_region }
// The caller is checked with their own JWT (is_admin(), which also enforces the second factor); the rows are written by
// the service role through holidays_replace_import(), which replaces only earlier imported rows of the period.
// The answer of the external service is validated before anything is stored: shape, date format and year, name length.
// Nationwide holidays are stored once for everybody; a regional one for every site whose federal state (site_regions) it
// applies to. Nager.Date lists a holiday that only some municipalities of a state keep for the whole state: an admin
// removes those by hand.
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Nager = { date: string; localName: string; global: boolean; counties: string[] | null; types?: string[] };
type Row = { date: string; name: string; site: string | null };

async function fetchYear(year: number): Promise<Nager[]> {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/DE`, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nager.Date answered ${res.status} for ${year}`);
  const body = await res.json();
  if (!Array.isArray(body) || body.length === 0 || body.length > 100) throw new Error(`Unexpected answer for ${year}`);
  const out: Nager[] = [];
  for (const h of body) {
    const ok = h && typeof h.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.date.startsWith(`${year}-`)
      && typeof h.localName === "string" && h.localName.trim().length > 0 && h.localName.length <= 100
      && typeof h.global === "boolean" && (h.counties === null || (Array.isArray(h.counties) && h.counties.every((c: unknown) => typeof c === "string" && /^DE-[A-Z]{2}$/.test(c))));
    if (!ok) throw new Error(`Unexpected entry in the answer for ${year}`);
    out.push(h as Nager);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: isAdmin } = await caller.rpc("is_admin");
  if (isAdmin !== true) return json({ error: "admin_only" }, 403);

  const body = await req.json().catch(() => null);
  const years: number[] = Array.isArray(body?.years) ? [...new Set<number>(body.years)] : [];
  if (years.length === 0 || years.length > 6 || !years.every((y) => Number.isInteger(y) && y >= 2020 && y <= 2040)) {
    return json({ error: "years_invalid" }, 400);
  }
  years.sort((a, b) => a - b);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: regions, error: regionError } = await admin.from("site_regions").select("site, region");
  if (regionError) return json({ error: "regions_failed", message: regionError.message }, 500);
  const sitesByRegion = new Map<string, string[]>();
  for (const r of regions ?? []) sitesByRegion.set(r.region, [...(sitesByRegion.get(r.region) ?? []), r.site]);

  const rows: Row[] = [];
  try {
    // The years are independent, so they are fetched at the same time (six sequential 10 s timeouts would be a minute).
    const perYear = await Promise.all(years.map((year) => fetchYear(year)));
    for (const list of perYear) {
      for (const h of list) {
        if (h.types && !h.types.includes("Public")) continue;
        const name = h.localName.trim();
        if (h.global || h.counties === null) {
          rows.push({ date: h.date, name, site: null });
        } else {
          for (const county of h.counties) for (const site of sitesByRegion.get(county) ?? []) rows.push({ date: h.date, name, site });
        }
      }
    }
  } catch (e) {
    return json({ error: "fetch_failed", message: (e as Error).message }, 502);
  }

  const { data: imported, error } = await admin.rpc("holidays_replace_import", {
    p_from: `${years[0]}-01-01`,
    p_to: `${years[years.length - 1]}-12-31`,
    p_rows: rows,
  });
  if (error) return json({ error: "store_failed", message: error.message }, 500);

  const { data: users } = await admin.from("users").select("site").not("site", "is", null);
  const known = new Set((regions ?? []).map((r) => r.site));
  const withoutRegion = [...new Set((users ?? []).map((u) => u.site as string))].filter((s) => !known.has(s));
  return json({ ok: true, imported, years, sites_without_region: withoutRegion });
});
