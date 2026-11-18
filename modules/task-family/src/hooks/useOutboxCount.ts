// Ported 1:1 from COMPASS (app/src/hooks/useOutboxCount.ts).
import { useEffect, useState } from "react";
import { pendingCount, subscribeOutbox } from "../offline/checklistOutbox";

// How many checklist entries (answers, photos) wait on this device to be sent.
export function useOutboxCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const read = () => void pendingCount().then((n) => alive && setCount(n)).catch(() => undefined);
    read();
    const off = subscribeOutbox(read);
    const timer = window.setInterval(read, 5000);
    return () => {
      alive = false;
      off();
      window.clearInterval(timer);
    };
  }, []);
  return count;
}
