import { useEffect, useState } from "react";

// The optional list columns shown, per browser (localStorage, deliberately not per user); stale keys are dropped on read.
export function useColumnVisibility(storageKey: string, allKeys: string[], defaultVisible: string[]) {
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return (JSON.parse(stored) as string[]).filter((k) => allKeys.includes(k));
      }
    } catch {
      // ignore malformed/unavailable storage, fall back to defaults
    }
    return defaultVisible;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visible));
    } catch {
      // ignore storage write failures (e.g. private browsing quota)
    }
  }, [visible, storageKey]);

  return [visible, setVisible] as const;
}
