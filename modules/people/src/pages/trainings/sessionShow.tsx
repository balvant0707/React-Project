// Ported 1:1 from COMPASS (app/src/pages/trainings/sessionShow.tsx).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, App as AntdApp, Button, Card, Checkbox, Descriptions, Empty, Space, Spin, Table, Tooltip, Typography } from "antd";
import { CheckOutlined, DeleteOutlined, EditOutlined, PrinterOutlined, UserAddOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { Page } from "@rbp/core";
import { PersonAvatar } from "@rbp/core";
import { RichTextView } from "@rbp/module-messaging/src/richText.tsx";
import { TrainingProofs } from "../../components/trainingProofs";
import { useUserMap } from "@rbp/core";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useTrainingSession, useTrainingSessionParticipants, useTrainingTypes } from "../../hooks/useTrainings";
import { errorText } from "@rbp/core";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import type { TrainingSessionParticipant } from "../../lib/trainings";
import { formatDate, formatDateTime } from "@rbp/ui";
import { TrainingSessionModal } from "./sessionForm";
import { PeoplePicker, SessionStatusTag } from "./sessionParts";

// Errors of training_session_confirm and the guard that mean something to the user.
const KNOWN = {
  training_session_in_future: "trainings.sessions.errors.inFuture",
  training_session_no_types: "trainings.sessions.errors.noTypes",
  training_session_no_participants: "trainings.sessions.errors.noParticipants",
  training_session_confirmed: "trainings.sessions.errors.confirmed",
  training_session_has_proofs: "trainings.sessions.errors.hasProofs",
};

