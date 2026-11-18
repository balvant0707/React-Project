// History sentences of goals and checklists (COMPASS app/src/components/feed/eventText.ts, those cases), registered with the
// messaging module. The task events come with the tasks module.
import { registerEventSentence } from "@rbp/module-messaging/src/feed/eventText.ts";

export const registerTaskFamilySentences = () => {
  const on = registerEventSentence;
  on("checklist_added", (t, meta, who) => t("feed.events.checklist_added", { actor: who, name: meta.name }));
  on("checklist_ticket_created", (t, meta, who) => t("feed.events.checklist_ticket_created", { actor: who, item: meta.item, number: meta.ticket_number }));
  on("checklist_completed", (t, meta, who) =>
    meta.defects > 0 ? t("feed.events.checklist_completed_defects", { actor: who, defects: meta.defects }) : t("feed.events.checklist_completed", { actor: who }));
  on("goal_created", (t, _meta, who) => t("feed.events.goal_created", { actor: who }));
  on("goal_check_in", (t, meta, who) =>
    t(meta.value != null ? "feed.events.goal_check_in_value" : "feed.events.goal_check_in", {
      actor: who,
      value: meta.value,
      unit: meta.unit ?? "",
      status: meta.status ? t(`goals.status.${meta.status}`, { defaultValue: meta.status }) : "",
      comment: meta.comment ? `: ${meta.comment}` : "",
    }));
  on("task_goal_changed", (t, meta, who) => t(meta.new_goal_id ? "feed.events.task_goal_set" : "feed.events.task_goal_cleared", { actor: who }));
};
