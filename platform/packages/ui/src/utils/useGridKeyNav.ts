// From the NPM tool (app/src/utils/useGridKeyNav.ts), until 2026-11-13 ported into npm-base; now one copy in the platform.
import { useCallback, useRef } from "react";

// Keyboard entry for editable line tables (specification paint list, order
// lines): Enter moves to the next input cell, Shift+Enter to the previous one.
// Mark every cell wrapper with `data-grid-cell="<rowKey>:<column>"` (see
// `gridCell()`); the order of those wrappers in the DOM is the tab order.
// Disabled / read-only / input-less cells (an area-locked quantity shows plain
// text) are skipped. Put `ref` and `onKeyDownCapture` on a wrapper element
// around the table.
//
// Enter inside an OPEN select dropdown is left alone (it picks the option);
// the caller then calls `focusNextAfter(rowKey, column)` from the select's
// onChange to continue with the next cell.

const CELL = "[data-grid-cell]";
const INPUT = "input:not([disabled]):not([readonly]):not([type=hidden]), textarea:not([disabled]):not([readonly])";

export const gridCell = (rowKey: string, column: string) => ({ "data-grid-cell": `${rowKey}:${column}` });

const move = (root: HTMLElement, from: HTMLElement, delta: 1 | -1) => {
  const cells = Array.from(root.querySelectorAll<HTMLElement>(CELL));
  for (let i = cells.indexOf(from) + delta; i >= 0 && i < cells.length; i += delta) {
    const input = cells[i].querySelector<HTMLInputElement>(INPUT);
    if (input) {
      input.focus();
      input.select?.();
      return true;
    }
  }
  return false;
};

export function useGridKeyNav() {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    const cell = target.closest<HTMLElement>(CELL);
    if (!cell) return;
    if (target.getAttribute("aria-expanded") === "true") return;
    e.preventDefault();
    e.stopPropagation();
    move(e.currentTarget, cell, e.shiftKey ? -1 : 1);
  }, []);

  // After a product pick the row may still be re-rendering; wait one tick.
  const focusNextAfter = useCallback((rowKey: string, column: string) => {
    window.setTimeout(() => {
      const root = ref.current;
      const cell = root?.querySelector<HTMLElement>(`[data-grid-cell="${rowKey}:${column}"]`);
      if (root && cell) move(root, cell, 1);
    }, 0);
  }, []);

  return { ref, onKeyDownCapture, focusNextAfter };
}
