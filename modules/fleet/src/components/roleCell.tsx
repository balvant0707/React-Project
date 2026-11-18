// Ported 1:1 from the NPM tool (app/src/components/roleCell.tsx).
import type { ReactNode } from "react";
import { Typography } from "antd";

// A role column's cell: a small muted "{role} in {country}" caption above the
// resolved value (company link, with its parent group folded in behind it in
// brackets - see companyWithGroup - rather than a separate "Parent" column).
// Shared by the vessels and hull events lists.
export const roleCell = (roleLabel: string, country: string | null, content: ReactNode | null) => (
  <div>
    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
      {country ? `${roleLabel} in ${country}` : roleLabel}
    </Typography.Text>
    <div>{content ?? <span style={{ color: "#aaa" }}>—</span>}</div>
  </div>
);

// Two role cells stacked in one column - Owner+Operator and Technical
// Manager+Ship Manager are paired this way (rather than 4 separate columns)
// to keep the table from getting too wide.
export const stackedRoleCells = (top: ReactNode, bottom: ReactNode) => (
  <div>
    {top}
    <div style={{ marginTop: 6 }}>{bottom}</div>
  </div>
);
