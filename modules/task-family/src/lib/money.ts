// Ported 1:1 from COMPASS (app/src/lib/money.ts).
// Costs are net amounts in EUR (~/maintenance_tool/docs/maintenance-costs.md); one currency for now.
export const formatMoney = (value: number | string | null | undefined, locale: string) =>
  new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { style: "currency", currency: "EUR" }).format(Number(value ?? 0));
