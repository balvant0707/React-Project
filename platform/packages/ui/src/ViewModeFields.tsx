// From the NPM tool (app/src/components/viewModeFields.tsx), until 2026-11-13 ported into npm-base; now one copy in the platform.
import { ConfigProvider, theme } from "antd";
import type { PropsWithChildren } from "react";

const WRAPPER_CLASS = "npm-view-mode-fields";

// Wraps a read-only view of a group of fields so they render as plain flush
// text instead of antd's grey "disabled" chrome - no changes needed to the
// Form.Item/control code itself, so the exact same JSX renders both edit and
// view mode. `componentDisabled` makes this the thing that actually disables
// the fields too (via antd's normal Form/ConfigProvider disabled-context
// cascade - same mechanism `<Form disabled>` already uses elsewhere in this
// app), which matters wherever a page has no single form-level `disabled`
// prop to piggyback on (e.g. a per-tab-editable page like companies/vessels).
//
// Only wrap the specific fields that are out of edit right now: a field
// that's individually `disabled` while its neighbors are editable (e.g. the
// auto-assigned Specification number) should keep the normal grey look -
// that's a different signal ("you can't touch this one, unlike its
// neighbors") that this wrapper would otherwise erase.
//
// `colorBgContainerDisabled`/`colorTextDisabled` are global alias tokens
// consumed only by disabled form controls (Input/Select/DatePicker/
// InputNumber/Radio/Checkbox/...), so overriding them for this subtree is
// safe - nothing else reads them. Border removal and the rest (hiding
// dropdown/calendar affordances, tightening Form.Item spacing) aren't
// exposed as theme tokens, so those are done with a small scoped stylesheet
// instead, targeting antd's stable class names.
export const ViewModeFields = ({ active, children }: PropsWithChildren<{ active: boolean }>) => {
  const { token } = theme.useToken();
  if (!active) return <>{children}</>;
  return (
    <ConfigProvider
      componentDisabled
      theme={{ token: { colorBgContainerDisabled: "transparent", colorTextDisabled: token.colorText } }}
    >
      <div className={WRAPPER_CLASS}>
        <style>{`
          .${WRAPPER_CLASS} .ant-input,
          .${WRAPPER_CLASS} .ant-input-number,
          .${WRAPPER_CLASS} .ant-input-affix-wrapper,
          .${WRAPPER_CLASS} .ant-picker,
          .${WRAPPER_CLASS} .ant-select .ant-select-selector {
            border-color: transparent !important;
            box-shadow: none !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            padding-inline: 0 !important;
            cursor: default !important;
          }
          .${WRAPPER_CLASS} .ant-input-number-input {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          .${WRAPPER_CLASS} .ant-select-arrow,
          .${WRAPPER_CLASS} .ant-picker-suffix,
          .${WRAPPER_CLASS} .ant-picker-clear,
          .${WRAPPER_CLASS} .ant-input-number-handler-wrap,
          .${WRAPPER_CLASS} .ant-select-selection-placeholder {
            display: none !important;
          }
          .${WRAPPER_CLASS} input::placeholder,
          .${WRAPPER_CLASS} textarea::placeholder {
            color: transparent !important;
          }
          .${WRAPPER_CLASS} .ant-form-item {
            margin-bottom: 12px;
          }
          .${WRAPPER_CLASS} .ant-form-item-label > label {
            color: ${token.colorTextTertiary} !important;
            font-weight: normal !important;
          }
        `}</style>
        {children}
      </div>
    </ConfigProvider>
  );
};
