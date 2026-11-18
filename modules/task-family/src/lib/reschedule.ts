// Ported 1:1 from COMPASS (app/src/lib/reschedule.ts).
import type { QueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { postRecordMessage } from "@rbp/module-messaging/src/lib/messaging.ts";
import { formatDate } from "@rbp/ui";

// Moves the due date of a task and writes the reason into its feed (the original date stays for the punctuality
// statistics). Returns an error to show, or null. An update RLS does not allow touches no row and raises no error, so
// the row is asked for back.
export const moveDueDate = async (
  taskId: string,
  from: string | null,
  to: string | null,
  reason: string,
  commentText: (v: { from: string; to: string; reason: string }) => string,
): Promise<{ message: string } | null> => {
  const { data, error } = await supabaseClient.from("tasks").update({ due_date: to }).eq("id", taskId).select("id");
  if (error) return error;
  if (!data?.length) return { message: "not allowed" };
  await postRecordMessage("tasks", taskId, commentText({ from: formatDate(from), to: formatDate(to), reason }));
  return null;
};

// The lists and statistics that show a due date.
export const invalidateAfterReschedule = (queryClient: QueryClient, taskId: string) =>
  Promise.all(
    ["task", "task-tree", "task-original-due", "punctuality", "dashboard", "initiative-board"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })).concat(
      queryClient.invalidateQueries({ queryKey: ["feed", "tasks", taskId] }),
    ),
  );
