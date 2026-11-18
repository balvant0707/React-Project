import { useEffect, type PropsWithChildren } from "react";
import { queryClient, registerOutbox } from "@rbp/core";
import { pendingCount, startChecklistOutbox, subscribeOutbox } from "./offline/checklistOutbox";

// COMPASS's app-wide query client (queryClient.ts), which code outside React (the offline checklist queue) uses to refresh
// lists, is the core's now (Refine is handed the same instance).
export { queryClient };

// COMPASS main.tsx started the checklist queue before the first render; here the module's provider starts it once when the
// app mounts and registers it with the core, so the backend status banner counts the waiting entries.
let started = false;
export const ChecklistOutboxStarter = ({ children }: PropsWithChildren) => {
  useEffect(() => {
    if (started) return;
    started = true;
    registerOutbox({ count: pendingCount, subscribe: subscribeOutbox });
    startChecklistOutbox();
  }, []);
  return <>{children}</>;
};
