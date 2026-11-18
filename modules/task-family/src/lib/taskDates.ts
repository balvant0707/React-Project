// Ported 1:1 from COMPASS (app/src/lib/taskDates.ts).
import type { TFunction } from "i18next";
import type { TaskTreeRow } from "./domain";
import { formatDate } from "@rbp/ui";

// Explains the date conflict of a tree row against its parent (computed by the database, task_date_conflict()).
export const conflictText = (t: TFunction, row: Pick<TaskTreeRow, "date_conflict" | "parent_due_date" | "expected_end">) =>
  row.date_conflict && row.parent_due_date && row.expected_end
    ? t(`dateConflicts.${row.date_conflict}`, { end: formatDate(row.expected_end), parent: formatDate(row.parent_due_date) })
    : "";

// Direct subtasks of a task that cannot finish by its due date.
export const conflictingChildren = (rows: TaskTreeRow[], parentId: string) =>
  rows.filter((r) => r.parent_task_id === parentId && r.date_conflict);
