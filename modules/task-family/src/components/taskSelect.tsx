// Ported 1:1 from COMPASS (app/src/components/taskSelect.tsx).
import { supabaseClient } from "@rbp/core";
import type { RemoteOption } from "@rbp/ui";

// Server-side search of tasks for pickers (by number or by title; the row policy limits it to what the user sees).
export async function searchTaskOptions(term: string): Promise<RemoteOption[]> {
  const clean = term.trim().replace(/[%,()]/g, " ");
  if (!clean) return [];
  const number = /^#?\d+$/.test(clean) ? Number(clean.replace("#", "")) : null;
  let q = supabaseClient.from("tasks_overview").select("id, task_number, title").order("task_number", { ascending: false }).limit(20);
  q = number !== null ? q.or(`task_number.eq.${number},title.ilike.%${clean}%`) : q.ilike("title", `%${clean}%`);
  const { data } = await q;
  return (data ?? []).map((r) => ({ value: r.id as string, label: `#${r.task_number} ${r.title}` }));
}
