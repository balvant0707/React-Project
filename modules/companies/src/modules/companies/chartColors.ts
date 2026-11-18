// Ported 1:1 from the NPM tool (app/src/modules/companies/chartColors.ts).
import { supabaseClient } from "@rbp/core";

export type CompanyChartColor = { color: string | null; textColor: string | null };

// Company name (or short code) -> chart colors set by an admin (companies.chart_color / chart_text_color).
// Only companies with a color set are fetched (a handful), loaded once and shared by every chart;
// call invalidateCompanyChartColors() after saving a company so the next chart render reloads.
let cache: Promise<Map<string, CompanyChartColor>> | null = null;

export const loadCompanyChartColors = (): Promise<Map<string, CompanyChartColor>> => {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await supabaseClient
        .from("companies")
        .select("name, short_code, chart_color, chart_text_color")
        .or("chart_color.not.is.null,chart_text_color.not.is.null");
      if (error) {
        cache = null;
        return new Map();
      }
      // Keyed by name and also by short code (lists that show the short code, e.g. the shipyards makers column).
      const map = new Map<string, CompanyChartColor>();
      for (const row of data ?? []) {
        const value = { color: row.chart_color as string | null, textColor: row.chart_text_color as string | null };
        map.set(row.name as string, value);
        if (row.short_code) map.set(row.short_code as string, value);
      }
      return map;
    })();
  }
  return cache;
};

export const invalidateCompanyChartColors = () => {
  cache = null;
};
