// Ported 1:1 from the NPM tool (app/src/pages/vessels/seawebExcel.ts).
// Maps the SeaWeb "Ship Data All" Excel export (one sheet, header row first) to vessels.* columns. Pure - no I/O - so it
// also runs inside the parse worker (seawebExcelWorker.ts). Reference file:
// Reference documents/2026-08 Seaweb Ship Data All_*.xlsx (~178k rows, 22 columns).

type VesselRow = Record<string, string | number | null>;

// SeaWeb header (trimmed, lower case) -> vessels column. Other columns in the file (e.g. "Issued Date") are ignored;
// vessel_sanction and overall_risk_rating are not part of this export and stay untouched on existing vessels. The
// "... Control" and "Shipbuilder Region" columns hold a country name, so they fill the *_country columns.
const HEADER_TO_COLUMN: Record<string, string> = {
  "imo/lr/ihs no.": "imo",
  "name of ship": "name",
  status: "status",
  "built date": "built_date",
  deadweight: "deadweight_tonnage",
  gt: "gross_tonnage",
  nt: "net_tonnage",
  "ship type": "ship_type",
  flag: "flag",
  class: "class_society",
  "docking survey": "docking_survey_date",
  "shipbuilding company": "shipbuilder",
  "shipbuilder region": "shipbuilder_country",
  "group owner": "group_owner",
  "group owner control": "group_owner_country",
  shipmanager: "ship_manager",
  "shipmanager control": "ship_manager_country",
  "technical manager name": "technical_manager",
  "technical manager control": "technical_manager_country",
  operator: "operator",
  "operator control": "operator_country",
};

const NUMERIC_COLUMNS = new Set(["deadweight_tonnage", "gross_tonnage", "net_tonnage"]);
const DATE_COLUMNS = new Set(["built_date", "docking_survey_date"]);

const normalizeHeader = (h: unknown) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Excel dates arrive as Date objects at UTC midnight; a text cell is accepted as long as it starts with an ISO date.
const toIsoDate = (raw: unknown): string | null => {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// SeaWeb writes 0 for an unknown tonnage; storing it would pull the DWT averages down, so it becomes null.
const toTonnage = (raw: unknown): number | null => {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

type MappedColumn = { header: string; column: string; example: string | null };

export type SeawebParseResult = {
  vessels: VesselRow[];
  sheetRows: number; // data rows in the sheet
  skippedWithoutImo: number;
  duplicateImos: number; // later rows win
  unknownTonnage: number; // tonnage cells that were 0 (or not a number) and became null
  mappedColumns: MappedColumn[]; // for the confirmation step: header -> vessel column, with one example value
  ignoredHeaders: string[]; // file columns that are not imported
  missingColumns: string[]; // vessel columns this file does not provide (left untouched on existing vessels)
  error?: string;
};

export const EMPTY_PARSE_RESULT: SeawebParseResult = {
  vessels: [],
  sheetRows: 0,
  skippedWithoutImo: 0,
  duplicateImos: 0,
  unknownTonnage: 0,
  mappedColumns: [],
  ignoredHeaders: [],
  missingColumns: [],
};

const formatExample = (raw: unknown): string | null => {
  if (raw == null || raw === "") return null;
  return raw instanceof Date ? toIsoDate(raw) : String(raw).trim() || null;
};

// Every vessels column an import can fill: the mapped ones plus the ones deliberately absent from the SeaWeb export.
const MAPPABLE_COLUMNS = [...Object.values(HEADER_TO_COLUMN), "vessel_sanction", "overall_risk_rating"];

export const parseSeawebSheet = (sheet: unknown[][]): SeawebParseResult => {
  if (sheet.length === 0) return { ...EMPTY_PARSE_RESULT, error: "The Excel file is empty." };

  const headers = (sheet[0] ?? []).map((h) => String(h ?? "").trim());
  const columnByIndex: (string | null)[] = headers.map((h) => HEADER_TO_COLUMN[normalizeHeader(h)] ?? null);
  if (!columnByIndex.includes("imo")) {
    return {
      ...EMPTY_PARSE_RESULT,
      error: 'The first row must be the SeaWeb header with an "IMO/LR/IHS No." column - it is the key used to match existing vessels.',
    };
  }

  // The first non-empty cell of the first 200 data rows serves as the example value.
  const mappedColumns: MappedColumn[] = [];
  columnByIndex.forEach((column, i) => {
    if (!column) return;
    let example: string | null = null;
    for (let r = 1; r < Math.min(sheet.length, 201) && example == null; r++) example = formatExample(sheet[r][i]);
    mappedColumns.push({ header: headers[i], column, example });
  });
  const ignoredHeaders = headers.filter((h, i) => h !== "" && !columnByIndex[i]);
  const missingColumns = MAPPABLE_COLUMNS.filter((c) => !columnByIndex.includes(c));

  const byImo = new Map<string, VesselRow>();
  let skippedWithoutImo = 0;
  let duplicateImos = 0;
  let unknownTonnage = 0;
  for (let r = 1; r < sheet.length; r++) {
    const cells = sheet[r];
    const row: VesselRow = {};
    columnByIndex.forEach((col, i) => {
      if (!col) return;
      const raw = cells[i];
      if (NUMERIC_COLUMNS.has(col)) {
        row[col] = toTonnage(raw);
        if (row[col] == null && raw != null && raw !== "") unknownTonnage++;
      } else if (DATE_COLUMNS.has(col)) row[col] = toIsoDate(raw);
      else {
        const text = raw == null ? "" : String(raw).trim();
        row[col] = text === "" ? null : text;
      }
    });
    if (row.imo == null) {
      skippedWithoutImo++;
      continue;
    }
    // One upsert batch must not contain the same IMO twice ("ON CONFLICT DO UPDATE cannot affect row a second time").
    if (byImo.has(row.imo as string)) duplicateImos++;
    byImo.set(row.imo as string, row);
  }
  return {
    vessels: [...byImo.values()],
    sheetRows: sheet.length - 1,
    skippedWithoutImo,
    duplicateImos,
    unknownTonnage,
    mappedColumns,
    ignoredHeaders,
    missingColumns,
  };
};
