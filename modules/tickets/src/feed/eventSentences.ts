// History sentences of the ticket events (COMPASS app/src/components/feed/eventText.ts, the ticket cases), registered with the
// messaging module. A ticket without an author came in through the public QR form.
import { registerEventSentence } from "@rbp/module-messaging/src/feed/eventText.ts";
import { priorityChanged } from "@rbp/module-tasks/src/feed/eventSentences.ts";
import { statusChanged } from "@rbp/module-assets/src/feed/eventSentences.ts";

export const registerTicketSentences = () => {
  const on = registerEventSentence;
  on("ticket_created", (t, meta, who, _ctx, author) =>
    author
      ? t("feed.events.ticket_created", { actor: who, type: t(`ticketTypes.${meta.type}`, { defaultValue: meta.type }) })
      : t("feed.events.ticket_created_public", { actor: who, name: meta.reporter_name ?? t("feed.anonymous") }));
  on("ticket_status_changed", (t, meta, who) => statusChanged(t, meta, who));
  on("ticket_assigned", (t, meta, who, ctx) =>
    t("feed.events.ticket_assigned", {
      actor: who,
      user: meta.new_user_id ? ctx.userName(meta.new_user_id) : "—",
      team: meta.new_team_id ? ctx.teamName(meta.new_team_id) : "—",
    }));
  on("ticket_priority_changed", (t, meta, who) => priorityChanged(t, meta, who));
  on("ticket_converted_to_task", (t, meta, who) => t("feed.events.ticket_converted_to_task", { actor: who, number: meta.task_number }));
  on("ticket_task_cancelled", (t, meta, who) => t("feed.events.ticket_task_cancelled", { actor: who, number: meta.task_number }));
};
