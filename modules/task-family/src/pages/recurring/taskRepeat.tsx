// Ported 1:1 from COMPASS (app/src/pages/recurring/taskRepeat.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Button, Space, Tag, Tooltip, Typography } from "antd";
import { RetweetOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { RuleFormModal, type RuleRow, type RuleSourceTask } from "./ruleForm";
import { scheduleLabel } from "./schedule";
import { withKeys } from "../../components/checklist/itemsEditor";
import type { OwnList } from "../../components/checklist/ownChecklist";
import type { ItemDef } from "../../lib/checklists";
import { errorText } from "@rbp/core";

// "Repeat" on a task (Planner style): the series is a property of the task in the UI. When this task is
// done, the next one is created right away. Behind it sits a recurring_task_rules row (see data model doc).
export const TaskRepeat = ({ task, canManage, startOpen, onStartClose }: { task: RuleSourceTask & { recurring_task_rule_id: string | null }; finished: boolean; canManage: boolean; startOpen?: boolean; onStartClose?: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rule } = useQuery({
    queryKey: ["task-rule", task.recurring_task_rule_id],
    enabled: !!task.recurring_task_rule_id,
    queryFn: async () =>
      (await supabaseClient.from("recurring_task_rules").select("*").eq("id", task.recurring_task_rule_id!).maybeSingle()).data as RuleRow | null,
  });

  // A series started from a task keeps the task's official checklist and its own steps.
  const { data: ownList, isSuccess: ownListLoaded, isError: ownListFailed } = useQuery({
    queryKey: ["task-own-checklist", task.id],
    enabled: !task.recurring_task_rule_id,
    queryFn: async (): Promise<OwnList | null> => {
      const { data, error } = await supabaseClient.from("task_checklist_items").select("*").eq("task_id", task.id).eq("from_template", false).eq("from_step", false).neq("kind", "heading").order("sort_order");
      if (error) throw error;
      const items = (data as (ItemDef & { id?: string })[]).map(({ id: _id, ...def }) => def);
      return items.length ? { items: withKeys(items) } : null;
    },
  });

  // A new series copies the task's own steps: the form opens only once they are read, never without them.
  const awaitingOwnList = !task.recurring_task_rule_id && !ownListLoaded;
  useEffect(() => {
    if (!ownListFailed || !(open || startOpen)) return;
    message.error(t("recurring.ownStepsLoadFailed"));
    setOpen(false);
    onStartClose?.();
  }, [ownListFailed, open, startOpen, message, t, onStartClose]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task", task.id] }),
      queryClient.invalidateQueries({ queryKey: ["task-rule"] }),
      queryClient.invalidateQueries({ queryKey: ["feed", "tasks", task.id] }),
    ]);
  };

  const stop = async () => {
    if (!rule) return;
    const { error } = await supabaseClient.from("recurring_task_rules").update({ active: false }).eq("id", rule.id);
    if (error) message.error(errorText(error));
    else await refresh();
  };
  const resume = async () => {
    if (!rule) return;
    const { error } = await supabaseClient.from("recurring_task_rules").update({ active: true }).eq("id", rule.id);
    if (error) message.error(errorText(error));
    else await refresh();
  };

  // Starting a series is offered in the task menu (startOpen); the series line below only shows an existing series.
  if (!rule && !open && !startOpen) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {rule ? (
        <Space wrap size={8}>
          <Tooltip title={rule.active ? (rule.repeat_mode === "after_completion" ? t("recurring.nextWhenDone") : t("recurring.byCalendar")) : undefined}>
            <Tag icon={<RetweetOutlined />} color={rule.active ? "blue" : "default"}>
              {t("recurring.repeats", { schedule: scheduleLabel(t, rule) })}
            </Tag>
          </Tooltip>
          {!rule.active && <Typography.Text type="secondary">{t("recurring.stopped")}</Typography.Text>}
          {canManage && (
            <>
              <Button size="small" onClick={() => setOpen(true)}>{t("buttons.edit")}</Button>
              {rule.active ? <Button size="small" onClick={stop}>{t("recurring.stop")}</Button> : <Button size="small" onClick={resume}>{t("recurring.resume")}</Button>}
            </>
          )}
        </Space>
      ) : null}
      <RuleFormModal
        open={(open || !!startOpen) && !awaitingOwnList}
        rule={rule}
        task={rule ? null : { ...task, own_list: ownList ?? null }}
        simple={!rule || rule.repeat_mode === "after_completion"}
        onClose={() => {
          setOpen(false);
          onStartClose?.();
        }}
        onSaved={() => {
          setOpen(false);
          onStartClose?.();
          void refresh();
        }}
      />
    </div>
  );
};
