// Ported 1:1 from COMPASS (app/src/modules/absences/taskPanel.tsx).
import { useState } from "react";
import { Button, Card, Descriptions, Tag } from "antd";
import { EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { LeaveRequestModal } from "./requestModal";
import { LeaveRuleAlert } from "./ruleAlert";
import { useLeaveCheck, useLeaveRequestOfTask } from "./useLeave";
import { LEAVE_STATUS_COLOR, formatDays } from "./leave";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { formatDate } from "@rbp/ui";
import type { PurposeTaskPanelProps } from "@rbp/module-task-family/src/modules/purposes.tsx";
import { AbsenceTypeLabel } from "./absenceTypeLabel";

// The leave data on the task page of a leave request, the days that break the absence rule, and "Change period" for
// the requester and the approver (before approving).
export const LeavePanel = ({ taskId, taskStatus, canAct, isRequester }: PurposeTaskPanelProps) => {
  const canAdjust = canAct || isRequester;
  const { t } = useTranslation();
  const { data: request } = useLeaveRequestOfTask(taskId, taskStatus);
  const { data: people } = usePeople();
  const [editing, setEditing] = useState(false);
  const waiting = request?.status === "requested";
  // Approved leave that has not ended is checked as well: the rule is live, later requests of others count.
  const live = waiting || (request?.status === "approved" && request.to_date >= dayjs().format("YYYY-MM-DD"));
  const { data: violations } = useLeaveCheck({
    from: live ? request?.from_date : undefined,
    to: request?.to_date,
    startHalf: request?.start_half,
    endHalf: request?.end_half,
    userId: request?.user_id,
    excludeRequestId: request?.id,
  });
  if (!request) return null;
  const person = people?.find((p) => p.id === request.user_id);
  return (
    <>
      {live && <LeaveRuleAlert rows={violations} approved={!waiting} />}
      <Card
        size="small"
        style={{ marginBottom: 12 }}
        title={t("leave.title")}
        extra={waiting && canAdjust ? <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>{t("leave.adjust")}</Button> : undefined}
      >
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 5 }}>
          <Descriptions.Item label={t("leave.person")}>{personName(person)}</Descriptions.Item>
          <Descriptions.Item label={t("leave.kind")}><AbsenceTypeLabel id={request.absence_type_id} /></Descriptions.Item>
          <Descriptions.Item label={t("leave.period")}>
            {formatDate(request.from_date)}{request.start_half ? ` (${t("leave.fromMidday")})` : ""} – {formatDate(request.to_date)}{request.end_half ? ` (${t("leave.untilMidday")})` : ""}
          </Descriptions.Item>
          <Descriptions.Item label={t("leave.days")}>{formatDays(request.working_days)}</Descriptions.Item>
          <Descriptions.Item label={t("leave.status")}>
            <Tag color={LEAVE_STATUS_COLOR[request.status]}>{t(`leave.statuses.${request.status}`)}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <LeaveRequestModal open={editing} request={request} onClose={() => setEditing(false)} />
    </>
  );
};
