// Ported 1:1 from COMPASS (app/src/modules/absences/requestModal.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Checkbox, DatePicker, Form, Input, Modal, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";
import { LeaveRuleAlert } from "./ruleAlert";
import { useHolidayCoverage, useInvalidateLeave, useLeaveCheck, useLeaveEnterableTypes } from "./useLeave";
import { Alert } from "antd";
import { type LeaveRequest } from "./leave";
import { AbsenceTypeOption } from "./absenceTypeLabel";
import { useAbsenceTypes } from "./useAbsenceTypes";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useMe } from "@rbp/core";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";

type FormValues = { range: [Dayjs, Dayjs]; start_half: boolean; end_half: boolean; absence_type_id: string; comment?: string };
const iso = (d: Dayjs) => d.format("YYYY-MM-DD");

// Reports an absence of a chosen type (its route decides whether it needs approval), or (with `request`) changes period
// and half days of a waiting request: the requester, and the approver before approving. Both show the days on which the
// period would break the absence rule.
export const LeaveRequestModal = ({
  open,
  request,
  initialRange,
  forUserId,
  onClose,
  onSaved,
}: {
  open: boolean;
  request?: LeaveRequest | null;
  initialRange?: [string, string];
  // Entering leave for somebody else (a supervisor or deputy): decided at once.
  forUserId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const invalidate = useInvalidateLeave();
  const { userId: meId } = useMe();
  const { data: people } = usePeople();
  const forOther = !request && !!forUserId && forUserId !== meId;
  const otherName = forOther ? personName(people?.find((x) => x.id === forUserId)) : "";
  const { data: holidaysUntil } = useHolidayCoverage();
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const watched = Form.useWatch([], form) as Partial<FormValues> | undefined;
  const { data: absenceTypes } = useAbsenceTypes();
  // For somebody else only the types whose route the caller decides at its first step (or all, as HR).
  const { data: enterableTypeIds } = useLeaveEnterableTypes(forOther ? forUserId : undefined);
  const activeTypes = (absenceTypes ?? []).filter((x) => x.active && (!forOther || !!enterableTypeIds?.includes(x.id)));
  const defaultTypeId = activeTypes[0]?.id;

  useEffect(() => {
    if (!open) return;
    if (request) {
      form.setFieldsValue({ range: [dayjs(request.from_date), dayjs(request.to_date)], start_half: request.start_half, end_half: request.end_half });
    } else {
      form.resetFields();
      if (initialRange) form.setFieldsValue({ range: [dayjs(initialRange[0]), dayjs(initialRange[1])] });
    }
  }, [open, request, initialRange, form]);

  // The default type arrives with the types; it never resets what was already entered.
  useEffect(() => {
    if (open && !request && defaultTypeId && !form.getFieldValue("absence_type_id")) form.setFieldsValue({ absence_type_id: defaultTypeId });
  }, [open, request, defaultTypeId, form]);

  const range = watched?.range;
  const { data: violations } = useLeaveCheck({
    from: range?.[0] ? iso(range[0]) : undefined,
    to: range?.[1] ? iso(range[1]) : undefined,
    startHalf: watched?.start_half,
    endHalf: watched?.end_half,
    userId: request?.user_id ?? (forOther ? forUserId : undefined),
    excludeRequestId: request?.id,
  });

  const submit = async (v: FormValues) => {
    setSaving(true);
    const [from, to] = v.range;
    // The type of a waiting request does not change; its title keeps the type's name.
    const type = absenceTypes?.find((x) => x.id === (request?.absence_type_id ?? v.absence_type_id));
    const title = t("leave.taskTitle", { type: localName(type), from: formatDate(iso(from)), to: formatDate(iso(to)) });
    const { error } = request
      ? await supabaseClient.rpc("leave_request_adjust", {
          p_leave_request_id: request.id,
          p_from_date: iso(from),
          p_to_date: iso(to),
          p_start_half: !!v.start_half,
          p_end_half: !!v.end_half,
          p_title: title,
          p_comment: v.comment ?? null,
        })
      : await supabaseClient.rpc("leave_request_create", {
          p_from_date: iso(from),
          p_to_date: iso(to),
          p_start_half: !!v.start_half,
          p_end_half: !!v.end_half,
          p_absence_type_id: v.absence_type_id,
          p_title: title,
          p_comment: v.comment ?? null,
          p_user_id: forOther ? forUserId : null,
        });
    setSaving(false);
    if (error) return void message.error(errorText(error));
    message.success(t(request ? "leave.adjusted" : forOther ? "leave.entered" : "leave.requested"));
    invalidate();
    onSaved?.();
    onClose();
  };

  return (
    <Modal open={open} title={forOther ? t("leave.enterFor", { name: otherName }) : t(request ? "leave.adjust" : "leave.request")} onCancel={onClose} onOk={() => form.submit()} confirmLoading={saving} okText={t(request ? "common.save" : forOther ? "leave.enter" : "leave.send")} destroyOnClose>
      <Form<FormValues> form={form} layout="vertical" onFinish={submit} initialValues={{ start_half: false, end_half: false }}>
        <Form.Item name="range" label={t("leave.period")} rules={[{ required: true }]}>
          <DatePicker.RangePicker style={{ width: "100%" }} disabledDate={(d) => d.isBefore(dayjs().subtract(1, "year"))} />
        </Form.Item>
        <Form.Item name="start_half" valuePropName="checked" style={{ marginBottom: 4 }}>
          <Checkbox>{t("leave.startHalf")}</Checkbox>
        </Form.Item>
        <Form.Item name="end_half" valuePropName="checked">
          <Checkbox>{t("leave.endHalf")}</Checkbox>
        </Form.Item>
        {range?.[1] && (!holidaysUntil || iso(range[1]) > holidaysUntil) && (
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("leave.holidaysMissing", { date: holidaysUntil ? formatDate(holidaysUntil) : "—" })} />
        )}
        {forOther && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("leave.enterForHint", { name: otherName })} />}
        <LeaveRuleAlert rows={violations} own={!request && !forOther} />
        {!request && (
          <Form.Item name="absence_type_id" label={t("leave.kind")} rules={[{ required: true }]}>
            <Select options={activeTypes.map((x) => ({ value: x.id, label: <AbsenceTypeOption type={x} /> }))} />
          </Form.Item>
        )}
        <Form.Item name="comment" label={t(request ? "leave.adjustComment" : "leave.comment")}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
