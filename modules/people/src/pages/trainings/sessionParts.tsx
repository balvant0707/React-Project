// Ported 1:1 from COMPASS (app/src/pages/trainings/sessionParts.tsx).
import { Select, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { useTeamMembers, usersFor } from "@rbp/core";
import { TeamSearchSelect } from "@rbp/module-task-family/src/components/teamSearchSelect.tsx";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useTrainingAccess } from "../../hooks/useTrainings";
import { hasLeft, personName } from "@rbp/module-messaging/src/lib/people.ts";
import type { TrainingSessionRow } from "../../lib/trainings";

// People whose trainings I may record (the database checks every one), plus "add a whole team". `exclude` leaves out
// the people already on a session. Locked people are left out (usersFor), like in every person picker.
export const PeoplePicker = ({ value, onChange, exclude }: { value?: string[]; onChange?: (ids: string[]) => void; exclude?: string[] }) => {
  const { t } = useTranslation();
  const { data: people } = usePeople();
  const { data: members } = useTeamMembers();
  const access = useTrainingAccess();
  const skip = new Set(exclude ?? []);
  const choosable = usersFor(people, value).filter((p) => !hasLeft(p) && access.canEdit(p.id) && !skip.has(p.id));
  return (
    <>
      <Select
        mode="multiple"
        showSearch
        optionFilterProp="label"
        placeholder={t("trainings.selectPeople")}
        value={value ?? []}
        onChange={(ids) => onChange?.(ids)}
        options={choosable.map((p) => ({ value: p.id, label: personName(p) }))}
      />
      <TeamSearchSelect
        use="filters"
        allowClear
        placeholder={t("trainings.addTeam")}
        style={{ width: "100%", marginTop: 8 }}
        value={undefined}
        onChange={(groupId) => {
          if (!groupId) return;
          const ids = new Set(choosable.map((p) => p.id));
          const add = (members ?? []).filter((m) => m.team_id === groupId && ids.has(m.user_id)).map((m) => m.user_id);
          onChange?.([...new Set([...(value ?? []), ...add])]);
        }}
      />
    </>
  );
};

export const SessionStatusTag = ({ session }: { session: Pick<TrainingSessionRow, "status"> }) => {
  const { t } = useTranslation();
  return <Tag color={session.status === "confirmed" ? "green" : "blue"} style={{ margin: 0 }}>{t(`trainings.sessions.status.${session.status}`)}</Tag>;
};
