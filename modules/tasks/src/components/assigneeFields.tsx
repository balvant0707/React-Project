// After COMPASS app/src/components/assigneeFields.tsx. Changes: the team picker is a plain select over the platform teams
// (COMPASS: TeamSearchSelect filtered by the team use "tasks", not in RADAR yet); directory hooks from @rbp/core.
import { Select } from "antd";
import { useTranslation } from "react-i18next";
import { useTeamMembers, useTeams, useUsers, userLabel, usersFor } from "@rbp/core";

// Team + person pickers. With a team chosen only its members are offered (a task may belong to a team, a person, or
// both; the database requires the person to be a member of the team).
export const TeamSelect = (props: { value?: string | null; onChange?: (v: string | null) => void; disabled?: boolean; style?: React.CSSProperties }) => {
  const { t } = useTranslation();
  const { data: teams } = useTeams();
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder={t("tasks.fields.team")}
      style={props.style ?? { width: "100%" }}
      disabled={props.disabled}
      value={props.value ?? undefined}
      onChange={(v) => props.onChange?.(v ?? null)}
      options={(teams ?? []).map((g) => ({ value: g.id, label: g.name }))}
    />
  );
};

// Picks the owner of a task type (any user). Copied from COMPASS.
export const OwnerSelect = (props: { value?: string | null; onChange?: (v: string | null) => void; disabled?: boolean }) => {
  const { t } = useTranslation();
  const { data: users } = useUsers();
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder={t("tasks.fields.owner")}
      style={{ width: "100%" }}
      disabled={props.disabled}
      value={props.value ?? undefined}
      onChange={(v) => props.onChange?.(v ?? null)}
      options={usersFor(users, props.value).map((u) => ({ value: u.id, label: userLabel(u) }))}
    />
  );
};

export const AssigneeSelect = (props: {
  teamId?: string | null;
  value?: string | null;
  onChange?: (v: string | null) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) => {
  const { t } = useTranslation();
  const { data: users } = useUsers();
  const { data: members } = useTeamMembers();
  const memberIds = props.teamId ? new Set((members ?? []).filter((m) => m.team_id === props.teamId).map((m) => m.user_id)) : null;
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder={t("tasks.fields.assignee")}
      style={props.style ?? { width: "100%" }}
      disabled={props.disabled}
      value={props.value ?? undefined}
      onChange={(v) => props.onChange?.(v ?? null)}
      options={usersFor(users, props.value).filter((u) => !memberIds || memberIds.has(u.id)).map((u) => ({ value: u.id, label: userLabel(u) }))}
    />
  );
};
