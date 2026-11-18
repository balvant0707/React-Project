// Ported 1:1 from COMPASS (app/src/components/subtaskQuickLinks.tsx).
import { Button, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { useTaskTypes } from "../pages/tasks/taskForm";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";

// Allowed subtask types (task_type_subtask_types, set in the task type editor): per task type the types that may be
// created below a task of that type. An empty list = the type takes no subtasks. One read of the small table, as a plain
// object (the query cache is persisted).
export function useSubtaskLinks() {
  return useQuery({
    queryKey: ["subtask-links"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("task_type_subtask_types").select("task_type_id, subtask_type_id").order("sort_order");
      if (error) throw error;
      const byType: Record<string, string[]> = {};
      for (const r of data ?? []) (byType[r.task_type_id as string] ??= []).push(r.subtask_type_id as string);
      return byType;
    },
  });
}

// The task types the user may start that a task of this type allows as subtasks, in the admin's order. `ready` is false
// until the lists are read; nothing is offered before that.
export function useAllowedSubtaskTypes(taskTypeId: string | null | undefined) {
  const { data: types } = useTaskTypes(true, true);
  const { data: links, isSuccess } = useSubtaskLinks();
  const ids = (taskTypeId && links?.[taskTypeId]) || [];
  return { ready: isSuccess && !!types, types: ids.flatMap((id) => types?.find((x) => x.id === id) ?? []) };
}

// For lists of tasks of different types (the subtask tree): may a task of this type take a subtask?
export function useCanAddSubtask() {
  const { data: types } = useTaskTypes(true, true);
  const { data: links } = useSubtaskLinks();
  return (taskTypeId: string | null | undefined) => !!taskTypeId && !!links?.[taskTypeId]?.some((id) => types?.some((x) => x.id === id));
}

// The type of a parent task (the form of a new subtask offers the types its type allows).
export function useParentTypeId(parentId: string | null | undefined) {
  const { data, isSuccess } = useQuery({
    queryKey: ["task-type-of", parentId],
    enabled: !!parentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: row, error } = await supabaseClient.from("tasks").select("task_type_id").eq("id", parentId!).single();
      if (error) throw error;
      return row.task_type_id as string;
    },
  });
  return { ready: !parentId || isSuccess, typeId: data ?? null };
}

// A few quick buttons for one-click subtasks: shown only when the type allows at most this many (more would crowd the
// page; the "Add subtask" button opens the tiles).
const MAX_QUICK_BUTTONS = 4;

export const SubtaskQuickLinks = ({ taskTypeId, onPick }: { taskTypeId: string; onPick: (subtaskTypeId: string) => void }) => {
  const { types: links } = useAllowedSubtaskTypes(taskTypeId);
  if (!links.length || links.length > MAX_QUICK_BUTTONS) return null;
  return (
    <Space wrap size={8} style={{ marginTop: 16 }}>
      {links.map((x) => (
        <Button key={x.id} size="small" icon={<PlusOutlined />} onClick={() => onPick(x.id)}>
          {localName(x)}
        </Button>
      ))}
    </Space>
  );
};
