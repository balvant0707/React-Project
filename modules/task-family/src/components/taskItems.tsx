import { useRecordSlot } from "@rbp/core";

// Stand-in for COMPASS components/taskItems.tsx (material lines of a task): the items module puts the real component into the
// slot 'task-family.taskItems'; without it the task page shows no material.
type Props = { task: { id: string; title: string; asset_id?: string | null; task_type_id: string }; finished: boolean; canWork: boolean; mode: string };
export const TaskItems = (props: Props) => {
  const Real = useRecordSlot("task-family.taskItems")[0]?.Component;
  return Real ? <Real {...props} /> : null;
};
