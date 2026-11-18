// Ported 1:1 from COMPASS (app/src/modules/absences/leave.ts).
// Absences (~/maintenance_tool/docs/leave.md): rows of `leave_requests`, one per absence; the task behind it carries route and feed. The
// absence type (useAbsenceTypes) decides the route.
type LeaveStatus = "requested" | "approved" | "rejected" | "cancelled";

export type LeaveRequest = {
  id: string;
  task_id: string;
  user_id: string;
  absence_type_id: string;
  from_date: string;
  to_date: string;
  start_half: boolean;
  end_half: boolean;
  working_days: number;
  status: LeaveStatus;
  decided_by_user_id: string | null;
  decided_at: string | null;
  entered_by_user_id: string | null;
};

// Row of the view leave_year_overview: working days per person, year and absence type (no entitlement, that lives in
// time recording).
export type LeaveYear = {
  user_id: string;
  year: number;
  absence_type_id: string;
  counts_as_leave: boolean;
  approved_days: number;
  requested_days: number;
};

export const LEAVE_STATUS_COLOR: Record<LeaveStatus, string> = { requested: "gold", approved: "green", rejected: "red", cancelled: "default" };

// An application can be withdrawn while it waits, or when it is approved and has not ended yet.
export const canWithdraw = (r: LeaveRequest, today: string) =>
  r.status === "requested" || (r.status === "approved" && r.to_date >= today);

// Days are counted in half days: 2 -> "2", 2.5 -> "2.5".
export const formatDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// ---- Planner (~/maintenance_tool/docs/leave.md) ----

export type PlannerDay = { user_id: string; day: string; fraction: number; status: "requested" | "approved"; request_id: string };
export type TeamLoadDay = { day: string; away: number; team_size: number; allowed: number };
export type PlannerLoadDay = { day: string; team_id: string; team_name: string; away: number; team_size: number; allowed: number };
export type RuleViolationDay = { team_id: string; team_name: string; day: string; away: number; team_size: number; allowed: number };
// A team day that breaks the absence rule now (RPC leave_violations, computed live) and the people away on it.
export type LeaveViolation = {
  team_id: string;
  team_name: string;
  day: string;
  away: number;
  team_size: number;
  allowed: number;
  user_ids: string[];
};

export type ViolationPeriod = { team_id: string; team_name: string; from: string; to: string; days: number; maxAway: number; team_size: number; allowed: number; user_ids: string[] };

// Neighbouring violating days of a team (a weekend in between does not break a period) become one line.
export const groupViolations = (rows: LeaveViolation[]): ViolationPeriod[] => {
  const out: ViolationPeriod[] = [];
  for (const r of [...rows].sort((a, b) => a.team_name.localeCompare(b.team_name) || a.day.localeCompare(b.day))) {
    const last = out[out.length - 1];
    if (last && last.team_id === r.team_id && r.day <= addDays(last.to, 3)) {
      last.to = r.day;
      last.days += 1;
      last.maxAway = Math.max(last.maxAway, r.away);
      last.user_ids = [...new Set([...last.user_ids, ...r.user_ids])];
    } else {
      out.push({ team_id: r.team_id, team_name: r.team_name, from: r.day, to: r.day, days: 1, maxAway: r.away, team_size: r.team_size, allowed: r.allowed, user_ids: r.user_ids });
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
};
export type PlannerScope = "me" | "reports" | `team:${string}`;

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
// Monday of the week the day is in.
export const weekStart = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
};
export const isWeekend = (iso: string) => {
  const w = new Date(`${iso}T12:00:00`).getDay();
  return w === 0 || w === 6;
};

// Share of a team that is away on a day, as the colour scale of the load row: 0 free .. 1 at the limit .. >1 over it.
export const loadRatio = (away: number, allowed: number) => (allowed > 0 ? away / allowed : away > 0 ? 2 : 0);
