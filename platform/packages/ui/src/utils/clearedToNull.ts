// An antd form hands a cleared Select / InputNumber / DatePicker back as undefined, which JSON drops - an update
// would then silently keep the old value. Use on update payloads; an insert can keep undefined so the column
// default applies.
export const clearedToNull = <T extends Record<string, unknown>>(values: T): T =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === undefined ? null : value])) as T;
