// Ported 1:1 from COMPASS (app/src/modules/absences/decisionCard.tsx).
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Typography } from "antd";
import type { DecisionRow } from "@rbp/module-task-family/src/hooks/useDecisions.ts";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { formatDate } from "@rbp/ui";
import { AbsenceTypeLabel } from "./absenceTypeLabel";
import { formatDays } from "./leave";
import { useLeavePending } from "./useLeave";

// The card of an absence on the page "To decide": person, type, period and days.
export const AbsenceDecisionCard = ({ row, fallback }: { row: DecisionRow; fallback: ReactNode }) => {
  const { t } = useTranslation();
  const { data: pending } = useLeavePending();
  const { data: people } = usePeople();
  const leave = pending?.find((p) => p.task_id === row.id);
  if (!leave) return <>{fallback}</>;
  const person = people?.find((p) => p.id === leave.user_id);
  return (
    <>
      <Typography.Text strong>{personName(person)}</Typography.Text> · <AbsenceTypeLabel id={leave.absence_type_id} />
      <div>
        {formatDate(leave.from_date)}{leave.start_half ? ` (${t("leave.fromMidday")})` : ""} – {formatDate(leave.to_date)}{leave.end_half ? ` (${t("leave.untilMidday")})` : ""}
        {" · "}
        {formatDays(leave.working_days)} {t("leave.days")}
      </div>
    </>
  );
};
