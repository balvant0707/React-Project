import { useContext, useEffect, useState } from "react";
import { ColorModeContext } from "../colorMode";
import { useIsMobile } from "./useIsMobile";
import { useStickyHeaderOffset } from "./useStickyHeaderOffset";

// "Freeze panes": on a tall desktop viewport the page banner and every preceding sibling of the table's ancestors inside
// #page-content stay pinned under the app header; returns their total height (0 when not frozen) as the table's sticky
// offset. Nothing is frozen above MAX_SHARE of the viewport. On every desktop viewport it also squares antd's sticky
// header's rounded corners, through which scrolling rows showed.
const TALL_VIEWPORT = "(min-height: 1000px)";
const MAX_SHARE = 0.55;
const Z_INDEX = 9; // below the app header (10); the backdrop sits one below

const isOpaque = (color: string) => color !== "transparent" && !/^rgba\(.*,\s*0(\.0+)?\)$/.test(color);

export function useFreezePanes() {
  const isMobile = useIsMobile();
  const headerOffset = useStickyHeaderOffset();
  const { mode } = useContext(ColorModeContext); // the page color below depends on it
  const [tall, setTall] = useState(() => window.matchMedia(TALL_VIEWPORT).matches);
  const [frozen, setFrozen] = useState(0);

  useEffect(() => {
    const query = window.matchMedia(TALL_VIEWPORT);
    const update = () => setTall(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const desktop = !isMobile && headerOffset > 0;

  useEffect(() => {
    if (!desktop) {
      setFrozen(0);
      return;
    }
    let pinned: HTMLElement[] = [];
    let backdrop: HTMLDivElement | null = null;
    let squared: HTMLElement | null = null; // antd's sticky table header: only these two styles are ours (top is antd's)
    let frame = 0;
    const release = () => {
      pinned.forEach((el) => {
        el.style.position = "";
        el.style.top = "";
        el.style.zIndex = "";
        el.style.backgroundColor = "";
      });
      pinned = [];
      backdrop?.remove();
      backdrop = null;
      if (squared) {
        squared.style.borderRadius = "";
        squared.style.backgroundColor = "";
      }
      squared = null;
    };
    const apply = () => {
      release();
      const content = document.getElementById("page-content");
      const table = content?.querySelector<HTMLElement>(".ant-table-wrapper");
      const banner = document.getElementById("page-banner");
      if (!content || !table) return setFrozen(0);
      // The grey page background belongs to an outer layout element (Layout.Content itself is transparent): take the
      // first opaque one, otherwise the table would show through the pinned block.
      let background = "";
      for (let node: HTMLElement | null = content; node && !background; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (isOpaque(color)) background = color;
      }
      squared = table.querySelector<HTMLElement>(".ant-table-sticky-holder");
      if (squared) {
        squared.style.borderRadius = "0";
        squared.style.backgroundColor = background;
      }
      if (!tall) return setFrozen(0);
      const elements: HTMLElement[] = banner ? [banner] : [];
      for (let node: HTMLElement | null = table; node && node !== content; node = node.parentElement) {
        const before: HTMLElement[] = [];
        for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
          if (sib instanceof HTMLElement && sib.offsetHeight > 0) before.unshift(sib);
        }
        elements.push(...before);
      }
      // Outer levels come last in the walk but sit higher on the page: sort by document order.
      elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      let top = headerOffset;
      const tops = elements.map((el) => {
        const own = top;
        top += el.offsetHeight + (parseFloat(getComputedStyle(el).marginBottom) || 0);
        return own;
      });
      const total = top - headerOffset;
      if (total > window.innerHeight * MAX_SHARE) return setFrozen(0);
      elements.forEach((el, i) => {
        el.style.position = "sticky";
        el.style.top = `${tops[i]}px`;
        el.style.zIndex = String(Z_INDEX);
        // backgroundColor (not `background`) keeps the banner's gradient and cards' own colours.
        if (!isOpaque(getComputedStyle(el).backgroundColor)) el.style.backgroundColor = background;
      });
      pinned = elements;
      // A page-coloured backdrop behind the block closes the gaps between pinned elements.
      const span = (banner ?? content).getBoundingClientRect();
      backdrop = document.createElement("div");
      Object.assign(backdrop.style, {
        position: "fixed",
        top: `${headerOffset}px`,
        left: `${span.left}px`,
        width: `${span.width}px`,
        height: `${total}px`,
        background,
        zIndex: String(Z_INDEX - 1),
        pointerEvents: "none",
      });
      document.body.appendChild(backdrop);
      setFrozen(total);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    schedule();
    const content = document.getElementById("page-content");
    const mutations = new MutationObserver(schedule);
    if (content) mutations.observe(content, { childList: true, subtree: true });
    const sizes = new ResizeObserver(schedule);
    if (content) sizes.observe(content);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
      window.removeEventListener("resize", schedule);
      release();
      setFrozen(0);
    };
  }, [desktop, tall, headerOffset, mode]);

  return frozen;
}
