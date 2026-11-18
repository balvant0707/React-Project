// Ported 1:1 from COMPASS (app/src/components/trainingStatusTag.tsx).
import { Tag } from "antd";
import { useTranslation } from "react-i18next";
import { STATUS_COLOR, type TrainingStatus } from "../lib/trainings";

export const TrainingStatusTag = ({ status }: { status: TrainingStatus }) => {
  const { t } = useTranslation();
  return <Tag color={STATUS_COLOR[status]} style={{ margin: 0 }}>{t(`trainings.status.${status}`)}</Tag>;
};
