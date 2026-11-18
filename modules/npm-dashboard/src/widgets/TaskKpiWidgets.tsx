// The tasks row of the NPM dashboard (RADAR): COMPASS's personal task numbers (dashboard tiles "my open tasks", "overdue",
// "due soon") in NPM's own tile, CountKpiWidget. Hand-written: the NPM tool had no tasks. Each tile opens the tasks list
// with the chips that give the same rows (Assignee, Status, Due date).
import { ClockCircleOutlined, ExclamationCircleOutlined, CheckSquareOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { todayIso } from "@rbp/ui";
import dayjs from "dayjs";
import { FINAL_TASK_STATUSES, TASK_STATUSES } from "@rbp/module-tasks/src/lib/domain.ts";
import { CountKpiWidget } from "./CountKpiWidget";
import { buildFilterLink, type FilterSpec } from "./filterLink";

const OPEN = TASK_STATUSES.filter((s) => !FINAL_TASK_STATUSES.includes(s));
const DUE_SOON_DAYS = 7;
const inDays = (n: number) => dayjs(todayIso()).add(n, "day").format("YYYY-MM-DD");

// "id" only and a head count: the policy of tasks costs per row, the rows themselves are not needed.
const countMine = async (userId: string, due?: { from?: string; to?: string }) => {
  let q = supabaseClient.from("tasks_overview").select("id", { count: "exact", head: true }).eq("assigned_user_id", userId).in("status", OPEN);
  if (due?.from) q = q.gte("due_date", due.from);
  if (due?.to) q = q.lte("due_date", due.to);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
};

const link = (userId: string | undefined, due?: { from?: string; to?: string }) => {
  if (!userId) return null;
  const filters: FilterSpec[] = [
    { field: "status", operator: "in", value: OPEN },
    { field: "assigned_user_id", operator: "in", value: [userId] },
  ];
  if (due?.from) filters.push({ field: "due_date", operator: "gte", value: due.from });
  if (due?.to) filters.push({ field: "due_date", operator: "lte", value: due.to });
  return buildFilterLink("/tasks", filters);
};

// Due windows, computed at call time (today in the user's time zone).
const overdue = () => ({ to: inDays(-1) });
const dueSoon = () => ({ from: todayIso(), to: inDays(DUE_SOON_DAYS) });
const loadMine = (userId: string) => countMine(userId);
const loadOverdue = (userId: string) => countMine(userId, overdue());
const loadDueSoon = (userId: string) => countMine(userId, dueSoon());

export const MyTasksWidget = ({ userId }: { userId?: string }) => (
  <CountKpiWidget title="My tasks" caption="Open, assigned to me" icon={<CheckSquareOutlined />} accentColor="#1d39c4" loadCount={loadMine} detailsLink={link(userId)} />
);

export const MyOverdueTasksWidget = ({ userId }: { userId?: string }) => (
  <CountKpiWidget title="Overdue tasks" caption="Mine, due date passed" icon={<ExclamationCircleOutlined />} accentColor="#cf1322" loadCount={loadOverdue} detailsLink={link(userId, overdue())} />
);

export const MyTasksDueSoonWidget = ({ userId }: { userId?: string }) => (
  <CountKpiWidget title="Due soon" caption={`Mine, next ${DUE_SOON_DAYS} days`} icon={<ClockCircleOutlined />} accentColor="#d48806" loadCount={loadDueSoon} detailsLink={link(userId, dueSoon())} />
);
