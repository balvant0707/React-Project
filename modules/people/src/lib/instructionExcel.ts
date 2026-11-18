// Ported 1:1 from COMPASS (app/src/lib/instructionExcel.ts).
import type { TFunction } from "i18next";
import { supabaseClient } from "@rbp/core";
import { selectInChunks } from "@rbp/ui";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { KIND_SECTIONS, KINDS, instructionNumber, type InstructionKind, type InstructionOverview, type InstructionText, type InstructionVersion, type SignalWord } from "./operatingInstructions";
import { SIGNS, SIGN_GROUPS } from "./safetySigns";
import { readXlsx, writeXlsx, type SheetSpec } from "@rbp/ui";

// Excel export and import of operating instructions (~/maintenance_tool/docs/operating-instructions.md "Excel export and import").
// One row per instruction and language; the language-independent columns (kind, signal word, pictograms, links, note)
// count on the German row only. The import compares every cell with the version it works on (the open draft, else the
// published one) and sends only what changed to operating_instruction_import(), which never publishes.

export const SHEET = "Instructions";
// Every section of every kind, in a fixed column order.
export const ALL_SECTIONS = [...new Set([...KIND_SECTIONS.substance, ...KIND_SECTIONS.machine])];
export const COLUMNS = [
  "number", "legacy_number", "version", "status", "language", "kind", "title", "work_area", "subject", "signal_word",
  ...ALL_SECTIONS.flatMap((s) => [`${s}_signs`, `${s}_text`]),
  "assets", "asset_types", "training_types", "change_note", "checksum",
] as const;
type Column = (typeof COLUMNS)[number];
// Counted on the German row only.
const SHARED: Column[] = ["legacy_number", "kind", "signal_word", ...ALL_SECTIONS.map((s) => `${s}_signs` as Column), "assets", "asset_types", "training_types", "change_note"];
const WIDTHS: Record<string, number> = { number: 10, legacy_number: 12, version: 8, status: 11, language: 9, kind: 11, title: 34, work_area: 22, subject: 26, signal_word: 11, assets: 28, asset_types: 22, training_types: 28, change_note: 30 };
const SIGN_CODES = new Set(SIGNS.map((s) => s.code));
// The columns the checksum covers: everything that can be edited (not number, version, status, language).
const HASHED = COLUMNS.filter((c) => !["number", "version", "status", "language", "checksum"].includes(c));
// Separates the names of an asset path ("Plant 1 / Line 2 / Pump").
export const PATH_SEPARATOR = " / ";
// "Remove every link" in a list cell (an empty cell leaves the links as they are).
export const NONE = "-";

// ---------------------------------------------------------------------------------------------
// Cell text <-> HTML. One line = one paragraph, "- " = bullet, "1. " = numbered, **bold**.
// ---------------------------------------------------------------------------------------------

const inlineText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (!(node instanceof Element)) return "";
  if (node.tagName === "BR") return "\n";
  const inner = Array.from(node.childNodes).map(inlineText).join("");
  return node.tagName === "STRONG" || node.tagName === "B" ? (inner.trim() ? `**${inner}**` : inner) : inner;
};

// A line that reads as a list item (or starts with the escape itself): such a paragraph gets a leading backslash.
const LIST_LINE = /^(([-•*]|\d+[.)])\s|\\)/;

export function htmlToCell(html: string | null | undefined): string {
  if (!html?.trim()) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const lines: string[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.childNodes)) {
      if (!(child instanceof Element)) {
        const text = inlineText(child).trim();
        if (text) lines.push(LIST_LINE.test(text) ? `\\${text}` : text);
        continue;
      }
      if (child.tagName === "UL" || child.tagName === "OL") {
        Array.from(child.children).filter((li) => li.tagName === "LI").forEach((li, i) => {
          const text = inlineText(li).trim().replace(/\s*\n\s*/g, " ");
          if (text) lines.push(`${child.tagName === "OL" ? `${i + 1}.` : "-"} ${text}`);
        });
      } else if (child.tagName === "BLOCKQUOTE") {
        walk(child);
      } else {
        for (const line of inlineText(child).split("\n")) if (line.trim()) lines.push(LIST_LINE.test(line.trim()) ? `\\${line.trim()}` : line.trim());
      }
    }
  };
  walk(doc.body);
  return lines.join("\n");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inlineHtml = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

