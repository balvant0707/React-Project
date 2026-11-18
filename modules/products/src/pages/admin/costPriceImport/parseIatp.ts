// Ported 1:1 from the NPM tool (app/src/pages/admin/costPriceImport/parseIatp.ts).
// Parser for the SCMS "IATP Data Export" price list (.xlsx, sheet "IATP Data":
// two title rows, a blank row, then the header row). Pure - no I/O - so the
// preview logic can be checked without a browser. Reference file:
// Reference documents/Demo Data/IATP_Export_*.xlsx.

export type IatpRow = {
  rowNumber: number; // 1-based spreadsheet row, for messages
  supplierKey: string; // "PMC17 Code" - matches product_packagings.supplier_key
  country: string;
  entityCode: string; // supplier company, cleaned of the " : from ZJG factory" style suffix
  packSize: number | null;
  unit: string | null; // normalized to L / G / K
  price: number | null; // null = blank or 0 = no price set
  year: number | null;
  month: number | null; // 1-12
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// File units seen: L, Ltr, G, K, Kg. Packagings use L / G / K.
export const normalizeUnit = (raw: unknown): string | null => {
  const u = String(raw ?? "").trim().toLowerCase();
  if (!u || u === "-") return null;
  if (u === "l" || u === "ltr" || u === "lt" || u === "liter" || u === "litre") return "L";
  if (u === "g" || u === "gal" || u === "gallon") return "G";
  if (u === "k" || u === "kg") return "K";
  return String(raw).trim();
};

const toNumber = (raw: unknown): number | null => {
  if (raw == null || raw === "" || raw === "-") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// "NPMZ(Z) : from ZJG factory" -> "NPMZ(Z)"
const cleanEntityCode = (raw: unknown): string => String(raw ?? "").split(" : ")[0].trim();

export type ParsedIatp = { rows: IatpRow[]; error?: string };

export function parseIatpSheet(sheet: unknown[][]): ParsedIatp {
  const headerIndex = sheet.findIndex((r) => r.some((c) => String(c ?? "").trim() === "PMC17 Code"));
  if (headerIndex < 0) return { rows: [], error: 'No header row with a "PMC17 Code" column found - is this an IATP export?' };
  const col = new Map<string, number>();
  sheet[headerIndex].forEach((c, i) => col.set(String(c ?? "").trim(), i));
  const need = ["PMC17 Code", "Country", "Entity Code", "Price (US$/L or G)"];
  const missing = need.filter((n) => !col.has(n));
  if (missing.length) return { rows: [], error: `Missing column(s): ${missing.join(", ")}` };

  const cell = (r: unknown[], name: string) => r[col.get(name) ?? -1];
  const rows: IatpRow[] = [];
  for (let i = headerIndex + 1; i < sheet.length; i++) {
    const r = sheet[i];
    const supplierKey = String(cell(r, "PMC17 Code") ?? "").trim();
    if (!supplierKey) continue;
    const price = toNumber(cell(r, "Price (US$/L or G)"));
    const monthRaw = String(cell(r, "Month") ?? "").trim().toLowerCase();
    const monthIndex = MONTHS.indexOf(monthRaw);
    rows.push({
      rowNumber: i + 1,
      supplierKey,
      country: String(cell(r, "Country") ?? "").trim(),
      entityCode: cleanEntityCode(cell(r, "Entity Code")),
      packSize: toNumber(cell(r, "Pack Size 1")),
      unit: normalizeUnit(cell(r, "Pack UOM 1")),
      price: price != null && price > 0 ? price : null,
      year: toNumber(cell(r, "Year")),
      month: monthIndex >= 0 ? monthIndex + 1 : null,
    });
  }
  return { rows };
}

// The file's own period as a first-of-month ISO date, when every row agrees.
export function filePeriodStart(rows: IatpRow[]): string | null {
  const periods = new Set(rows.map((r) => (r.year && r.month ? `${r.year}-${String(r.month).padStart(2, "0")}-01` : "")));
  periods.delete("");
  return periods.size === 1 ? Array.from(periods)[0] : null;
}

// Several rows for one supplier key: the last one wins, the rest are reported.
export function dedupeByKey(rows: IatpRow[]): { rows: IatpRow[]; duplicates: IatpRow[] } {
  const byKey = new Map<string, IatpRow>();
  const duplicates: IatpRow[] = [];
  for (const r of rows) {
    const previous = byKey.get(r.supplierKey);
    if (previous) duplicates.push(previous);
    byKey.set(r.supplierKey, r);
  }
  return { rows: Array.from(byKey.values()), duplicates };
}
