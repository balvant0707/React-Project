// Ported 1:1 from the NPM tool (app/src/pdf/pdfTheme.ts).
// Shared visual language for both PDF documents - same restrained blue
// accent and hairline-rule minimalism as the app itself (see
// app/src/theme.ts), not a separate "print" identity.
import { formatNumber } from "@rbp/ui";
import { formatDate } from "@rbp/ui";

export const BRAND_COLOR = "#2952E3";
export const TEXT_DARK = "#141414";
export const TEXT_MUTED = "#767676";
export const BORDER_COLOR = "#E5E5E5";
export const BG_LIGHT = "#FAFAFA";

// Plain amount, no currency suffix - for tables/totals where the currency is
// stated once (a column header or section label) rather than repeated on
// every row/value, which also keeps decimal points aligned when right-aligned.
export const formatAmount = formatNumber;

export const formatPdfDate = formatDate;

// "12.11.2026 - 18.11.2026" for a delivery window, the single date when there is no (different) start.
export const formatPdfDateRange = (from: string | null | undefined, to: string | null | undefined) =>
  from && to && from !== to ? `${formatDate(from)} - ${formatDate(to)}` : formatDate(to ?? from);

// "Drydock Q4 2027" on the Technical Spec PDF's cover - the hull event's own
// type plus the quarter/year of its event_date, not a full calendar date
// (which the cover intentionally keeps out of the hero design - see
// TechnicalSpecPdf.tsx).
export const formatQuarterYear = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${d.getUTCFullYear()}`;
};

// Shared across both PDF templates' table columns (was copy-pasted
// identically in each).
export const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
export const right = { textAlign: "right" as const };