export function cellToHtml(text: string): string {
  const out: string[] = [];
  const open: { list: { tag: "ul" | "ol"; items: string[] } | null } = { list: null };
  const flush = () => {
    const list = open.list;
    if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li><p>${x}</p></li>`).join("")}</${list.tag}>`);
    open.list = null;
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("\\")) {
      flush();
      out.push(`<p>${inlineHtml(line.slice(1))}</p>`);
      continue;
    }
    const item = /^[-•*]\s+(.*)$/.exec(line) ?? /^\d+[.)]\s+(.*)$/.exec(line);
    const tag = /^[-•*]\s/.test(line) ? "ul" : item ? "ol" : null;
    if (tag && item) {
      if (open.list?.tag !== tag) flush();
      open.list ??= { tag, items: [] };
      open.list.items.push(inlineHtml(item[1]));
    } else {
      flush();
      out.push(`<p>${inlineHtml(line)}</p>`);
    }
  }
  flush();
  return out.join("");
}

// HTML that a cell cannot hold (italic, links, headings, nested lists ...): rewriting it from the cell loses that.
const CELL_TAGS = new Set(["P", "UL", "OL", "LI", "STRONG", "B", "BR", "BLOCKQUOTE"]);
export function richerThanCell(html: string | null | undefined): boolean {
  if (!html?.trim()) return false;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return Array.from(doc.body.querySelectorAll("*")).some((el) => !CELL_TAGS.has(el.tagName) || ((el.tagName === "UL" || el.tagName === "OL") && !!el.parentElement?.closest("li")));
}

