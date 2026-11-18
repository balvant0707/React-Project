import type { ComponentType } from "react";
import { useRecordSlot } from "@rbp/core";

// Stand-in for COMPASS components/taskItemParts.tsx: the items module puts the real parts into the slot
// 'task-family.taskItemParts' (value: ItemParts); without it no task asks which items were used.
type Task = { id: string; asset_id?: string | null };
type ModalProps = { open: boolean; task: Task; onSkip: () => void; onSaved: () => void };
export type ItemParts = { useNeedsItemUsage: (task: Task | undefined, enabled: boolean) => boolean; ItemUsageModal: ComponentType<ModalProps> };

// COMPASS's constant (the database's item errors -> texts).
export const ITEM_ERRORS: Record<string, string> = {
  "This task type does not offer items of this category": "items.errors.category",
  "This task type does not use items": "items.errors.typeNone",
};

const useParts = () => useRecordSlot("task-family.taskItemParts")[0]?.value as ItemParts | undefined;
const never = () => false;
// The slot list is fixed while the app runs, so the same hook is called on every render.
export const useNeedsItemUsage = (task: Task | undefined, enabled: boolean) => (useParts()?.useNeedsItemUsage ?? never)(task, enabled);
export const ItemUsageModal = (props: ModalProps) => {
  const parts = useParts();
  return parts ? <parts.ItemUsageModal {...props} /> : null;
};
