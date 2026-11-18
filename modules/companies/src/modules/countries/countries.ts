// Ported 1:1 from the NPM tool (app/src/modules/countries/countries.ts).
import { supabaseClient } from "@rbp/core";

export type CountryRow = { id: string; name_en: string; continent: string | null };

export async function loadCountries(): Promise<CountryRow[]> {
  const { data } = await supabaseClient.from("countries").select("id, name_en, continent").order("name_en");
  return data ?? [];
}

export const countryOptions = (countries: CountryRow[]) => countries.map((c) => ({ value: c.id, label: c.name_en }));
