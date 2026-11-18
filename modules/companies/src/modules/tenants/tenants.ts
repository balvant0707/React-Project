// Ported 1:1 from the NPM tool (app/src/modules/tenants/tenants.ts).
import { supabaseClient } from "@rbp/core";
import type { PhraseOption as Option } from "@rbp/core";

// Our selling entities ("Owner Associate" in the offer/order module), as dropdown options.
export async function loadTenantOptions(): Promise<Option[]> {
  const { data } = await supabaseClient.from("teams").select("id, name, team_uses!inner(use)").eq("team_uses.use", "owner_associate").order("name");
  return (data ?? []).map((t) => ({ value: t.id, label: t.name }));
}
