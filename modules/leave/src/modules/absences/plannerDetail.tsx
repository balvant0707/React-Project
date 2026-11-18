// Ported 1:1 from COMPASS (app/src/modules/absences/plannerDetail.tsx).
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Descriptions, Modal, Popconfirm, Space, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "@rbp/core";
import { useInvalidateLeave } from "./useLeave";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { LEAVE_STATUS_COLOR, canWithdraw, formatDays, type LeaveRequest, type PlannerDay } from "./leave";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { AbsenceTypeLabel } from "./absenceTypeLabel";

// The leave behind a click in the planner. Everybody who sees the planner sees person, period and state (colleagues see that
// somebody is away). Whoever may open the request (the person, the approver, HR) also gets the kind, the working days, a link
// to the request and, for the person, "Withdraw".
export const LeavePlannerDetail = ({ requestId, userId, days, onClose }: { requestId: string | null; userId: string | undefined; days: PlannerDay[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const invalidate = useInvalidateLeave();
  const { data: people } = usePeople();
  const { data: request } = useQuery({
    queryKey: ["leave-request", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("leave_requests").select("*").eq("id", requestId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as LeaveRequest | null;
    },
  });
  const mine = days.filter((d) => d.request_id === requestId).sort((a, b) => a.day.localeCompare(b.day));
  if (!requestId || mine.length === 0) return null;
  const person = people?.find((p) => p.id === mine[0].user_id);
  // Without the request itself the period is what the planner has loaded (a leave that runs beyond the window is cut).
  const from = request?.from_date ?? mine[0].day;
  const to = request?.to_date ?? mine[mine.length - 1].day;
  const status = request?.status ?? mine[0].status;
  const own = mine[0].user_id === userId;

  const withdraw = async () => {
    const { error } = await supabaseClient.rpc("leave_request_withdraw", { p_leave_request_id: requestId });
    if (error) return void message.error(errorText(error));
    message.success(t("leave.withdrawn"));
    invalidate();
    onClose();
  };

  return (
    <Modal
      open
      onCancel={onClose}
      title={<Space><PersonAvatar person={person ?? { name: "", photo_url: null }} size={24} />{personName(person)}</Space>}
      footer={
        <Space>
          {own && request && canWithdraw(request, dayjs().format("YYYY-MM-DD")) && (
            <Popconfirm title={t("leave.withdrawConfirm")} okText={t("leave.withdraw")} onConfirm={() => void withdraw()}>
              <Button danger>{t("leave.withdraw")}</Button>
            </Popconfirm>
          )}
          {request && (
            <Link to={`/tasks/${request.task_id}`}>
              <Button type="primary">{t("leave.openRequest")}</Button>
            </Link>
          )}
          <Button onClick={onClose}>{t("common.close")}</Button>
        </Space>
      }
    >
      <Descriptions size="small" column={1}>
        <Descriptions.Item label={t("leave.period")}>
          {formatDate(from)}{request?.start_half ? ` (${t("leave.fromMidday")})` : ""} – {formatDate(to)}{request?.end_half ? ` (${t("leave.untilMidday")})` : ""}
        </Descriptions.Item>
        <Descriptions.Item label={t("leave.status")}><Tag color={LEAVE_STATUS_COLOR[status]}>{t(`leave.statuses.${status}`)}</Tag></Descriptions.Item>
        {request && <Descriptions.Item label={t("leave.days")}>{formatDays(request.working_days)}</Descriptions.Item>}
        {request?.entered_by_user_id && <Descriptions.Item label={t("leave.enteredBy")}>{personName(people?.find((x) => x.id === request.entered_by_user_id))}</Descriptions.Item>}
        {request && <Descriptions.Item label={t("leave.kind")}><AbsenceTypeLabel id={request.absence_type_id} /></Descriptions.Item>}
      </Descriptions>
    </Modal>
  );
};
