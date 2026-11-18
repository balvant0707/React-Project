// Ported 1:1 from COMPASS (app/src/components/taskRow.tsx).
import type { ReactNode } from "react";
import { Typography } from "antd";
import type { TaskOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { TaskTypeIcon } from "@rbp/module-task-family/src/components/masterLooks.tsx";
import { DueDate, PriorityBars, StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";

// One task in a short list (dashboard): type icon, title, number + asset + step under it, status and due date on the
// right. `extra` = an action at the end (e.g. "I take it").
export const TaskRow = ({ task, extra }: { task: Pick<TaskOverviewRow, "task_type_id" | "task_number" | "title" | "status" | "priority" | "due_date" | "asset_name"> & Partial<Pick<TaskOverviewRow, "current_step_name" | "current_step_name_de" | "team_name">>; extra?: ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minWidth: 0 }}>
    <TaskTypeIcon typeId={task.task_type_id} size={34} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <Typography.Text strong ellipsis style={{ display: "block" }}>{task.title}</Typography.Text>
      <Typography.Text type="secondary" ellipsis style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <PriorityBars priority={task.priority} size={12} />
        {[`#${task.task_number}`, task.asset_name, task.team_name, task.current_step_name ? pickName(task.current_step_name, task.current_step_name_de) : null].filter(Boolean).join(" · ")}
      </Typography.Text>
    </div>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <span style={{ display: "flex", gap: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <StatusTag status={task.status} />
        <DueDate date={task.due_date} />
      </span>
      {extra}
    </div>
  </div>
);
