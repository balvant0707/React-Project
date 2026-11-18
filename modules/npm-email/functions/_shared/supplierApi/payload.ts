// Ported 1:1 from the NPM tool (supabase/functions/_shared/supplierApi/payload.ts).
import type { NeutralLine, OrderType } from "./types.ts";

export function orderTypeFor(code: string | null | undefined): OrderType {
  return code === "DD" ? "DD" : code === "SS" ? "SS" : "Other";
}

type PackagingRow = {
  supplier_key: string;
  pack_size: number | string;
  unit: string;
  products: { name: string; colour: string | null } | null;
} | null;

// Turns spec line items / order lines into API lines. Lines with no quantity are
// skipped (a line zeroed after an availability answer must not be re-requested);
// numbering is by position among the lines actually sent.
export function buildLines(
  rows: { quantity: number | string | null; product_packagings: PackagingRow }[],
): { lines: NeutralLine[]; missing: string[] } {
  const lines: NeutralLine[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    const qty = Number(row.quantity ?? 0);
    if (!(qty > 0)) continue;
    const p = row.product_packagings;
    if (!p) continue;
    if (!p.supplier_key) {
      missing.push(`supplier product code for ${p.products?.name ?? "a line"}`);
      continue;
    }
    lines.push({
      lineNumber: lines.length + 1,
      supplierKey: p.supplier_key,
      productName: p.products?.name ?? p.supplier_key,
      colour: p.products?.colour ?? null,
      packSize: Number(p.pack_size),
      packUnit: String(p.unit).toUpperCase(),
      numberOfPacks: qty,
    });
  }
  if (lines.length === 0 && missing.length === 0) missing.push("at least one line with a quantity");
  return { lines, missing };
}
