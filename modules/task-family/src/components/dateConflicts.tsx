// Ported 1:1 from COMPASS (app/src/components/dateConflicts.tsx).
import { postRecordMessage } from "@rbp/module-messaging/src/lib/messaging.ts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, App as AntdApp, Button, Input, Modal, Space, Tooltip, Typography } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useGetIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import type { TaskTreeRow } from "../lib/domain";
import { conflictingChildren, conflictText } from "../lib/taskDates";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";

// Warning sign for a task that cannot finish before its parent is due (tree, Gantt).
export const DateConflictTag = ({ row }: { row: TaskTreeRow }) => {
  const { t } = useTranslation();
  if (!row.date_conflict) return null;
  return (
    <Tooltip title={conflictText(t, row)}>
      <WarningOutlined style={{ color: "#faad14", marginInlineStart: 6 }} />
    </Tooltip>
  );
};

type Fix = { kind: "parent"; to: string } | { kind: "children"; to: string; ids: string[] };

// Panel on a task page: the open subtasks that end after this task is due, and this task against its own parent, with
// the two ways out: move the due date of the parent task, or pull the subtasks in. Both ask for a reason (punctuality)
// that lands in the feed of every task that is changed.
export const DateConflictPanel = ({ rows, onChanged }: { rows: TaskTreeRow[]; onChanged?: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [fix, setFix] = useState<Fix | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const task = rows[0];
  if (!task) return null;

  const children = task.due_date ? conflictingChildren(rows, task.id) : [];
  const pullable = children.filter((c) => c.date_conflict === "later");
  const latest = children.reduce((m, c) => (c.expected_end && c.expected_end > m ? c.expected_end : m), "");
  const own = task.date_conflict;
  if (children.length === 0 && !own) return null;

  const setDue = async (id: string, from: string | null, to: string, why: string) => {
    // An update RLS does not allow touches no row and raises no error, so ask for the row back.
    const { data, error } = await supabaseClient.from("tasks").update({ due_date: to }).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) return false;
    if (identity?.id) {
      await postRecordMessage("tasks", id, t("punctuality.rescheduleComment", { from: formatDate(from), to: formatDate(to), reason: why }));
    }
    return true;
  };

  const confirm = async () => {
    if (!fix) return;
    const why = reason.trim();
    setBusy(true);
    try {
      const targets = fix.kind === "parent" ? [{ id: task.id, from: task.due_date }] : fix.ids.map((id) => ({ id, from: rows.find((r) => r.id === id)?.due_date ?? null }));
      let changed = 0;
      for (const x of targets) if (await setDue(x.id, x.from, fix.to, why)) changed += 1;
      if (changed < targets.length) message.warning(t("dateConflicts.partial", { changed, total: targets.length }));
      else message.success(t("dateConflicts.done", { count: changed }));
    } catch (error) {
      message.error(errorText(error));
    }
    setBusy(false);
    setFix(null);
    setReason("");
    await Promise.all(
      ["task-tree", "task", "task-original-due", "punctuality", "feed", "initiative-board"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
    onChanged?.();
  };

  return (
    <>
      {children.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={t("dateConflicts.parentTitle", { count: children.length, date: formatDate(latest), due: formatDate(task.due_date) })}
          description={
            <Space direction="vertical" size={4}>
              {children.map((c) => (
                <span key={c.id}>
                  <Link to={`/tasks/${c.id}`}>#{c.task_number} {c.title}</Link>
                  <Typography.Text type="secondary"> · {t(`dateConflicts.short.${c.date_conflict}`, { end: formatDate(c.expected_end) })}</Typography.Text>
                </span>
              ))}
              <Space wrap style={{ marginTop: 4 }}>
                {task.status !== "done" && task.status !== "cancelled" && (
                  <Button size="small" onClick={() => setFix({ kind: "parent", to: latest })}>
                    {t("dateConflicts.moveParent", { date: formatDate(latest) })}
                  </Button>
                )}
                {pullable.length > 0 && (
                  <Button size="small" onClick={() => setFix({ kind: "children", to: task.due_date!, ids: pullable.map((c) => c.id) })}>
                    {t("dateConflicts.pullIn", { count: pullable.length, date: formatDate(task.due_date) })}
                  </Button>
                )}
              </Space>
              {pullable.length < children.length && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("dateConflicts.overdueHint")}</Typography.Text>}
            </Space>
          }
        />
      )}
      {own && task.parent_due_date && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message={conflictText(t, task)}
          action={
            own === "later" ? (
              <Button size="small" onClick={() => setFix({ kind: "children", to: task.parent_due_date!, ids: [task.id] })}>
                {t("dateConflicts.pullSelf", { date: formatDate(task.parent_due_date) })}
              </Button>
            ) : undefined
          }
        />
      )}
      <Modal
        open={!!fix}
        title={t("punctuality.rescheduleTitle")}
        okText={t("common.save")}
        confirmLoading={busy}
        okButtonProps={{ disabled: !reason.trim() }}
        onOk={confirm}
        onCancel={() => setFix(null)}
      >
        <Typography.Paragraph type="secondary">{t("dateConflicts.reasonHint", { date: fix ? formatDate(fix.to) : "" })}</Typography.Paragraph>
        <Input.TextArea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("punctuality.rescheduleReason")} />
      </Modal>
    </>
  );
};
