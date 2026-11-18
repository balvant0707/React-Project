import type { ComponentType, ReactNode } from "react";
import type { DecisionRow } from "../hooks/useDecisions";

// What a task type purpose (task_types.purpose) adds to the generic task pages. Same register as COMPASS
// app/src/modules/purposes.tsx, empty here: the purposes (leave, ordering, ...) come back with their modules, which then
// add their entry through registerPurposeUi instead of an import in this file.
export type PurposeTaskPanelProps = { taskId: string; taskStatus: string; canAct: boolean; isRequester: boolean };

type PurposeUi = {
  // Body of the card on the page "To decide"; `fallback` is the generic card.
  DecisionCard?: ComponentType<{ row: DecisionRow; fallback: ReactNode }>;
  // Panel on the task page, above the subtasks.
  TaskPanel?: ComponentType<PurposeTaskPanelProps>;
};

const PURPOSES: Record<string, PurposeUi> = {};
const INVALIDATORS: Record<string, () => () => void> = {};

export const registerPurposeUi = (purpose: string, ui: PurposeUi, useInvalidate?: () => () => void) => {
  PURPOSES[purpose] = ui;
  if (useInvalidate) INVALIDATORS[purpose] = useInvalidate;
};

export const purposeUi = (purpose: string | null | undefined): PurposeUi => (purpose && PURPOSES[purpose]) || {};

// After a task of a purpose changed (an action, a decision), the purpose's own lists and numbers are refetched too.
// Every registered hook is called on every render (hooks need a fixed order: registration happens at module load).
export function usePurposeInvalidate() {
  const byPurpose: Record<string, () => void> = {};
  for (const [purpose, use] of Object.entries(INVALIDATORS)) byPurpose[purpose] = use();
  return (purpose: string | null | undefined) => {
    if (purpose) byPurpose[purpose]?.();
  };
}
