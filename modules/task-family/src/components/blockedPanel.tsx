// Ported 1:1 from COMPASS (app/src/components/blockedPanel.tsx).
import { Link } from "react-router-dom";
import { Alert } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";

// "Waiting for a prerequisite": the open subtasks that must be done before this task can go on (tasks.blocks_parent).
// The task keeps its status and due date; this only says why nothing can happen yet and where to look.
export const BlockedPanel = ({ taskId }: { taskId: string }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["task-blockers", taskId],
    queryFn: async () =>
      ((
        await supabaseClient
          .from("tasks_overview")
          .select("id, task_number, title, due_date, assigned_user_name, team_name")
          .eq("parent_task_id", taskId)
          .eq("blocks_parent", true)
          .not("status", "in", "(done,cancelled)")
          .order("due_date", { nullsFirst: false })
      ).data ?? []) as { id: string; task_number: number; title: string; due_date: string | null; assigned_user_name: string | null; team_name: string | null }[],
  });
  if (!data || data.length === 0) return null;
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      message={t("blocked.title", { count: data.length })}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          {data.map((s) => (
            <li key={s.id}>
              <Link to={`/tasks/${s.id}`}>#{s.task_number} {s.title}</Link>
              {[s.assigned_user_name ?? s.team_name, s.due_date ? `${t("fields.dueDate")}: ${formatDate(s.due_date)}` : null].filter(Boolean).length > 0 &&
                ` · ${[s.assigned_user_name ?? s.team_name, s.due_date ? `${t("fields.dueDate")}: ${formatDate(s.due_date)}` : null].filter(Boolean).join(" · ")}`}
            </li>
          ))}
        </ul>
      }
    />
  );
};
