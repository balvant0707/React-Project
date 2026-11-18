// From the NPM tool (app/src/utils/keys.ts), until 2026-11-13 ported into npm-base; now one copy in the platform.
// Shared local-row-key generator for editable tables (line items,
// discounts, areas, coat lines, packagings, mix components) - each of those
// files had its own near-identical `let counter = 0; const newKey = ...`.
// Prefix lets a page tell its own temp keys apart from another's if two
// generators' output ever end up compared, though in practice each table's
// keys never leave its own component.
let counter = 0;
export const newRowKey = (prefix = "new") => `${prefix}-${++counter}`;
