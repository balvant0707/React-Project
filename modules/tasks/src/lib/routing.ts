// Copied from COMPASS app/src/lib/routing.ts. Changes: translation keys under `tasks.` (tasks.actions.<key>, ...); role names
// from the platform roles (translations); a role-less step reads "whoever may edit".
import type { TFunction } from "i18next";
import type { StepAction, TaskTypeStep } from "./domain";
import { localName } from "./masterData";

// Text of a decision: the label the admin gave it in the current language, else the built-in translation of its key.
export const actionLabel = (t: TFunction, language: string, action: Pick<StepAction, "key" | "label">) => {
  const lang = language.slice(0, 2) as "de" | "en";
  return action.label?.[lang]?.trim() || action.label?.de?.trim() || action.label?.en?.trim() || t(`tasks.actions.${action.key}`, { defaultValue: action.key });
};

// Who works a step, as a short phrase for the stepper and the "what happens next" line.
export const stepAssigneeText = (t: TFunction, step: TaskTypeStep, roles?: { id: string; name: string; translations?: Record<string, string> | null }[], teams?: { id: string; name: string }[]) => {
  if (step.assignee_kind === "requester_supervisor") return t("tasks.supervisorOfRequester", { count: step.assignee_level });
  if (step.assignee_kind === "requester") return t("tasks.requester");
  if (step.assignee_kind === "task_owner") return t("tasks.taskOwner");
  if (step.assignee_kind === "task_team") return t("tasks.taskTeam");
  if (step.assignee_kind === "team") return teams?.find((g) => g.id === step.assignee_team_id)?.name ?? "";
  const role = localName(roles?.find((r) => r.id === step.assignee_role_id));
  if (!step.assignee_team_scope) return role || t("tasks.anyEditor");
  if (step.assignee_team_scope === "fixed") return t("tasks.roleInTeam", { role, team: teams?.find((g) => g.id === step.assignee_team_id)?.name ?? "" });
  return t(`tasks.roleInScope.${step.assignee_team_scope}`, { role });
};

// Whether an action moves the task on (positive or neutral) or turns it back (negative). Older routes without a kind:
// "reject" is negative.
export const isNegativeAction = (action: Pick<StepAction, "kind" | "key">) => (action.kind ?? (action.key === "reject" ? "negative" : null)) === "negative";

// Ant Design colour of a decision's tag/button.
export const actionColor = (action: Pick<StepAction, "kind" | "key" | "to">) => {
  const kind = action.kind ?? (action.key === "reject" ? "negative" : action.to !== null || action.key === "complete" ? "positive" : "neutral");
  return kind === "positive" ? "green" : kind === "negative" ? "red" : "default";
};
