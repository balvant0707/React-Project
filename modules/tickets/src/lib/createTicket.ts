import { supabaseClient } from "@rbp/core";

// The one way a signed-in screen creates a ticket: the full form (pages/tickets/ticketForm.tsx) and the kiosk board
// (pages/kiosk) both call it, so queue, type, asset and priority are written the same way. Platform (andon), new: the database
// (policies, triggers) still decides what is allowed; errors are thrown as they come (use errorText). The no-login QR page cannot
// call it: it goes through the Edge Function public-ticket-report.
export type NewTicket = {
  queueId: string;
  type: string;
  assetId?: string | null;
  title: string;
  description?: string | null;
  priority?: string;
};

export async function createTicket(t: NewTicket): Promise<{ id: string; ticket_number: number }> {
  const { data, error } = await supabaseClient
    .from("tickets")
    .insert({
      title: t.title.trim(),
      description: t.description?.trim() || null,
      queue_id: t.queueId,
      type: t.type,
      priority: t.priority ?? "normal",
      asset_id: t.assetId ?? null,
    })
    .select("id, ticket_number")
    .single();
  if (error) throw error;
  return data as { id: string; ticket_number: number };
}
