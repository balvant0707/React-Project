// Ported 1:1 from the NPM tool (app/src/pages/hullEvents/statusOptions.ts).
// Canonical hull_events.status values - recovered from a Superset SQL
// expression (Hullevent_Status_Description) mapping the legacy single-letter
// codes to labels. See ~/npm_tool/docs/open-questions.md #32a. Stored as the label text
// (not the letter code) since this is a plain lookup, not a hard enum -
// extensible later without a migration if a new value shows up.
export const HULL_EVENT_STATUS_OPTIONS = [
  { value: "Secured", label: "Secured" },
  { value: "Promising", label: "Promising" },
  { value: "50/50", label: "50/50" },
  { value: "Low", label: "Low" },
  { value: "Lost", label: "Lost" },
  { value: "Open", label: "Open" },
  { value: "Report only", label: "Report only" },
  { value: "Planned inspection", label: "Planned inspection" },
  { value: "Inspected", label: "Inspected" },
  // Not a real pipeline stage a user picks - the literal value legacy
  // records with an unmapped status code (Z/T) get backfilled to (see
  // 20260912092000_additional_mandatory_fields.sql). Listed here so it's
  // filterable/visible, same as any other status.
  { value: "Not set", label: "Not set" },
];

export const HULL_EVENT_STATUS_COLOR: Record<string, string> = {
  Secured: "green",
  Lost: "red",
  Promising: "blue",
  "50/50": "cyan",
  Low: "default",
  Open: "gold",
  "Report only": "default",
  "Planned inspection": "purple",
  Inspected: "geekblue",
  "Not set": "default",
};

// Hex colors for the status chart and the Hull Events list's row-color strip
// (@ant-design/plots needs real colors, not antd color names). Carried over
// directly from the legacy Superset dashboard's Hullevent_Status_Description
// color mapping (per letter code A/B/C/D/E/Z/R/P/I/X) so the new tool's
// status colors match what users already associate with each status from
// NPMSS/Superset - deliberately NOT the same palette as HULL_EVENT_STATUS_COLOR
// above (that one predates this mapping and is only used for the plain antd
// Tag on the Hull Event detail page). All 10 values are distinct on purpose -
// two statuses sharing a hex here would make them indistinguishable on the
// chart and list.
export const HULL_EVENT_STATUS_HEX: Record<string, string> = {
  Secured: "#45fe73",
  Promising: "#09f8a8",
  "50/50": "#0bebfe",
  Low: "#1a9eff",
  Lost: "#496fff",
  Open: "#fff700",
  "Report only": "#083763",
  "Planned inspection": "#f2f2f2",
  Inspected: "#bfbfbf",
  "Not set": "#f83fa0",
};
