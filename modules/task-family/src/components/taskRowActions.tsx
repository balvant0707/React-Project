// Ported 1:1 from COMPASS (app/src/components/taskRowActions.tsx).
import { useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { App as AntdApp, Button, Dropdown } from "antd";
import { CalendarOutlined, MoreOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invalidateAfterReschedule, moveDueDate } from "../lib/reschedule";
import type { TaskRights } from "@rbp/module-tasks/src/hooks/useTaskRights.ts";
import { errorText } from "@rbp/core";
import type { TaskOverviewRow } from "../lib/domain";
import { RescheduleModal } from "./rescheduleModal";
import { TaskForwardModal } from "@rbp/module-tasks/src/components/taskForwardModal.tsx";

type Row = Pick<TaskOverviewRow, "id" | "status" | "due_date" | "created_by_user_id" | "current_assignee_role_id" | "current_assignee_user_id" | "current_assignee_team_id">;

const isOpen = (row: Row) => row.status !== "done" && row.status !== "cancelled";

// Quick actions on a row of the task list: "Move to tomorrow" for a task due today (or overdue; the new date asks for a
// reason like everywhere, it lands in the feed) and "Forward / assign". Who may comes from task_rights for the rows on
// the page (`rights`, see useTaskRightsFor): moving the date is an edit, forwarding follows task_forward. Used by the
// phone cards and the desktop table, which share the two dialogs (`dialogs` goes once at the end of the page).
export const useTaskRowActions = (onChanged: () => void, rights: Record<string, TaskRights> | undefined) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [moving, setMoving] = useState<Row | null>(null);
  const [forwarding, setForwarding] = useState<Row | null>(null);

  const today = dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
  // The forward dialog hands on the step when one names somebody, else the task itself (as task_forward does).
  const routed = (row: Row) => !!(row.current_assignee_user_id || row.current_assignee_team_id || row.current_assignee_role_id);
  const mayForward = (row: Row) => !!rights?.[row.id]?.forward;
  const canPostpone = (row: Row) => isOpen(row) && !!rights?.[row.id]?.edit && !!row.due_date && row.due_date <= today;

  const postpone = async (row: Row, reason: string) => {
    const error = await moveDueDate(row.id, row.due_date, tomorrow, reason, (v) => t("punctuality.rescheduleComment", v));
    if (error) return message.error(error.message === "not allowed" ? t("tasks.rowActions.notAllowed") : errorText(error));
    message.success(t("tasks.rowActions.moved"));
    void invalidateAfterReschedule(queryClient, row.id);
    onChanged();
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["task"] });
    onChanged();
  };

  const tomorrowButton = (row: Row) =>
    canPostpone(row) ? (
      <Button
        size="small"
        icon={<CalendarOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          setMoving(row);
        }}
      >
        {t("tasks.rowActions.tomorrow")}
      </Button>
    ) : null;

  // The "..." menu: forward / assign (and moving, for those who find it there).
  const menu = (row: Row): ReactNode => {
    if (!mayForward(row) && !canPostpone(row)) return null;
    return (
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            ...(canPostpone(row) ? [{ key: "tomorrow", icon: <CalendarOutlined />, label: t("tasks.rowActions.tomorrowLong"), onClick: () => setMoving(row) }] : []),
            ...(mayForward(row) ? [{ key: "forward", icon: <UserSwitchOutlined />, label: t("tasks.rowActions.forward"), onClick: () => setForwarding(row) }] : []),
          ],
        }}
      >
        <Button type="text" aria-label={t("tasks.rowActions.menu")} icon={<MoreOutlined />} style={{ width: 40, height: 40 }} onClick={(e) => e.stopPropagation()} />
      </Dropdown>
    );
  };

  // Phone: the actions a card uncovers when swiped to the left (null = nothing to offer, the card does not move).
  const swipeActions = (row: Row): ReactNode => {
    if (!mayForward(row) && !canPostpone(row)) return null;
    return (
      <>
        {canPostpone(row) && (
          <Button type="primary" icon={<CalendarOutlined />} onClick={() => setMoving(row)}>
            {t("tasks.rowActions.tomorrow")}
          </Button>
        )}
        {mayForward(row) && (
          <Button icon={<UserSwitchOutlined />} onClick={() => setForwarding(row)}>
            {t("tasks.rowActions.forwardShort")}
          </Button>
        )}
      </>
    );
  };

  const dialogs = (
    <>
      {moving && (
        <RescheduleModal
          from={moving.due_date}
          to={tomorrow}
          original={null}
          onCancel={() => setMoving(null)}
          onConfirm={(reason) => {
            const row = moving;
            setMoving(null);
            void postpone(row, reason);
          }}
        />
      )}
      <TaskForwardModal
        open={!!forwarding}
        task={{ id: forwarding?.id ?? "", created_by_user_id: forwarding?.created_by_user_id ?? null }}
        mode={forwarding && routed(forwarding) ? "step" : "assignee"}
        approval={false}
        onClose={() => setForwarding(null)}
        onDone={() => {
          setForwarding(null);
          refresh();
        }}
      />
    </>
  );

  return { tomorrowButton, menu, swipeActions, dialogs };
};
