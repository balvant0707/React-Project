// Ported 1:1 from the NPM tool (app/src/modules/users/users.ts).
import { supabaseClient } from "@rbp/core";
import { userLabel } from "@rbp/core";

export type UserOption = { value: string; label: string };

// Platform: the core's userLabel (name, else email), NPM's "Unknown" when a user has neither.
export const displayName = (u: { name: string | null; email: string | null } | null | undefined) => userLabel(u) || "Unknown";

type UserRow = { id: string; name: string | null; email: string | null; default_tenant: { name: string } | null };

// "Name (Tenant)": the same person name can sit under several selling entities, and placeholder users ("N.N.") only
// differ by their tenant.
export const userOptionLabel = (u: UserRow) => {
  const label = u.name ?? u.email ?? u.id;
  return u.default_tenant ? `${label} (${u.default_tenant.name})` : label;
};

// Options of every "Sales rep" / assignee dropdown.
export async function loadUserOptions(): Promise<UserOption[]> {
  const { data } = await supabaseClient.from("users").select("id, name, email, default_tenant:teams!default_team_id(name)").order("name");
  return ((data ?? []) as unknown as UserRow[]).map((u) => ({ value: u.id, label: userOptionLabel(u) }));
}

// The tenant a new offer or order of this user starts with (users.default_team_id, an editable default).
export async function loadDefaultTenantId(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseClient.from("users").select("default_team_id").eq("id", userId).single();
  return data?.default_team_id ?? null;
}
