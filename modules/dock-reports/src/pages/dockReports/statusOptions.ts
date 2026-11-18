// Ported 1:1 from the NPM tool (app/src/pages/dockReports/statusOptions.ts).
// Canonical dock_reports.status values (see the check constraint on the
// table, 20260926090000) - draft (being compiled, editable), submitted (sent
// in for review/compilation into the final report), finalized (done).
export const DOCK_REPORT_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "finalized", label: "Finalized" },
];

export const DOCK_REPORT_STATUS_COLOR: Record<string, string> = {
  draft: "default",
  submitted: "gold",
  finalized: "green",
};
