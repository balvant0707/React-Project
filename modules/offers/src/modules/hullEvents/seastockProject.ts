// Ported 1:1 from the NPM tool (app/src/modules/hullEvents/seastockProject.ts).
import { supabaseClient } from "@rbp/core";

// The caller's own Seastock project on this vessel that has no offer yet. The New Seastock offer dialog creates the
// project before the offer form is filled in, and that form can be left without saving, so such a project is reused
// instead of leaving another empty one behind every time.
async function findOwnEmptyProject(vesselId: string): Promise<string | null> {
  const { data: auth } = await supabaseClient.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data } = await supabaseClient
    .from("hull_events")
    .select("id, specifications(id)")
    .eq("vessel_id", vesselId)
    .eq("type_code", "SS")
    .eq("created_by_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  const empty = ((data ?? []) as unknown as { id: string; specifications: { id: string }[] | null }[]).find((row) => (row.specifications ?? []).length === 0);
  return empty?.id ?? null;
}

// A Seastock offer hangs on a hull event of type SS (shown as a "Project"). One click, zero required fields: every
// other hull_events column (event_date, status, snapshot_*) gets a default or is filled by the
// copy_vessel_snapshot_to_hull_event trigger, and event_date is overwritten with the offer's own delivery date as
// soon as it is saved (sync_hull_event_event_date_from_specification). Returns the hull event id (an empty project of
// the caller's is reused, see above), or null.
export async function createSeastockProject(vesselId: string): Promise<string | null> {
  const existing = await findOwnEmptyProject(vesselId);
  if (existing) return existing;
  const { data: phrase } = await supabaseClient.from("phrases").select("id").eq("category", "hull_event_type").eq("code", "SS").single();
  if (!phrase) return null;
  const { data, error } = await supabaseClient.from("hull_events").insert({ vessel_id: vesselId, type_phrase_id: phrase.id }).select("id").single();
  return error || !data ? null : data.id;
}
