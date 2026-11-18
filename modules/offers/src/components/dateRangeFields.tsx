// Ported 1:1 from the NPM tool (app/src/components/dateRangeFields.tsx).
import { Button, ConfigProvider, DatePicker, Form, Space, Tooltip } from "antd";
import type { Dayjs } from "dayjs";
import { DATE_FORMAT } from "@rbp/ui";

type Props = {
  label: string;
  // Form fields holding the start and the end of the window. The end is the date the rest of the app reads; an
  // empty start means a single date.
  fromName: string;
  toName: string;
  toRequired?: boolean;
  // A quick fill sets the fields programmatically, which does not fire the form's onValuesChange.
  onQuickFill?: () => void;
};

// Monday to Sunday around the date.
const weekOf = (d: Dayjs): [Dayjs, Dayjs] => {
  const start = d.startOf("day").subtract((d.day() + 6) % 7, "day");
  return [start, start.add(6, "day")];
};

/**
 * A delivery window: optional start, end, and Day / Week / Month buttons that expand whichever date is filled
 * (the end if both are) into a single day, its calendar week or its calendar month.
 */
export const DateRangeFields = ({ label, fromName, toName, toRequired, onQuickFill }: Props) => {
  const form = Form.useFormInstance();
  const { componentDisabled } = ConfigProvider.useConfig();
  const from = Form.useWatch(fromName, form) as Dayjs | null | undefined;
  const to = Form.useWatch(toName, form) as Dayjs | null | undefined;
  const anchor = to ?? from ?? null;

  const fill = (start: Dayjs | null, end: Dayjs) => {
    form.setFieldsValue({ [fromName]: start, [toName]: end });
    onQuickFill?.();
  };

  return (
    <Form.Item label={label} required={toRequired}>
      <Space wrap size={8}>
        <Form.Item name={fromName} noStyle>
          <DatePicker placeholder="From (optional)" format={DATE_FORMAT} disabledDate={(d) => !!to && d.isAfter(to, "day")} />
        </Form.Item>
        <span>-</span>
        <Form.Item
          name={toName}
          noStyle
          dependencies={[fromName]}
          rules={[
            ...(toRequired ? [{ required: true, message: "The end date is required" }] : []),
            ({ getFieldValue }) => ({
              validator: (_, value: Dayjs | null) =>
                value && getFieldValue(fromName)?.isAfter(value, "day")
                  ? Promise.reject(new Error("The end date is before the start date"))
                  : Promise.resolve(),
            }),
          ]}
        >
          <DatePicker placeholder="To" format={DATE_FORMAT} disabledDate={(d) => !!from && d.isBefore(from, "day")} />
        </Form.Item>
        {!componentDisabled && (
          <Tooltip title="Fill from the date entered: only that day, its calendar week (Mon-Sun) or its calendar month">
            <Space.Compact>
              <Button disabled={!anchor} onClick={() => anchor && fill(null, anchor)}>
                Day
              </Button>
              <Button
                disabled={!anchor}
                onClick={() => {
                  if (!anchor) return;
                  const [start, end] = weekOf(anchor);
                  fill(start, end);
                }}
              >
                Week
              </Button>
              <Button disabled={!anchor} onClick={() => anchor && fill(anchor.startOf("month"), anchor.endOf("month").startOf("day"))}>
                Month
              </Button>
            </Space.Compact>
          </Tooltip>
        )}
      </Space>
    </Form.Item>
  );
};
