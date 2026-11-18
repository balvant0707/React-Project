// Ported 1:1 from COMPASS (app/src/lib/checklists.ts).
import { supabaseClient } from "@rbp/core";
import { applyPendingAnswers } from "../offline/checklistOutbox";
import type { ItemPhoto } from "../components/checklist/itemPhotos";

export const ITEM_KINDS = ["heading", "check", "pass_fail", "number", "text", "date"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

// The structure of an item (the same for template items and the copies on a task).
export type ItemDef = {
  id?: string;
  kind: ItemKind;
  label: string;
  hint: string | null;
  required: boolean;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  // The route step the item belongs to (template items of a template with a task type, step items); null = the whole task.
  step_key?: string | null;
};

export type ChecklistItem = ItemDef & {
  id: string;
  task_id: string;
  sort_order: number;
  from_template: boolean;
  // Copied from the items of a route step of the task type (task_type_step_items); kept when the template changes.
  from_step: boolean;
  done: boolean;
  result: "ok" | "defect" | "na" | null;
  value_number: number | null;
  value_text: string | null;
  note: string | null;
  ticket_id: string | null;
  answered_by_user_id: string | null;
  answered_at: string | null;
};

// The checklist of a task: one flat list. Items copied from the official checklist (templateId) come first; items typed
// by people are plain ticks.
export type TaskChecklist = {
  templateId: string | null;
  templateName: string | null;
  completedAt: string | null;
  items: ChecklistItem[];
};

export type TemplateRow = { id: string; name: string; description: string | null; active: boolean; updated_at: string; task_type_id: string | null };

// A template with a task type only fits tasks of that type (its step keys refer to that type's route); one without fits all.
export const templatesForType = <T extends Pick<TemplateRow, "task_type_id">>(templates: T[], taskTypeId: string | null | undefined) =>
  templates.filter((x) => !x.task_type_id || x.task_type_id === taskTypeId);

// Mirrors public.checklist_item_answered().
export const isAnswered = (i: Pick<ChecklistItem, "kind" | "done" | "result" | "value_number" | "value_text">) => {
  switch (i.kind) {
    case "heading":
      return true;
    case "check":
      return i.done;
    case "pass_fail":
      return i.result !== null;
    case "number":
      return i.value_number !== null;
    case "text":
      return !!i.value_text?.trim();
    case "date":
      // value_text holds the date as YYYY-MM-DD
      return !!i.value_text;
  }
};

export const outOfRange = (i: Pick<ChecklistItem, "kind" | "value_number" | "min_value" | "max_value">) =>
  i.kind === "number" &&
  i.value_number !== null &&
  ((i.min_value !== null && i.value_number < i.min_value) || (i.max_value !== null && i.value_number > i.max_value));

// A defect: a failed pass/fail item, or a number outside its limits. Mirrors checklist_item_create_ticket().
export const isDefect = (i: Pick<ChecklistItem, "kind" | "result" | "value_number" | "min_value" | "max_value">) =>
  (i.kind === "pass_fail" && i.result === "defect") || outOfRange(i);

// Counts what the completion guard counts: the required items (a list without any required item counts all of them,
// headings never). `anyRequired` lets a step group follow the rule of the whole list. Mirrors tasks_overview.
export const progress = (items: ChecklistItem[], anyRequired = items.some((i) => i.kind !== "heading" && i.required)) => {
  const countable = items.filter((i) => i.kind !== "heading" && (i.required || !anyRequired));
  return { total: countable.length, done: countable.filter(isAnswered).length };
};

export const newItem = (kind: ItemKind): ItemDef => ({
  kind,
  label: "",
  hint: null,
  required: kind !== "heading" && kind !== "text",
  unit: null,
  min_value: null,
  max_value: null,
});

const STRUCTURE = (i: ItemDef, order: number) => ({
  sort_order: order,
  kind: i.kind,
  label: i.label.trim(),
  hint: i.hint?.trim() || null,
  required: i.kind === "heading" ? false : i.required,
  unit: i.kind === "number" ? i.unit?.trim() || null : null,
  min_value: i.kind === "number" ? i.min_value : null,
  max_value: i.kind === "number" ? i.max_value : null,
});

// Items as stored on a recurring rule or sent to checklist_template_create(): structure only, blank items dropped.
export const itemsJson = (items: ItemDef[]) =>
  items
    .filter((i) => i.label.trim())
    .map((i, order) => {
      const { sort_order: _order, ...row } = STRUCTURE(i, order);
      return row;
    });

// Writes an edited template item list: updates the rows that kept their id, inserts the new ones, deletes the removed
// ones.
export async function saveItems(table: "checklist_template_items", parentColumn: "template_id", parentId: string, items: ItemDef[], originalIds: string[]) {
  const keep = new Set(items.map((i) => i.id).filter(Boolean) as string[]);
  const removed = originalIds.filter((id) => !keep.has(id));
  if (removed.length) {
    const { error } = await supabaseClient.from(table).delete().in("id", removed);
    if (error) throw error;
  }
  const inserts: Record<string, unknown>[] = [];
  for (const [index, item] of items.entries()) {
    const row = { ...STRUCTURE(item, index + 1), step_key: item.step_key ?? null };
    if (item.id) {
      const { error } = await supabaseClient.from(table).update(row).eq("id", item.id);
      if (error) throw error;
    } else {
      inserts.push({ ...row, [parentColumn]: parentId });
    }
  }
  if (inserts.length) {
    const { error } = await supabaseClient.from(table).insert(inserts);
    if (error) throw error;
  }
}

// What the signed-in user may do with checklist templates: create (grant), edit all or only the ones they own, delete
// (grant). Admins may everything. canEdit = may edit at least some template.
export async function templateRights(): Promise<{ canCreate: boolean; canEdit: boolean; editAll: boolean; editOwn: boolean; canDelete: boolean }> {
  const [{ data: admin }, { data: held }] = await Promise.all([supabaseClient.rpc("is_admin"), supabaseClient.rpc("my_permissions")]);
  const literals = (held ?? []) as string[];
  const has = (k: string) => admin === true || literals.includes(k);
  const editAll = has("checklist_templates.edit.all");
  const editOwn = has("checklist_templates.edit.own");
  return { canCreate: has("checklist_templates.create"), canEdit: editAll || editOwn, editAll, editOwn, canDelete: has("checklist_templates.delete") };
}

// Adds plain tick items (not required) at the end of a task's list.
export async function addTaskItems(taskId: string, labels: string[]) {
  const clean = labels.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return;
  const { data } = await supabaseClient.from("task_checklist_items").select("sort_order").eq("task_id", taskId).order("sort_order", { ascending: false }).limit(1);
  const start = (data?.[0]?.sort_order ?? 0) as number;
  const { error } = await supabaseClient
    .from("task_checklist_items")
    .insert(clean.map((label, index) => ({ task_id: taskId, sort_order: start + index + 1, kind: "check", label, required: false, from_template: false })));
  if (error) throw error;
}

// The checklist of a task with its items, with answers still waiting in the write queue laid on top.
export async function fetchTaskChecklist(taskId: string): Promise<TaskChecklist> {
  const [{ data: task, error: taskError }, { data: items, error }] = await Promise.all([
    supabaseClient.from("tasks").select("checklist_template_id, checklist_completed_at, template:checklist_templates(name)").eq("id", taskId).maybeSingle(),
    supabaseClient.from("task_checklist_items").select("*").eq("task_id", taskId).order("sort_order"),
  ]);
  if (taskError) throw taskError;
  if (error) throw error;
  const template = task?.template as { name: string } | { name: string }[] | null | undefined;
  const list: TaskChecklist = {
    templateId: task?.checklist_template_id ?? null,
    templateName: (Array.isArray(template) ? template[0]?.name : template?.name) ?? null,
    completedAt: task?.checklist_completed_at ?? null,
    items: (items ?? []) as ChecklistItem[],
  };
  return applyPendingAnswers(taskId, list);
}

export async function fetchChecklistPhotos(taskId: string): Promise<ItemPhoto[]> {
  const { data, error } = await supabaseClient
    .from("attachments")
    .select("id, storage_path, file_name, checklist_item_id, uploaded_by_user_id")
    .eq("entity_type", "tasks")
    .eq("entity_id", taskId)
    .not("checklist_item_id", "is", null)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ItemPhoto[];
}
