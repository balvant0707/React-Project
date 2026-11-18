// Ported 1:1 from the NPM tool (app/src/pages/specifications/specificationRules.ts).
// What a specification is and what the signed-in user may do with it, derived from the loaded row (`can_edit`,
// `can_approve`, `is_latest_version` are computed columns of the database).
export type SpecificationRules = {
  hullEventTypeCode: string | null;
  // DD and NB get the area / coat breakdown (Technical Spec tab, derived Paint List); every other type (Seastock, a
  // future type) defaults to the flat paint list.
  usesAreaBreakdown: boolean;
  // Same rule as auto_create_order_for_seastock: no hull event, or an SS one.
  isSeastock: boolean;
  isLatestVersion: boolean;
  canEdit: boolean;
  // Approve / send back to draft, and editing while under review or approved (~/npm_tool/docs/permissions.md). Only on the
  // latest version: acting on an older one would leave two candidates for "the deal".
  canApprove: boolean;
  // Draft: anyone with edit rights. Under review / approved, and a Seastock offer sent to the customer: approvers only.
  // Accepted / lost: nobody (prevent_accepted_specification_changes enforces the same in the database).
  isEditable: boolean;
  // A Seastock offer that went to the customer: locked like an approved one (migration 20261105100000).
  isSentLocked: boolean;
};

export function specificationRules(spec: any, isNew: boolean, hullEventIdParam: string | null): SpecificationRules {
  const hullEventTypeCode: string | null = spec?.hull_events?.phrases?.code ?? null;
  const isLatestVersion = isNew || !!spec?.is_latest_version;
  const canEdit = isNew || !!spec?.can_edit;
  const canApprove = canEdit && !!spec?.can_approve && isLatestVersion;
  const status = spec?.status;
  const isSeastock = hullEventTypeCode === "SS" || (!spec?.hull_event_id && !hullEventIdParam);
  const isSentLocked = !isNew && isSeastock && status === "draft" && !!spec?.sent_at;
  const isEditable =
    isNew ||
    (isLatestVersion &&
      (status === "draft" ? (isSentLocked ? canApprove : canEdit) : (status === "under_review" || status === "approved") && canApprove));
  return {
    hullEventTypeCode,
    usesAreaBreakdown: hullEventTypeCode === "DD" || hullEventTypeCode === "NB",
    isSeastock,
    isSentLocked,
    isLatestVersion,
    canEdit,
    canApprove,
    isEditable,
  };
}
