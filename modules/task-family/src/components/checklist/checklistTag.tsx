// Ported 1:1 from COMPASS (app/src/components/checklist/checklistTag.tsx).
import { Tag } from "antd";
import { CheckSquareOutlined } from "@ant-design/icons";

// "3/8" of a task's checklist items answered; nothing when the task has no checklist.
export const ChecklistTag = ({ row }: { row: { checklist_items_total?: number; checklist_items_done?: number } }) => {
  const total = row.checklist_items_total ?? 0;
  if (total === 0) return null;
  const done = row.checklist_items_done ?? 0;
  return (
    <Tag icon={<CheckSquareOutlined />} color={done === total ? "green" : "default"} style={{ marginInlineEnd: 0 }}>
      {done}/{total}
    </Tag>
  );
};
