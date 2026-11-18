// From the NPM tool (app/src/utils/formatNumber.ts), until 2026-11-13 ported into npm-base; now one copy in the platform.
// Display of computed / monetary values with two decimals.
export const formatNumber = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
