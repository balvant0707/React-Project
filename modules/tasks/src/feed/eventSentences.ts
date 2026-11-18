// History sentences of the task engine's events, for both apps. The cases are COMPASS's (app/src/components/feed/eventText.ts,
// split by module: every module registers the events it writes with the messaging module's registerEventSentence). Texts:
// feed.events.* of this module (COMPASS en/de). The step names of a task's route are the messaging name source 'steps'.
import type { TFunction } from "i18next";
import i18n from "i18next";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { registerEventSentence } from "@rbp/module-messaging/src/feed/eventText.ts";
import { registerFeedNames } from "@rbp/module-messaging/src/feed/useFeedContext.ts";
import { localName } from "../lib/masterData";
import { actionLabel } from "../lib/routing";
import { fetchTaskSteps } from "../pages/tasks/useTaskPage";

/** The priority words of a priority change (tasks and tickets). */
export const priorityChanged = (t: TFunction, meta: Record<string, any>, who: string) =>
  t("feed.events.priority_changed", {
    actor: who,
    old: t(`priority.${meta.old}`, { defaultValue: meta.old }),
    new: t(`priority.${meta.new}`, { defaultValue: meta.new }),
  });

// The step names of a task's route (COMPASS useFeedContext: read from the task's route when the page passes none).
const useStepNames = (entityType: string, entityId: string) => {
  const { data } = useQuery({
    queryKey: ["feed-step-names", entityId],
    enabled: entityType === "tasks" && !!entityId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: task } = await supabaseClient.from("tasks").select("task_type_id").eq("id", entityId).maybeSingle();
      if (!task?.task_type_id) return {} as Record<string, string>;
      const steps = await fetchTaskSteps(task.task_type_id as string);
      return Object.fromEntries(steps.map((s) => [s.step_key, localName(s)])) as Record<string, string>;
    },
  });
  return (key: string) => data?.[key];
};

export const registerTaskSentences = () => {
  registerFeedNames("steps", useStepNames);
  const on = registerEventSentence;
  on("task_priority_changed", (t, meta, who) => priorityChanged(t, meta, who));
  on("task_created", (t, meta, who) =>
    t(meta.recurring_task_rule_id ? "feed.events.task_created_recurring" : meta.ticket_id ? "feed.events.task_created_from_ticket" : meta.parent_task_id ? "feed.events.task_created_subtask" : "feed.events.task_created", { actor: who }));
  on("task_subtask_added", (t, meta, who) => t("feed.events.task_subtask_added", { actor: who, number: meta.task_number, title: meta.title }));
  on("task_step_changed", (t, meta, who, ctx) =>
    t(meta.to_user_id || meta.to_team_id ? "feed.events.task_step_changed_to" : "feed.events.task_step_changed", {
      actor: who,
      action: actionLabel(t, i18n.language, { key: meta.action_key, label: meta.action_label }),
      from: ctx.name("steps", meta.from_step_key),
      to: ctx.name("steps", meta.to_step_key),
      user: meta.to_user_id ? ctx.userName(meta.to_user_id) : ctx.teamName(meta.to_team_id),
    }));
  on("task_forwarded", (t, meta, who, ctx, author) => {
    // The comment is shown below the sentence, like on a step change.
    const user = ctx.userName(meta.to_user_id);
    if (meta.mode === "step" && author && user === author) return t("feed.events.task_forwarded_taken", { actor: who, step: ctx.name("steps", meta.step_key) });
    return t(meta.mode === "step" ? "feed.events.task_forwarded_step" : "feed.events.task_forwarded", { actor: who, user, step: ctx.name("steps", meta.step_key) });
  });
  on("task_claimed", (t, _meta, who) => t("feed.events.task_claimed", { actor: who }));
  on("task_completed", (t, _meta, who) => t("feed.events.task_completed", { actor: who }));
  on("task_cancelled", (t, _meta, who) => t("feed.events.task_cancelled", { actor: who }));
  on("task_reopened", (t, meta, who) => t("feed.events.task_reopened", { actor: who, comment: meta.comment ? ` (${meta.comment})` : "" }));
  on("task_planning_changed", (t, meta, who, ctx) => {
    const parts: string[] = [];
    const o = meta.old ?? {};
    const n = meta.new ?? {};
    if (o.assigned_user_id !== n.assigned_user_id) {
      parts.push(n.assigned_user_id ? t("feed.planning.assignedTo", { user: ctx.userName(n.assigned_user_id) }) : t("feed.planning.unassigned"));
    }
    if (o.team_id !== n.team_id) {
      parts.push(n.team_id ? t("feed.planning.teamSet", { team: ctx.teamName(n.team_id) }) : t("feed.planning.teamCleared"));
    }
    if (o.planned_date !== n.planned_date) {
      parts.push(n.planned_date ? t("feed.planning.scheduled", { date: formatDate(n.planned_date) }) : t("feed.planning.unscheduled"));
    }
    return t("feed.events.task_planning_changed", { actor: who, parts: parts.join(t("feed.planning.join")) });
  });
  on("task_due_date_changed", (t, meta, who) => t("feed.events.due_date_changed", { actor: who, date: meta.new ? formatDate(meta.new) : "—" }));
  on("task_title_changed", (t, meta, who) => t("feed.events.title_changed", { actor: who, old: meta.old, new: meta.new }));
};
