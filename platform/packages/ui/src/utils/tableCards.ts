// Phone tables are shown as cards by CSS (index.css, "every antd table becomes a list of cards"). CSS cannot know
// which header belongs to a cell, so this copies the header text into `data-label` on the cells and marks the
// first content cell (`data-first`, the card title; a `#` column becomes `data-number`) and cells without content or with just a dash (`data-empty`, hidden).
const SPECIAL = ".ant-table-selection-column, .ant-table-row-expand-icon-cell";

// A table that is an editing grid (inputs, selects, switches, checkboxes in its cells) or has a summary row keeps its
// grid layout on a phone: as cards it would lose the column structure, the keyboard entry and the totals. Marked
// `data-grid` here, which the CSS excludes (`table-keep` is the manual way to the same).
const EDITABLE = "tbody td:not(.ant-table-selection-column):not(.ant-table-row-expand-icon-cell) :is(input, textarea, .ant-select, .ant-switch, .ant-checkbox, .ant-radio)";

function label(wrapper: Element) {
  const grid = !!wrapper.querySelector(":scope .ant-table-summary") || !!wrapper.querySelector(`:scope ${EDITABLE}`);
  wrapper.toggleAttribute("data-grid", grid);
  if (grid) return;
  const heads = Array.from(wrapper.querySelectorAll(":scope .ant-table-thead > tr > th")).map((th) => (th.textContent ?? "").trim());
  wrapper.querySelectorAll(":scope tbody > tr.ant-table-row").forEach((tr) => {
    let first = true;
    Array.from(tr.children).forEach((td, i) => {
      if (!(td instanceof HTMLElement) || td.matches(SPECIAL)) return;
      const text = (td.textContent ?? "").trim();
      const empty = (text === "" || text === "—") && !td.querySelector("svg, img, input, button, canvas, .anticon");
      td.toggleAttribute("data-empty", empty);
      if (empty) return;
      // A "#" column is the record number: shown small in the corner so the next cell can be the title.
      if ((heads[i] ?? "") === "#") {
        td.setAttribute("data-number", "");
        td.removeAttribute("data-first");
        td.removeAttribute("data-label");
        return;
      }
      const isFirst = first;
      first = false;
      td.toggleAttribute("data-first", isFirst);
      const head = heads[i] ?? "";
      if (head && !isFirst) td.setAttribute("data-label", head);
      else td.removeAttribute("data-label");
    });
  });
}

function run() {
  document.querySelectorAll(".ant-table-wrapper:not(.table-keep)").forEach(label);
}

// Same breakpoint as the CSS in index.css.
let stop: (() => void) | undefined;
export function startTableCards() {
  if (typeof window === "undefined" || !window.matchMedia || stop) return;
  const media = window.matchMedia("(max-width: 767px)");
  // Runs in the observer's microtask, i.e. before the browser paints the new rows: a grid never shows as cards for a frame.
  const update = () => {
    if (media.matches) run();
  };
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Rotating / resizing into phone width changes nothing in the DOM, so label again at that moment.
  media.addEventListener("change", update);
  stop = () => {
    observer.disconnect();
    media.removeEventListener("change", update);
    stop = undefined;
  };
  update();
  import.meta.hot?.dispose(() => stop?.());
}