// A short fingerprint of a row's editable cells (cyrb53): the import compares it with the current version.
function fingerprint(cells: string[]): string {
  const str = cells.join("\u0001");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Equal as cell text (so an unchanged export never counts as a change).
const norm = (s: string | null | undefined) => (s ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

export const parseSigns = (cell: string) => [...new Set(cell.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
const parseList = (cell: string) => cell.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
const joinList = (names: string[]) => names.join("; ");
const sameSet = (a: string[], b: string[]) => {
  const x = new Set(a.map((v) => v.toLowerCase()));
  return x.size === new Set(b.map((v) => v.toLowerCase())).size && b.every((v) => x.has(v.toLowerCase()));
};
export const parseNumber = (cell: string) => {
  const m = /^(?:BA-?)?0*(\d+)$/i.exec(cell.trim());
  return m ? Number(m[1]) : null;
};

// ---------------------------------------------------------------------------------------------
// The data of the version an export shows and an import works on
// ---------------------------------------------------------------------------------------------

export type InstructionData = {
  instruction: InstructionOverview;
  version: InstructionVersion | null;
  texts: InstructionText[];
  assets: string[];
  assetTypes: string[];
  trainingTypes: string[];
};

export async function loadInstructionData(rows: InstructionOverview[]): Promise<Map<string, InstructionData>> {
  const baseIds = rows.map((r) => r.open_version_id ?? r.published_version_id).filter((x): x is string => !!x);
  const ids = rows.map((r) => r.id);
  type LinkRow = { instruction_id: string; asset: { name: string; path: string } | null; asset_type: { name: string; name_de: string } | null };
  type TrainingRow = { instruction_id: string; training_type: { name: string } | null };
  const [versions, texts, links, trainings] = await Promise.all([
    selectInChunks<InstructionVersion>(baseIds, (c) => supabaseClient.from("operating_instruction_versions").select("*").in("id", c)),
    selectInChunks<InstructionText>(baseIds, (c) => supabaseClient.from("operating_instruction_texts").select("version_id, language, title, work_area, subject, sections, needs_check").in("version_id", c), 50),
    selectInChunks<LinkRow>(ids, (c) => supabaseClient.from("operating_instruction_assets").select("instruction_id, asset:assets(name, path), asset_type:asset_types(name, name_de)").in("instruction_id", c) as unknown as PromiseLike<{ data: LinkRow[] | null }>),
    selectInChunks<TrainingRow>(ids, (c) => supabaseClient.from("training_type_operating_instructions").select("instruction_id, training_type:training_types(name)").in("instruction_id", c) as unknown as PromiseLike<{ data: TrainingRow[] | null }>),
  ]);
  // Assets are named by their path, so equal names in different places stay apart.
  const label = (id: string) => id.replace(/_/g, "-");
  const ancestorIds = [...new Set(links.flatMap((l) => (l.asset?.path.split(".").slice(0, -1) ?? []).map(label)))];
  const ancestors = new Map(
    (await selectInChunks<{ id: string; name: string }>(ancestorIds, (c) => supabaseClient.from("assets").select("id, name").in("id", c))).map((a) => [a.id, a.name]),
  );
  const assetLabel = (a: { name: string; path: string }) =>
    [...a.path.split(".").slice(0, -1).map((x) => ancestors.get(label(x))).filter((x): x is string => !!x), a.name].join(PATH_SEPARATOR);
  const sorted = (names: string[]) => names.sort((a, b) => a.localeCompare(b));
  const out = new Map<string, InstructionData>();
  for (const r of rows) {
    const versionId = r.open_version_id ?? r.published_version_id;
    out.set(r.id, {
      instruction: r,
      version: versions.find((v) => v.id === versionId) ?? null,
      texts: texts.filter((t) => t.version_id === versionId),
      assets: sorted(links.filter((l) => l.instruction_id === r.id && l.asset).map((l) => assetLabel(l.asset!))),
      assetTypes: sorted(links.filter((l) => l.instruction_id === r.id && l.asset_type).map((l) => localName(l.asset_type))),
      trainingTypes: sorted(trainings.filter((l) => l.instruction_id === r.id && l.training_type).map((l) => l.training_type!.name)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

type Ts = { t: TFunction; de: TFunction; en: TFunction };

function rowsOf(d: InstructionData, languages: string[]): string[][] {
  const order = ["de", ...languages.filter((l) => l !== "de"), ...d.texts.map((x) => x.language).filter((l) => l !== "de" && !languages.includes(l)).sort()];
  const wanted = order.filter((l) => l === "de" || languages.includes(l));
  return wanted.map((language) => {
    const text = d.texts.find((x) => x.language === language);
    const german = language === "de";
    const cell = (c: Column): string => {
      if (!german && SHARED.includes(c)) return "";
      switch (c) {
        case "number": return instructionNumber(d.instruction.number);
        case "legacy_number": return d.instruction.legacy_number ?? "";
        case "version": return d.version ? String(d.version.version_no) : "";
        case "status": return d.version?.status ?? "";
        case "language": return language;
        case "kind": return d.instruction.kind;
        case "title": return text?.title ?? "";
        case "work_area": return text?.work_area ?? "";
        case "subject": return text?.subject ?? "";
        case "signal_word": return d.version?.signal_word ?? "";
        case "assets": return joinList(d.assets);
        case "asset_types": return joinList(d.assetTypes);
        case "training_types": return joinList(d.trainingTypes);
        case "change_note": return d.version?.change_note ?? "";
        case "checksum": return "";
        default: {
          const [, section, part] = /^(.+)_(signs|text)$/.exec(c)!;
          return part === "signs" ? (d.version?.signs?.[section] ?? []).join(", ") : htmlToCell(text?.sections?.[section]);
        }
      }
    };
    const cells = COLUMNS.map(cell);
    cells[COLUMNS.indexOf("checksum")] = fingerprint(HASHED.map((c) => cells[COLUMNS.indexOf(c)]));
    return cells;
  });
}

function signSheet({ de, en }: Ts): SheetSpec {
  return {
    name: "Signs",
    header: true,
    widths: [10, 26, 40, 40],
    rows: [["code", "group", "de", "en"], ...SIGNS.map((s) => [s.code, s.group, de(`safetySigns.codes.${s.code}`), en(`safetySigns.codes.${s.code}`)])],
  };
}

function guideSheet({ t }: Ts): SheetSpec {
  const g = (k: string, o?: Record<string, string>) => t(`operatingInstructions.excel.guide.${k}`, o);
  const sections = KINDS.map((k) => `${t(`operatingInstructions.kinds.${k}`)}: ${KIND_SECTIONS[k].join(", ")}`).join(" · ");
  return {
    name: "Guide",
    widths: [120],
    rows: [
      [g("title")],
      [g("rows")],
      [g("german")],
      [g("new")],
      [g("existing")],
      [g("never")],
      [g("format")],
      [g("signs", { groups: SIGN_GROUPS.join(", ") })],
      [g("sections", { sections })],
      [g("links", { none: NONE, separator: PATH_SEPARATOR.trim() })],
      [g("values")],
      [g("translate")],
      [g("checksum")],
    ],
  };
}

export function instructionWorkbook(data: InstructionData[], languages: string[], ts: Ts): Blob {
  return writeXlsx([
    {
      name: SHEET,
      header: true,
      widths: COLUMNS.map((c) => WIDTHS[c] ?? (c.endsWith("_signs") ? 14 : 48)),
      rows: [[...COLUMNS], ...data.flatMap((d) => rowsOf(d, languages))],
      lists: [
        { col: COLUMNS.indexOf("kind"), values: KINDS },
        { col: COLUMNS.indexOf("signal_word"), values: ["danger", "warning"] },
      ],
    },
    signSheet(ts),
    guideSheet(ts),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

export type ImportProblem = { key: string; values?: Record<string, string> };
export type ImportItemPayload = {
  row: number;
  instruction_id: string | null;
  base_version_id: string | null;
  kind?: InstructionKind;
  legacy_number?: string;
  signal_word?: SignalWord | "";
  signs?: Record<string, string[]>;
  change_note?: string;
  texts?: Record<string, { title: string; work_area: string; subject: string; sections: Record<string, string> }>;
  assets?: string[];
  asset_types?: string[];
  training_types?: string[];
};
export type ImportGroup = {
  row: number;
  number: number | null;
  title: string;
  languages: string[];
  // What differs from the current version (column groups: text:<language>, signs, signal_word, links, ...).
  changes: string[];
  problems: ImportProblem[];
  // Shown, but the instruction is still imported.
  warnings: ImportProblem[];
  payload: ImportItemPayload | null;
};

type SheetRow = { row: number; cells: Partial<Record<Column, string>> };

// The rows of the instruction sheet, keyed by column name (unknown columns are ignored; a missing column = unchanged).
export async function readInstructionSheet(buffer: ArrayBuffer): Promise<SheetRow[]> {
  const sheets = await readXlsx(buffer);
  const rows = sheets[SHEET] ?? Object.values(sheets)[0];
  if (!rows?.length) throw new Error("empty");
  const header = (rows[0] ?? []).map((h) => (h ?? "").trim().toLowerCase());
  const index = new Map<Column, number>();
  for (const c of COLUMNS) {
    const i = header.indexOf(c);
    if (i >= 0) index.set(c, i);
  }
  if (!index.has("title") && !index.has("number")) throw new Error("header");
  const out: SheetRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const cells: Partial<Record<Column, string>> = {};
    for (const [c, at] of index) cells[c] = (r?.[at] ?? "").trim();
    if (Object.values(cells).some((v) => v)) out.push({ row: i + 2, cells });
  });
  return out;
}

// Groups the rows into instructions: rows with the same number belong together; a row without a number in another
// language than German belongs to the new instruction of the row above it.
function groupRows(rows: SheetRow[]) {
  const groups: { number: number | null; rows: SheetRow[]; problems: ImportProblem[] }[] = [];
  const byNumber = new Map<number, (typeof groups)[number]>();
  let lastNew: (typeof groups)[number] | null = null;
  for (const r of rows) {
    const numberCell = r.cells.number ?? "";
    const language = (r.cells.language || "de").toLowerCase();
    if (numberCell) {
      const n = parseNumber(numberCell);
      if (n == null) {
        groups.push({ number: null, rows: [r], problems: [{ key: "badNumber", values: { value: numberCell } }] });
        lastNew = null;
        continue;
      }
      const g = byNumber.get(n) ?? { number: n, rows: [], problems: [] };
      if (!byNumber.has(n)) {
        byNumber.set(n, g);
        groups.push(g);
      }
      g.rows.push(r);
      lastNew = null;
    } else if (language !== "de" && lastNew) {
      lastNew.rows.push(r);
    } else {
      lastNew = { number: null, rows: [r], problems: language === "de" ? [] : [{ key: "orphanTranslation" }] };
      groups.push(lastNew);
    }
  }
  return groups;
}

export function planImport(rows: SheetRow[], all: InstructionOverview[], data: Map<string, InstructionData>): ImportGroup[] {
  const byNumber = new Map(all.map((x) => [x.number, x]));
  return groupRows(rows).map((g): ImportGroup => {
    const problems = [...g.problems];
    const first = g.rows[0];
    const existing = g.number != null ? byNumber.get(g.number) : undefined;
    const base = existing ? data.get(existing.id) : undefined;
    if (g.number != null && !existing) problems.push({ key: "unknownNumber", values: { number: instructionNumber(g.number) } });

    const byLanguage = new Map<string, SheetRow>();
    for (const r of g.rows) {
      const l = (r.cells.language || "de").toLowerCase();
      if (!/^[a-z]{2}$/.test(l)) problems.push({ key: "badLanguage", values: { value: l, row: String(r.row) } });
      else if (byLanguage.has(l)) problems.push({ key: "duplicateLanguage", values: { value: l, row: String(r.row) } });
      else byLanguage.set(l, r);
    }
    const german = byLanguage.get("de");
    const kindCell = german?.cells.kind?.toLowerCase();
    const kind: InstructionKind | undefined = existing?.kind ?? (KINDS.includes(kindCell as InstructionKind) ? (kindCell as InstructionKind) : undefined);
    if (!existing) {
      if (!german) problems.push({ key: "needsGerman" });
      else if (!german.cells.title) problems.push({ key: "needsTitle" });
      if (!kind) problems.push({ key: "badKind", values: { value: kindCell ?? "" } });
    } else if (kindCell && kindCell !== existing.kind) problems.push({ key: "kindFixed" });
    if (existing && base?.version && first.cells.version && first.cells.version !== String(base.version.version_no)) {
      problems.push({ key: "staleVersion", values: { file: first.cells.version, current: String(base.version.version_no) } });
    }
    const sections = kind ? KIND_SECTIONS[kind] : ALL_SECTIONS;
    const warnings: ImportProblem[] = [];
    // Changed in COMPASS after the export (the draft edited, a translation added ...): the file would overwrite it.
    if (base) {
      for (const [language, r] of byLanguage) {
        if (!r.cells.checksum) continue;
        const now = rowsOf(base, [language]).find((cells) => cells[COLUMNS.indexOf("language")] === language);
        if (now && now[COLUMNS.indexOf("checksum")] !== r.cells.checksum) problems.push({ key: "changedSinceExport", values: { row: String(r.row) } });
      }
    }

    const payload: ImportItemPayload = {
      row: first.row,
      instruction_id: existing?.id ?? null,
      base_version_id: base?.version?.id ?? null,
      ...(existing ? {} : { kind }),
    };
    const changes: string[] = [];

    // Texts, per language: the current text with the columns that are in the file.
    const texts: NonNullable<ImportItemPayload["texts"]> = {};
    for (const [language, r] of byLanguage) {
      const current = base?.texts.find((x) => x.language === language);
      const text = { title: current?.title ?? "", work_area: current?.work_area ?? "", subject: current?.subject ?? "", sections: { ...(current?.sections ?? {}) } };
      let changed = false;
      for (const field of ["title", "work_area", "subject"] as const) {
        const cell = r.cells[field];
        if (cell !== undefined && norm(cell) !== norm(text[field])) {
          text[field] = cell;
          changed = true;
        }
      }
      for (const s of ALL_SECTIONS) {
        const cell = r.cells[`${s}_text` as Column];
        if (cell === undefined) continue;
        if (!sections.includes(s)) {
          if (cell) problems.push({ key: "foreignSection", values: { section: s, row: String(r.row) } });
          continue;
        }
        if (norm(cell) !== norm(htmlToCell(text.sections[s]))) {
          if (richerThanCell(text.sections[s])) warnings.push({ key: "formattingLost", values: { section: s, row: String(r.row) } });
          if (cell) text.sections[s] = cellToHtml(cell);
          else delete text.sections[s];
          changed = true;
        }
      }
      // An empty row of a language without a text yet adds nothing.
      const empty = !text.title && !text.work_area && !text.subject && !Object.values(text.sections).some((v) => v);
      if (changed && !(empty && !current)) {
        texts[language] = text;
        changes.push(`text:${language}`);
      }
    }
    if (Object.keys(texts).length) payload.texts = texts;

    if (german) {
      const c = german.cells;
      if (c.legacy_number !== undefined && norm(c.legacy_number) !== norm(existing?.legacy_number)) {
        payload.legacy_number = c.legacy_number;
        changes.push("legacy_number");
      }
      if (c.signal_word !== undefined) {
        const word = c.signal_word.toLowerCase();
        if (word && word !== "danger" && word !== "warning") problems.push({ key: "badSignalWord", values: { value: c.signal_word } });
        else if (kind === "substance" && word !== (base?.version?.signal_word ?? "")) {
          payload.signal_word = word as SignalWord | "";
          changes.push("signal_word");
        }
      }
      const signs: Record<string, string[]> = { ...(base?.version?.signs ?? {}) };
      let signsChanged = false;
      for (const s of ALL_SECTIONS) {
        const cell = c[`${s}_signs` as Column];
        if (cell === undefined) continue;
        const codes = parseSigns(cell);
        const unknown = codes.filter((x) => !SIGN_CODES.has(x));
        if (unknown.length) problems.push({ key: "unknownSigns", values: { codes: unknown.join(", "), section: s } });
        if (codes.length && !sections.includes(s)) {
          problems.push({ key: "foreignSection", values: { section: s, row: String(german.row) } });
          continue;
        }
        if (codes.join(",") !== (signs[s] ?? []).join(",")) {
          if (codes.length) signs[s] = codes;
          else delete signs[s];
          signsChanged = true;
        }
      }
      if (signsChanged) {
        payload.signs = signs;
        changes.push("signs");
      }
      if (c.change_note !== undefined && norm(c.change_note) !== norm(base?.version?.change_note)) {
        payload.change_note = c.change_note;
        changes.push("change_note");
      }
      const lists: [Column, "assets" | "asset_types" | "training_types", string[]][] = [
        ["assets", "assets", base?.assets ?? []],
        ["asset_types", "asset_types", base?.assetTypes ?? []],
        ["training_types", "training_types", base?.trainingTypes ?? []],
      ];
      for (const [column, key, current] of lists) {
        const cell = c[column];
        if (!cell) continue;
        const wanted = cell === NONE ? [] : parseList(cell);
        if (!sameSet(wanted, current)) {
          payload[key] = wanted;
          changes.push(key);
        }
      }
    }

    const title = byLanguage.get("de")?.cells.title || existing?.title || g.rows[0].cells.title || "";
    return {
      row: first.row,
      number: g.number,
      title,
      languages: [...byLanguage.keys()],
      changes: existing ? changes : ["new", ...changes.filter((c) => c.startsWith("text:") && c !== "text:de")],
      problems,
      warnings,
      payload: problems.length ? null : payload,
    };
  });
}

export type ImportResult = { row: number; result: "created" | "updated" | "new_draft" | "translation" | "unchanged" | "error"; number: number | null; message?: string };

export async function runImport(items: ImportItemPayload[], apply: boolean): Promise<ImportResult[]> {
  if (!items.length) return [];
  const { data, error } = await supabaseClient.rpc("operating_instruction_import", { p_items: items as never, p_apply: apply });
  if (error) throw error;
  return (data ?? []) as unknown as ImportResult[];
}
