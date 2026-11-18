// Ported 1:1 from COMPASS (app/src/lib/positions.ts).
import dayjs from "dayjs";

// Job descriptions (~/maintenance_tool/docs/job-descriptions.md): positions, versions and the assignment log.
// kind: a job in the organisation, or an appointment (first aider, fire warden, ...) held directly, never through a team.
export type PositionKind = "job" | "appointment";
export type PositionRow = { id: string; name: string; code: string | null; site: string | null; active: boolean; kind: PositionKind };

type VersionStatus = "draft" | "submitted" | "published" | "archived";

export type JobDescriptionVersion = {
  id: string;
  position_id: string;
  version_no: number;
  status: VersionStatus;
  valid_from: string | null;
  purpose: string;
  duties: string;
  authority: string;
  working_conditions: string;
  change_note: string | null;
  returned_note: string | null;
  submitted_by_user_id: string | null;
  submitted_at: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

// The rich-text sections of a version, in the order they are shown.
// The requirements are a list (own table) and sit between authority and working conditions: see REQUIREMENTS_AFTER.
export const SECTIONS = ["purpose", "duties", "authority", "working_conditions"] as const;
type Section = (typeof SECTIONS)[number];
export const REQUIREMENTS_AFTER: Section = "authority";

export const VERSION_COLOR: Record<VersionStatus, string> = { draft: "default", submitted: "gold", published: "green", archived: "default" };

// View position_holders_effective (today only): a holder is direct (with the period of position_holders) or comes
// through a team.
export type HolderRow = {
  position_id: string;
  user_id: string;
  source: "direct" | "team";
  team_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  holder_id: string | null;
};

// A row of position_holders: one period in which a person holds a position directly (dates inclusive, valid_to null =
// open-ended). Ending sets valid_to; the row stays as history.
export type HolderPeriod = {
  id: string;
  position_id: string;
  user_id: string;
  valid_from: string;
  valid_to: string | null;
  appointed_by_user_id: string | null;
};

export type PeriodState = "current" | "planned" | "ended";

export function periodState(p: Pick<HolderPeriod, "valid_from" | "valid_to">, today = dayjs().format("YYYY-MM-DD")): PeriodState {
  if (p.valid_from > today) return "planned";
  if (p.valid_to && p.valid_to < today) return "ended";
  return "current";
}

export type AppointmentLetter = { id: string; entity_id: string; storage_path: string; file_name: string; mime_type: string | null };

export const PERIOD_COLOR: Record<PeriodState, string> = { current: "green", planned: "blue", ended: "default" };

export type AssignmentLogRow = {
  id: string;
  position_id: string;
  user_id: string;
  action: "added" | "removed" | "changed";
  source: "direct" | "team";
  team_name: string | null;
  // when it was entered in the app; for a direct entry valid_from / valid_to is when it applies
  happened_at: string;
  by_user_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
};

export const LOG_ACTION_COLOR: Record<AssignmentLogRow["action"], string> = { added: "green", removed: "default", changed: "blue" };

// Requirements as a list (self-learning phrases) and suitability reviews (~/maintenance_tool/docs/job-descriptions.md).
export type RequirementItem = { id: string; phrase_id: string; sort_order: number; text: string };

export type FitRating = "fulfilled" | "deviation";
export type FitStatusKey = "never" | "overdue" | "due_soon" | "ok";

type FitReviewedPosition = { position_id: string; name: string; version_id: string; version_no: number };

export type FitReviewItem = { id: string; review_id: string; phrase_id: string; rating: FitRating; comment: string | null; text: string };

export type FitReview = {
  id: string;
  user_id: string;
  reviewed_on: string;
  next_review_on: string;
  result: FitRating;
  note: string | null;
  measure: string | null;
  measure_due_on: string | null;
  measure_status: "open" | "done" | null;
  positions: FitReviewedPosition[];
  created_by_user_id: string | null;
  items: FitReviewItem[];
};

// What the review page shows (RPC position_fit_context).
export type FitContext = {
  positions: FitReviewedPosition[];
  requirements: { phrase_id: string; text: string; position_ids: string[] }[];
  without_description: string[];
};

export type FitStatusRow = {
  user_id: string;
  review_id: string | null;
  reviewed_on: string | null;
  next_review_on: string | null;
  result: FitRating | null;
  measure_status: "open" | "done" | null;
  deviation_open: boolean;
  position_count: number;
  status: FitStatusKey;
};

export const FIT_STATUS_COLOR: Record<FitStatusKey, string> = { never: "default", overdue: "red", due_soon: "orange", ok: "green" };
export const FIT_STATUS_ORDER: Record<FitStatusKey, number> = { overdue: 0, never: 1, due_soon: 2, ok: 3 };
