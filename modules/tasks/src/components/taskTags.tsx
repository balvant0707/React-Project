// "Who works it" label of a task. Status, priority and due date are COMPASS's tags (./tags.tsx).
import { Space, Typography } from "antd";
import { TeamOutlined, UserOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { TaskOverviewRow } from "../lib/domain";

// Who the task waits for: the person or team / role of the current step, else the assignee or the task's team.
export const AssigneeCell = ({ task }: { task: Pick<TaskOverviewRow, "status" | "current_assignee_user_name" | "current_assignee_team_name" | "current_assignee_role_name" | "assigned_user_name" | "team_name"> }) => {
  const { t } = useTranslation();
  if (task.status === "done" || task.status === "cancelled") return <Typography.Text type="secondary">{task.assigned_user_name ?? task.team_name ?? "—"}</Typography.Text>;
  const person = task.current_assignee_user_name ?? (task.current_assignee_team_name || task.current_assignee_role_name ? null : task.assigned_user_name);
  const group = [task.current_assignee_role_name, task.current_assignee_team_name].filter(Boolean).join(t("tasks.inTeam"));
  if (person) return <Space size={4}><UserOutlined />{person}</Space>;
  if (group) return <Space size={4}><TeamOutlined />{group}</Space>;
  if (task.team_name) return <Space size={4}><TeamOutlined />{task.team_name}</Space>;
  return <Typography.Text type="secondary">{t("tasks.nobody")}</Typography.Text>;
};
