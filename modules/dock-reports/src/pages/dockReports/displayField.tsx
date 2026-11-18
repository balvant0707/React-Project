// Ported 1:1 from the NPM tool (app/src/pages/dockReports/displayField.tsx).
import { theme } from "antd";

// A read-only stand-in for a Select/DatePicker/RemoteSelect field: plain
// resolved text, no input-box chrome at all. Used wherever a field is either
// permanently spec-derived (never editable at all, e.g. "Spec DFT") or
// currently in a view-only state (a past day's Daily Journal card, or the
// whole editor in view mode).
//
// Deliberately borderless/backgroundless (not the box-with-border look of a
// real control): a box the same size/shape as an input reads as "editable"
// until someone tries to click into it - see ~/npm_tool/docs/ui-and-navigation.md's
// view-mode notes. Plain flush text next to its own label reads as data
// instead. Text/number controls (Input, Input.TextArea, InputNumber) don't
// need this - they get a comparable effect for free via the `readOnly` prop.
export const DisplayField = ({
  value,
  placeholder = "—",
  multiline,
  width,
  align,
}: {
  value?: React.ReactNode;
  placeholder?: string;
  multiline?: boolean;
  width?: number | string;
  align?: "left" | "right";
}) => {
  const { token } = theme.useToken();
  const hasValue = value !== undefined && value !== null && value !== "";
  // A disabled antd Select/Input surfaces its full value via native
  // title/tooltip machinery when truncated - this stand-in has no such
  // built-in, so a single-line value that might overflow its fixed width
  // needs its own `title` or it's unrecoverably unreadable once ellipsized.
  const titleAttr = !multiline && typeof value === "string" ? value : undefined;
  return (
    <div
      title={titleAttr}
      style={{
        width: width ?? "100%",
        boxSizing: "border-box",
        padding: multiline ? "2px 0" : "1px 0",
        fontSize: 14,
        lineHeight: multiline ? 1.5 : "22px",
        color: hasValue ? token.colorText : token.colorTextPlaceholder,
        whiteSpace: multiline ? "pre-wrap" : "nowrap",
        overflow: multiline ? "visible" : "hidden",
        textOverflow: "ellipsis",
        textAlign: align ?? "left",
      }}
    >
      {hasValue ? value : placeholder}
    </div>
  );
};
