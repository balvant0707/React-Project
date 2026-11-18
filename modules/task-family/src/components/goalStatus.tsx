// Ported 1:1 from COMPASS (app/src/components/goalStatus.tsx).
import { Tag } from "antd";
import { useTranslation } from "react-i18next";
import { GOAL_STATUS_COLORS } from "../lib/goals";

export const GoalStatusTag = ({ status }: { status: string | null | undefined }) => {
  const { t } = useTranslation();
  if (!status) return null;
  return <Tag color={GOAL_STATUS_COLORS[status] ?? "default"}>{t(`goals.status.${status}`, { defaultValue: status })}</Tag>;
};
