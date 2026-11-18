import { useRecordSlot } from "@rbp/core";

// Which COMPASS modules are in the app (platform only; COMPASS has all of them). An upper module (assets, tickets, items, ...)
// marks itself in the slot 'task-family.module' with its key; the task pages then show its fields (asset, supplier, ...).
export const useHasModule = (key: string): boolean => useRecordSlot("task-family.module").some((s) => s.key === key);
