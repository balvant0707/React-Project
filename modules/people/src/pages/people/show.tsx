// Ported 1:1 from COMPASS (app/src/pages/people/show.tsx).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { App as AntdApp, Button, Card, Descriptions, Empty, Popconfirm, Space, Spin, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, MessageOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@rbp/core";
import { useTranslation } from "react-i18next";
import { Page } from "@rbp/core";
import { LoginAccess, LoginStateTags } from "@rbp/core";
import { PersonAvatar } from "@rbp/core";
import { PersonFitReviews } from "../../components/personFitReviews";
import { PersonPositions } from "../../components/personPositions";
import { PersonTrainings } from "../../components/personTrainings";
import { PersonInstructions } from "../operatingInstructions/parts";
import { useTrainingAccess } from "../../hooks/useTrainings";
import { useAdminDelegation } from "@rbp/core";
import { useTeamMembers, useTeams } from "@rbp/core";
import { useCanEditPeople, usePeople, usePersonPrivate } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { supabaseClient } from "@rbp/core";
import { formatBirthday, personName, telHref, yearsSince, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";
import { formatDate } from "@rbp/ui";
import { PersonFormModal, PersonPhotoUpload, usePeopleRefresh } from "./personForm";
import { errorText } from "@rbp/core";
import { openDirectConversation } from "@rbp/module-messaging/src/lib/messaging.ts";
import { usePageTitle } from "@rbp/core";

const PersonLink = ({ person }: { person?: PersonRow | null }) =>
  person ? (
    <Link to={`/people/${person.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <PersonAvatar person={person} size={22} /> {personName(person)}
    </Link>
  ) : (
    <>—</>
  );

export const PersonShow = () => {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { data: people, isLoading } = usePeople();
  const { data: groups } = useTeams();
  const { data: members } = useTeamMembers();
  const canEdit = useCanEditPeople();
  const trainingAccess = useTrainingAccess();
  // The sign-in card ("Give login", activation sheet, lock, revoke): admins and user managers (users.manage).
  const { canManageUsers } = useAdminDelegation();
  const refresh = usePeopleRefresh();
  const [editing, setEditing] = useState(false);
  const person = (people ?? []).find((p) => p.id === id);
  const { data: privateData } = usePersonPrivate(id, canEdit);
  const birthDate = privateData?.birth_date;

  usePageTitle(person ? personName(person) : undefined);
  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!person) return <Empty description={t("common.notFound")} />;

  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const teams = (members ?? []).filter((m) => m.user_id === person.id).map((m) => (groups ?? []).find((g) => g.id === m.team_id)).filter((g) => !!g);
  const reports = (people ?? []).filter((p) => p.supervisor_user_id === person.id);

  // Writing to somebody who can sign in (the database refuses the rest).
  const canMessage = person.has_login && !person.has_left && !person.locked_at && person.id !== identity?.id;
  const writeTo = async () => {
    try {
      navigate(`/messages?c=${await openDirectConversation(person.id)}`);
    } catch (error) {
      message.error(errorText(error));
    }
  };
  const remove = async () => {
    const { error } = await supabaseClient.from("users").delete().eq("id", person.id);
    if (error) {
      message.error(errorText(error));
      return;
    }
    refresh();
    navigate("/people");
  };

  return (
    <Page
      title={false}
      headerButtons={
        <>
          {canMessage && <Button icon={<MessageOutlined />} onClick={() => void writeTo()}>{t("messages.writeTo")}</Button>}
          {canEdit && <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
          {canEdit && !person.has_login && (
            <Popconfirm title={t("people.deleteConfirm")} onConfirm={remove} okText={t("common.yes")} cancelText={t("common.no")}>
              <Button danger icon={<DeleteOutlined />}>{t("common.delete")}</Button>
            </Popconfirm>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 16 }}>
        <PersonAvatar person={person} size={96} />
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>{personName(person)}</Typography.Title>
          {person.position && <Typography.Text type="secondary">{person.position}</Typography.Text>}
          <div style={{ marginTop: 6 }}>
            <Space size={4} wrap>
              {teams.map((g) => <Tag key={g!.id}>{g!.name}</Tag>)}
              {(!person.has_login || (canManageUsers && person.locked_at)) && <LoginStateTags person={person} />}
            </Space>
          </div>
          {canEdit && <div style={{ marginTop: 8 }}><PersonPhotoUpload person={person} /></div>}
        </div>
      </div>

      <Card size="small" title={t("people.contact")} style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label={t("fields.email")}>{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : "—"}</Descriptions.Item>
          <Descriptions.Item label={t("people.site")}>{person.site ?? "—"}</Descriptions.Item>
          <Descriptions.Item label={t("people.phoneOffice")}>{person.phone_office ? <a href={telHref(person.phone_office)}>{person.phone_office}</a> : "—"}</Descriptions.Item>
          <Descriptions.Item label={t("people.phoneMobile")}>{person.phone_mobile ? <a href={telHref(person.phone_mobile)}>{person.phone_mobile}</a> : "—"}</Descriptions.Item>
          <Descriptions.Item label={t("people.hireDate")}>
            {person.hire_date ? `${formatDate(person.hire_date)} · ${t("people.years", { count: yearsSince(person.hire_date) })}` : "—"}
          </Descriptions.Item>
          {privateData?.exit_date && <Descriptions.Item label={t("people.exitDate")}>{formatDate(privateData.exit_date)}</Descriptions.Item>}
          <Descriptions.Item label={t("people.birthday")}>
            {canEdit && birthDate
              ? `${formatBirthday(Number(birthDate.slice(5, 7)), Number(birthDate.slice(8, 10)), i18n.language)} (${birthDate.slice(0, 4)})`
              : person.birthday_month && person.birthday_day ? formatBirthday(person.birthday_month, person.birthday_day, i18n.language) : "—"}
            {canEdit && person.birthday_hidden && <Tag style={{ marginLeft: 8 }}>{t("people.birthdayHidden")}</Tag>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {canManageUsers && (
        <Card size="small" title={t("login.title")} style={{ marginBottom: 16 }}>
          <LoginAccess person={person} onChanged={refresh} />
        </Card>
      )}

      <Card size="small" title={t("people.reporting")} style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, md: 2 }} size="small">
          <Descriptions.Item label={t("people.supervisor")}><PersonLink person={byId.get(person.supervisor_user_id ?? "")} /></Descriptions.Item>
          <Descriptions.Item label={t("people.deputy")}><PersonLink person={byId.get(person.deputy_user_id ?? "")} /></Descriptions.Item>
        </Descriptions>
        {reports.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary">{t("people.directReports", { count: reports.length })}</Typography.Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
              {reports.map((r) => <PersonLink key={r.id} person={r} />)}
            </div>
          </div>
        )}
      </Card>

      <PersonPositions personId={person.id} />
      <PersonFitReviews personId={person.id} />

      {trainingAccess.canView(person.id) && (
        <Card size="small" title={t("trainings.title")} style={{ marginBottom: 16 }}>
          <PersonTrainings personId={person.id} />
        </Card>
      )}
      <PersonInstructions personId={person.id} />

      <PersonFormModal open={editing} person={person} onClose={() => setEditing(false)} />
    </Page>
  );
};
