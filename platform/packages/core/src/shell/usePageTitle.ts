// Copied from COMPASS app/src/hooks/usePageTitle.ts. The tab title itself is set by PageTitle in refine/RefineRoot.tsx.
import { useEffect } from "react";

// Title of the open record ("#14 Pump leaks"); the tab title shows it instead of the menu entry's name.
let recordTitle: string | undefined;
const listeners = new Set<() => void>();

export const currentRecordTitle = () => recordTitle;
export const onRecordTitleChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

// Call on a detail page with the record's title (undefined while loading).
export const usePageTitle = (title: string | undefined) => {
  useEffect(() => {
    recordTitle = title || undefined;
    listeners.forEach((fn) => fn());
    return () => {
      recordTitle = undefined;
      listeners.forEach((fn) => fn());
    };
  }, [title]);
};
