// Copied 1:1 from COMPASS (app/src/components/filterChip.tsx): the phone UI of both apps comes from COMPASS (docs/shared-parts.md).
import { Tag } from "antd";
import type { ReactNode } from "react";

// A quick filter toggle ("Mine", "Open", "Overdue"): one tap, visible state, wraps nicely on a phone.
export const FilterChip = ({ checked, onChange, disabled, children }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; children: ReactNode }) => (
  <Tag.CheckableTag
    checked={checked}
    onChange={(value) => !disabled && onChange(value)}
    style={{ marginInlineEnd: 0, padding: "4px 12px", fontSize: 14, border: "1px solid rgba(128,128,128,0.35)", opacity: disabled ? 0.5 : 1 }}
  >
    {children}
  </Tag.CheckableTag>
);
