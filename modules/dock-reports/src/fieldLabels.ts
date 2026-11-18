// Frontend display labels of this module's record types (from NPM's app/src/fieldLabels.ts, until 2026-11-13 one file in npm-base).
// defineFieldLabels also names the fields in the notes panel's history lines.
import { defineFieldLabels } from '@rbp/module-messaging/src/feed/eventText.ts';

// Convention: <resource>.<field>. A composite column label that mixes several fields stays a literal at the call site.
export const { FIELD_LABELS, fieldLabel } = defineFieldLabels({
  dock_reports: {
    report_number: "Report Number",
    status: "Status",
    hull_event_id: "Hull Event",
    specification_id: "Specification",
    vessel_id: "Vessel",
    sales_account_user_id: "Sales Rep",
    technical_service_rep_user_id: "Technical Service Rep",
    assigned_team_id: "Team",
    indocking_date: "Indocking Date",
    outdocking_date: "Outdocking Date",
    time_zone: "Time Zone (yard)",
    remarks_text: "Remarks",
    antifouling_line_fwd_m: "AF Line Fwd (m)",
    antifouling_line_aft_m: "AF Line Aft (m)",
    boottop_line_fwd_m: "Boottop Line Fwd (m)",
    boottop_line_aft_m: "Boottop Line Aft (m)",
    cathodic_protection_type_phrase_id: "Cathodic Protection Type",
    cathodic_protection_anode_count: "Anode Count",
    locked_by_user_id: "Locked By",
    locked_at: "Locked At",
    submitted_at: "Submitted At",
    submitted_by_user_id: "Submitted By",
  },
});
