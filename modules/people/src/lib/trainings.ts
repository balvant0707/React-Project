// Ported 1:1 from COMPASS (app/src/lib/trainings.ts).
// Trainings (~/maintenance_tool/docs/people.md): rows of the catalogue table and of the views training_records_overview /
// training_status.
// reinstruction = still valid by date, but an operating instruction of the type changed or was added since
// (~/maintenance_tool/docs/operating-instructions.md "Link to trainings").
export type TrainingStatus = "valid" | "due_soon" | "reinstruction" | "expired" | "missing" | "exempt";

export type TrainingType = {
  id: string;
  name: string;
  category_phrase_id: string | null;
  description: string | null;
  // What the training covers (HTML), printed on the attendance sheet of a session.
  content: string | null;
  provider: string | null;
  responsible_kind: "supervisor" | "person" | "external" | null;
  responsible_user_id: string | null;
  responsible_external: string | null;
  validity_months: number | null;
  reminder_days_before: number;
  requires_certificate: boolean;
  retention_years_after_exit: number;
  active: boolean;
  sort_order: number;
};

export type TrainingRecordRow = {
  id: string;
  user_id: string;
  training_type_id: string;
  completed_on: string;
  valid_until: string | null;
  trainer: string | null;
  note: string | null;
  type_name: string;
  category_phrase_id: string | null;
  validity_months: number | null;
  requires_certificate: boolean;
  retention_years_after_exit: number;
  person_name: string | null;
  exit_date: string | null;
  retain_until: string | null;
  status: TrainingStatus;
  is_latest: boolean;
  // Proofs of the record and of its session.
  proof_count: number;
  session_id: string | null;
};

// One row per required or recorded person + training (view training_status). No record = "missing" when required.
export type TrainingStatusRow = {
  user_id: string;
  training_type_id: string;
  record_id: string | null;
  completed_on: string | null;
  valid_until: string | null;
  status: TrainingStatus;
  required: boolean;
  exempt: boolean;
  proof_count: number;
  requires_certificate: boolean;
};

export type TrainingRequirement = { id: string; training_type_id: string; team_id: string | null; role_id: string | null; position_id: string | null; user_id: string | null };
export type TrainingExemption = { user_id: string; training_type_id: string; reason: string };

export const STATUS_COLOR: Record<TrainingStatus, string> = { valid: "green", due_soon: "orange", reinstruction: "gold", expired: "red", missing: "volcano", exempt: "default" };
export const STATUS_ORDER: Record<TrainingStatus, number> = { expired: 0, missing: 1, reinstruction: 2, due_soon: 3, valid: 4, exempt: 5 };
export const needsAttention = (s: TrainingStatus) => s === "expired" || s === "missing" || s === "due_soon" || s === "reinstruction";

// A training session (view training_sessions_overview): planned for several types and people, confirmed once it took
// place, which writes the records.
export type TrainingSessionRow = {
  id: string;
  held_on: string;
  location: string | null;
  trainer: string | null;
  extra_content: string | null;
  note: string | null;
  status: "planned" | "confirmed";
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  created_by_user_id: string | null;
  training_type_ids: string[];
  type_names: string;
  participant_count: number;
  attended_count: number;
  proof_count: number;
  requires_certificate: boolean;
  can_edit: boolean;
};
export type TrainingSessionParticipant = { session_id: string; user_id: string; attended: boolean };
