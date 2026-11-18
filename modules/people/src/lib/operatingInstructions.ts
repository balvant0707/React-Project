// Ported 1:1 from COMPASS (app/src/lib/operatingInstructions.ts).
import type { SignGroup } from "./safetySigns";

// Operating instructions (~/maintenance_tool/docs/operating-instructions.md). German is the master language; the other languages are
// translations of the same version.

export type InstructionKind = "substance" | "machine";
export type VersionStatus = "draft" | "submitted" | "published" | "archived";
export type SignalWord = "danger" | "warning";

export const KINDS: InstructionKind[] = ["substance", "machine"];

// The fixed sections of a kind, in print order (titles: operatingInstructions.sections.<key>).
export const KIND_SECTIONS: Record<InstructionKind, string[]> = {
  substance: ["scope", "hazards", "protection", "emergency", "first_aid", "disposal"],
  machine: ["scope", "hazards", "protection", "faults", "first_aid", "maintenance"],
};

// The pictogram groups a section offers.
export const SECTION_SIGN_GROUPS: Record<string, SignGroup[]> = {
  scope: [],
  hazards: ["ghs", "warning"],
  protection: ["mandatory", "prohibition"],
  emergency: ["fire", "emergency", "prohibition"],
  faults: ["warning", "prohibition", "mandatory"],
  first_aid: ["emergency"],
  disposal: ["mandatory", "prohibition"],
  maintenance: ["mandatory", "warning", "prohibition"],
};

// Frame and section bars of the printout (orange for substances, blue for machines, as in TRGS 555 / DGUV practice).
export const KIND_COLOR: Record<InstructionKind, string> = { substance: "#e35205", machine: "#005387" };

export const VERSION_COLOR: Record<VersionStatus, string> = { draft: "default", submitted: "processing", published: "success", archived: "default" };

export const instructionNumber = (n: number | null | undefined) => (n == null ? "" : `BA-${String(n).padStart(4, "0")}`);

export type InstructionOverview = {
  id: string;
  number: number;
  legacy_number: string | null;
  kind: InstructionKind;
  owner_user_id: string | null;
  review_due_on: string | null;
  active: boolean;
  published_version_id: string | null;
  published_version_no: number | null;
  valid_from: string | null;
  signal_word: SignalWord | null;
  open_version_id: string | null;
  open_version_no: number | null;
  open_status: VersionStatus | null;
  title: string;
  title_en: string;
  work_area: string;
  subject: string;
  signs: Record<string, string[]>;
  languages: string[];
  asset_count: number;
  can_edit: boolean;
};

export type InstructionVersion = {
  id: string;
  instruction_id: string;
  version_no: number;
  status: VersionStatus;
  valid_from: string | null;
  signal_word: SignalWord | null;
  signs: Record<string, string[]>;
  change_note: string | null;
  requires_reinstruction: boolean;
  returned_note: string | null;
  submitted_by_user_id: string | null;
  submitted_at: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  created_by_user_id: string | null;
  updated_at: string;
};

export type InstructionText = {
  version_id: string;
  language: string;
  title: string;
  work_area: string;
  subject: string;
  sections: Record<string, string>;
  needs_check: boolean;
};

export type InstructionLogRow = {
  id: string;
  version_id: string | null;
  action: "submitted" | "returned" | "published" | "reviewed" | "translation" | "classified";
  language: string | null;
  note: string | null;
  happened_at: string;
  by_user_id: string | null;
};

// The text in the wanted language, else German (the master).
export const textFor = (texts: InstructionText[] | undefined, language: string) =>
  (texts ?? []).find((x) => x.language === language) ?? (texts ?? []).find((x) => x.language === "de");

export const reviewOverdue = (date: string | null | undefined) => !!date && date < new Date().toISOString().slice(0, 10);

// A language code in the UI language ("en" -> "English").
export const languageName = (code: string, uiLanguage: string) => {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
};