// One training session (~/maintenance_tool/docs/people.md "Training sessions"): plan it, print the attendance sheet, untick who did not
// come, confirm. Confirming writes a record per person and training; afterwards only a forgotten person can be added.
export const TrainingSessionShow = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isLoading } = useTrainingSession(id);
  const { data: participants } = useTrainingSessionParticipants(id);
  const { data: types } = useTrainingTypes();
  const { data: people } = usePeople();
  const users = useUserMap();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin /></div>;
  if (!session) return <Empty description={t("common.notFound")} />;

  const planned = session.status === "planned";
  const canEdit = session.can_edit;
  // The database compares with its own current_date (UTC); the same day here, so the button and the server agree.
  const inFuture = session.held_on > new Date().toISOString().slice(0, 10);
  const sessionTypes = session.training_type_ids.map((tid) => (types ?? []).find((x) => x.id === tid)).filter((x) => !!x);
  const personOf = (uid: string) => (people ?? []).find((p) => p.id === uid);
  const rows = [...(participants ?? [])].sort((a, b) => personName(personOf(a.user_id)).localeCompare(personName(personOf(b.user_id))));
  const attended = rows.filter((r) => r.attended).length;

  const refresh = () => {
    for (const key of ["training-sessions", "training-session-participants", "training-records", "training-status", "training-proofs"]) void queryClient.invalidateQueries({ queryKey: [key] });
  };
  const run = async (work: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true);
    const { error } = await work();
    setBusy(false);
    if (error) message.error(errorText(error, { known: KNOWN }));
    refresh();
    return !error;
  };

  const addPeople = async () => {
    if (!adding.length) return;
    const ok = await run(() => supabaseClient.from("training_session_participants").insert(adding.map((user_id) => ({ session_id: session.id, user_id }))));
    if (ok) setAdding([]);
  };
  const confirmAdding = () =>
    planned
      ? void addPeople()
      : modal.confirm({ title: t("trainings.sessions.addAfterTitle"), content: t("trainings.sessions.addAfterHint", { count: adding.length * sessionTypes.length }), okText: t("trainings.sessions.addPeople"), onOk: addPeople });

  const confirm = () =>
    modal.confirm({
      title: t("trainings.sessions.confirmTitle"),
      content: t("trainings.sessions.confirmHint", { people: attended, types: sessionTypes.length, count: attended * sessionTypes.length }),
      okText: t("trainings.sessions.confirm"),
      onOk: async () => {
        const ok = await run(() => supabaseClient.rpc("training_session_confirm", { p_session_id: session.id }));
        if (ok) message.success(t("trainings.sessions.confirmed"));
      },
    });

  const remove = () =>
    modal.confirm({
      title: t("trainings.sessions.deleteTitle"),
      okType: "danger",
      okText: t("common.delete"),
      onOk: async () => {
        const ok = await run(() => supabaseClient.from("training_sessions").delete().eq("id", session.id));
        if (ok) navigate("/trainings?tab=sessions");
      },
    });

  return (
    <Page
      title={`${formatDate(session.held_on)} · ${session.type_names || t("trainings.sessions.title")}`}
      headerButtons={
        <Space wrap>
          <Link to={`/trainings/sessions/${session.id}/print`}><Button icon={<PrinterOutlined />}>{t("trainings.sessions.printSheet")}</Button></Link>
          {canEdit && planned && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
          {canEdit && planned && (
            <Tooltip title={session.proof_count > 0 ? t("trainings.sessions.errors.hasProofs") : undefined}>
              <Button danger icon={<DeleteOutlined />} onClick={remove} disabled={busy || session.proof_count > 0}>{t("common.delete")}</Button>
            </Tooltip>
          )}
          {canEdit && planned && (
            <Tooltip title={inFuture ? t("trainings.sessions.errors.inFuture") : undefined}>
              <Button type="primary" icon={<CheckOutlined />} onClick={confirm} disabled={busy || inFuture || !attended || !sessionTypes.length}>{t("trainings.sessions.confirm")}</Button>
            </Tooltip>
          )}
        </Space>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
        <Card size="small">
          <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
            <Descriptions.Item label={t("trainings.statusLabel")}><SessionStatusTag session={session} /></Descriptions.Item>
            <Descriptions.Item label={t("trainings.sessions.heldOn")}>{formatDate(session.held_on)}</Descriptions.Item>
            <Descriptions.Item label={t("trainings.trainer")}>{session.trainer ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={t("trainings.sessions.location")}>{session.location ?? "—"}</Descriptions.Item>
            <Descriptions.Item label={t("trainings.sessions.types")}>{session.type_names || "—"}</Descriptions.Item>
            {session.confirmed_at && (
              <Descriptions.Item label={t("trainings.sessions.confirmedBy")}>
                {`${users.get(session.confirmed_by_user_id ?? "")?.name ?? "—"}, ${formatDateTime(session.confirmed_at)}`}
              </Descriptions.Item>
            )}
            {session.note && <Descriptions.Item label={t("trainings.note")} span={3}>{session.note}</Descriptions.Item>}
          </Descriptions>
          {planned && <Alert type="info" showIcon style={{ marginTop: 8 }} message={t("trainings.sessions.plannedHint")} />}
        </Card>

        <Card size="small" title={t("trainings.sessions.participants", { attended, total: rows.length })}>
          <Table<TrainingSessionParticipant>
            size="small"
            rowKey="user_id"
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: t("trainings.sessions.noParticipants") }}
            columns={[
              {
                title: t("trainings.sessions.attended"),
                width: 110,
                render: (_, r) => (
                  <Checkbox
                    checked={r.attended}
                    disabled={!canEdit || !planned || busy}
                    onChange={(e) => void run(() => supabaseClient.from("training_session_participants").update({ attended: e.target.checked }).eq("session_id", r.session_id).eq("user_id", r.user_id))}
                  />
                ),
              },
              {
                title: t("people.directory"),
                render: (_, r) => {
                  const p = personOf(r.user_id);
                  return (
                    <Link to={`/people/${r.user_id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: r.attended ? 1 : 0.55 }}>
                      {p && <PersonAvatar person={p} size={24} />} {p ? personName(p) : "—"}
                    </Link>
                  );
                },
              },
              ...(canEdit && planned
                ? [{
                    title: "",
                    width: 48,
                    render: (_: unknown, r: TrainingSessionParticipant) => (
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        aria-label={t("trainings.sessions.removePerson")}
                        disabled={busy}
                        onClick={() => void run(() => supabaseClient.from("training_session_participants").delete().eq("session_id", r.session_id).eq("user_id", r.user_id))}
                      />
                    ),
                  }]
                : []),
            ]}
          />
          {canEdit && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
              <PeoplePicker value={adding} onChange={setAdding} exclude={rows.map((r) => r.user_id)} />
              <div>
                <Button icon={<UserAddOutlined />} disabled={!adding.length || busy} onClick={confirmAdding}>{t("trainings.sessions.addPeople")}</Button>
              </div>
            </div>
          )}
        </Card>

        <Card size="small" title={t("trainings.content")}>
          {sessionTypes.map((x) => (
            <div key={x.id} style={{ marginBottom: 12 }}>
              <Typography.Text strong>{x.name}</Typography.Text>
              {x.content ? <RichTextView value={x.content} /> : <div><Typography.Text type="secondary">{x.description ?? t("trainings.sessions.noContent")}</Typography.Text></div>}
            </div>
          ))}
          {session.extra_content && (
            <div>
              <Typography.Text strong>{t("trainings.sessions.extraContent")}</Typography.Text>
              <RichTextView value={session.extra_content} />
            </div>
          )}
        </Card>

        <Card size="small" title={t("trainings.proof")}>
          {session.requires_certificate && session.proof_count === 0 && !planned && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={t("trainings.certificateRequired")} />}
          <Typography.Paragraph type="secondary">{t("trainings.sessions.proofHint")}</Typography.Paragraph>
          <TrainingProofs sessionId={session.id} canAdd={canEdit} />
        </Card>
      </div>
      <TrainingSessionModal open={editing} onClose={() => setEditing(false)} session={session} />
    </Page>
  );
};
