import { useEffect, useState } from "react";
import { useIsMobile } from "./useIsMobile";

// Sticky table headers sit below the app header (core shell/Header.tsx, desktop only), measured live by its border box
// (the height varies; the content box alone let headers slide 17px under it).
export function useStickyHeaderOffset() {
  const isMobile = useIsMobile();
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (isMobile) {
      setOffset(0);
      return;
    }
    const header = document.getElementById("app-header");
    if (!header) return;
    const observer = new ResizeObserver(() => setOffset(header.getBoundingClientRect().height));
    observer.observe(header, { box: "border-box" });
    return () => observer.disconnect();
  }, [isMobile]);

  return offset;
}
