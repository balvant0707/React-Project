// Ported 1:1 from COMPASS (app/src/pages/positions/show.tsx).
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { App as AntdApp, Alert, Button, DatePicker, Empty, List, Popconfirm, Select, Space, Spin, Table, Tabs, Tag, Typography } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Page } from "@rbp/core";
import { JobDescriptionDocument } from "../../components/jobDescription";
import { TrainingStatusTag } from "../../components/trainingStatusTag";
import { useTeams, useUserMap } from "@rbp/core";
import { useCanEditPeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { usePermissions } from "@rbp/core";
import { usePositionAccess, usePositionCleanup, usePositionHolders, usePositionHoldersAt, usePositionLog, usePositions, usePositionsRefresh, usePositionTeams, usePositionVersions } from "../../hooks/usePositions";
import { useTrainingRequirements, useTrainingStatus, useTrainingTypes } from "../../hooks/useTrainings";
import { InstructionsOfTrainings } from "../operatingInstructions/parts";
import { LOG_ACTION_COLOR, VERSION_COLOR, type JobDescriptionVersion, type PositionKind } from "../../lib/positions";
import { HolderPeriods, periodLabel } from "../../components/holderPeriods";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { PositionFormModal } from "./positionForm";
import { errorText } from "@rbp/core";


export const PositionShow = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [params, setParams] = useSearchParams();
  const { data: positions, isLoading } = usePositions();
  const { data: teams } = usePositionTeams();
  const { data: groups } = useTeams();
  const { data: versions } = usePositionVersions(id);
  const access = usePositionAccess();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const position = (positions ?? []).find((p) => p.id === id);

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!position || !id) return <Empty description={t("common.notFound")} />;

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const published = (versions ?? []).find((v) => v.status === "published");
  const open = (versions ?? []).find((v) => v.status === "draft" || v.status === "submitted");
  const canWrite = access.canWrite(id);

  const newDraft = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabaseClient.rpc("job_description_new_draft", { p_position: id });
      if (error) throw error;
      void navigate(`/positions/${id}/versions/${data as string}`);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const description = (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {published && <Tag color="green">{t("positions.versionNo", { no: published.version_no })}{published.valid_from ? ` · ${t("positions.validFrom")} ${formatDate(published.valid_from)}` : ""}</Tag>}
        {open && (
          <Link to={`/positions/${id}/versions/${open.id}`}>
            <Tag color={VERSION_COLOR[open.status]} style={{ cursor: "pointer" }}>{t(`positions.status.${open.status}`)} · {t("positions.versionNo", { no: open.version_no })}</Tag>
          </Link>
        )}
        {canWrite && !open && <Button icon={<EditOutlined />} loading={busy} onClick={newDraft}>{published ? t("positions.newVersion") : t("positions.writeFirst")}</Button>}
        {published && <Button icon={<PrinterOutlined />} onClick={() => navigate(`/positions/${id}/print`)}>{t("positions.printView")}</Button>}
      </div>
      {published ? <JobDescriptionDocument version={published} /> : <Empty description={t("positions.noPublished")} />}
    </>
  );

  return (
    <>
    <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate("/positions")} style={{ paddingLeft: 0, marginBottom: 4 }}>{t("positions.backToList")}</Button>
    <Page
      title={position.name}
      subtitle={[position.code, position.site].filter(Boolean).join(" · ") || undefined}
      headerButtons={access.canManage && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
    >
      <Space size={4} wrap style={{ marginBottom: 12 }}>
        {position.kind === "appointment" && <Tag color="gold">{t("positions.kind.appointment")}</Tag>}
        {(teams ?? []).filter((x) => x.position_id === id).map((x) => <Tag key={x.team_id}>{groupName.get(x.team_id) ?? x.team_id}</Tag>)}
        {!position.active && <Tag>{t("positions.inactive")}</Tag>}
      </Space>
      <Tabs
        activeKey={params.get("tab") ?? "description"}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        items={[
          { key: "description", label: t("positions.description"), children: description },
          { key: "versions", label: t("positions.versions"), children: <VersionsTab positionId={id} versions={versions ?? []} /> },
          { key: "holders", label: t("positions.holders"), children: <HoldersTab positionId={id} kind={position.kind} /> },
          { key: "trainings", label: t("trainings.title"), children: <TrainingsTab positionId={id} /> },
        ]}
      />
      <PositionFormModal open={editing} position={position} onClose={() => setEditing(false)} />
    </Page>
    </>
  );
};

const VersionsTab = ({ positionId, versions }: { positionId: string; versions: JobDescriptionVersion[] }) => {
  const { t } = useTranslation();
  const users = useUserMap();
  const { message } = AntdApp.useApp();
  // Removing an archived version erases history: HR (people.edit) only.
  const canErase = useCanEditPeople();
  const cleanup = usePositionCleanup();
  if (versions.length === 0) return <Empty description={t("positions.noVersions")} />;
  return (
    <Table
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={versions}
      columns={[
        { title: "#", dataIndex: "version_no", width: 60 },
        { title: t("fields.status"), render: (_: unknown, v: JobDescriptionVersion) => <Tag color={VERSION_COLOR[v.status]}>{t(`positions.status.${v.status}`)}</Tag> },
        { title: t("positions.validFrom"), dataIndex: "valid_from", render: (d: string | null) => (d ? formatDate(d) : "—") },
        { title: t("positions.approvedBy"), render: (_: unknown, v: JobDescriptionVersion) => (v.approved_by_user_id ? `${users.get(v.approved_by_user_id)?.name ?? "—"} · ${formatDate(v.approved_at)}` : "—") },
        { title: t("positions.changeNote"), dataIndex: "change_note", render: (n: string | null) => n ?? "—" },
        { title: "", render: (_: unknown, v: JobDescriptionVersion) => <Space><Link to={`/positions/${positionId}/versions/${v.id}`}>{t("common.open")}</Link><Link to={`/positions/${positionId}/print?version=${v.id}`}>{t("positions.printView")}</Link>
          {canErase && v.status === "archived" && (
            <Popconfirm title={t("positions.deleteVersion")} onConfirm={() => cleanup.deleteVersion(v.id).then(() => message.success(t("positions.versionDeleted"))).catch((e) => message.error(errorText(e)))} okText={t("common.yes")} cancelText={t("common.no")}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space> },
      ]}
    />
  );
};

const HoldersTab = ({ positionId, kind }: { positionId: string; kind: PositionKind }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const access = usePositionAccess();
  const { data: holders } = usePositionHolders();
  const users = useUserMap();
  const [asOf, setAsOf] = useState<string | null>(null);
  const { data: past } = usePositionHoldersAt(positionId, asOf);
  const { data: log } = usePositionLog({ positionId });
  const canErase = useCanEditPeople();
  const cleanup = usePositionCleanup();

  const mine = (holders ?? []).filter((h) => h.position_id === positionId);
  // One row per person: a holder can reach the position directly and through one or more teams.
  const holderRows = [...new Set(mine.map((h) => h.user_id))].map((userId) => ({
    userId,
    direct: mine.find((h) => h.user_id === userId && h.source === "direct"),
    team: mine.some((h) => h.user_id === userId && h.source === "team"),
  }));

  const link = (userId: string) => <Link to={`/people/${userId}`}>{users.get(userId)?.name ?? "—"}</Link>;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <Typography.Title level={5}>{t("positions.currentHolders")}</Typography.Title>
        <Typography.Paragraph type="secondary">{kind === "appointment" ? t("positions.holdersHintAppointment") : t("positions.holdersHint")}</Typography.Paragraph>
        {holderRows.length === 0 ? <Tag color="volcano">{t("positions.vacant")}</Tag> : (
          <List
            size="small"
            bordered
            dataSource={holderRows}
            renderItem={(h) => (
              <List.Item>
                <span>
                  {link(h.userId)}
                  {h.direct && <Tag style={{ marginLeft: 8 }}>{t("positions.viaDirect")}</Tag>}
                  {h.team && <Tag style={{ marginLeft: 8 }}>{t("positions.viaTeam")}</Tag>}
                </span>
                {h.direct?.valid_from && (
                  <Typography.Text type="secondary">
                    {t("positions.periods.since", { date: formatDate(h.direct.valid_from) })}
                    {h.direct.valid_to ? ` · ${t("positions.periods.until", { date: formatDate(h.direct.valid_to) })}` : ""}
                  </Typography.Text>
                )}
              </List.Item>
            )}
          />
        )}
      </div>

      <div>
        <Typography.Title level={5}>{kind === "appointment" ? t("positions.periods.titleAppointment") : t("positions.periods.title")}</Typography.Title>
        <HolderPeriods positionId={positionId} kind={kind} />
      </div>

      <div>
        <Typography.Title level={5}>{t("positions.history")}</Typography.Title>
        <Space wrap style={{ marginBottom: 8 }}>
          <span>{t("positions.holdersOn")}</span>
          <DatePicker allowClear value={asOf ? dayjs(asOf) : null} disabledDate={(d) => d.isAfter(dayjs())} onChange={(d) => setAsOf(d ? d.format("YYYY-MM-DD") : null)} />
        </Space>
        {asOf && (past && past.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            {[...new Set(past.map((p) => p.user_id))].map((uid) => <Tag key={uid}>{users.get(uid)?.name ?? "—"}</Tag>)}
          </div>
        ) : <Typography.Paragraph type="secondary">{t("positions.nobodyThen")}</Typography.Paragraph>)}
        {(log ?? []).length > 0 && (
          <Table
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            dataSource={log}
            columns={[
              { title: t("positions.enteredOn"), dataIndex: "happened_at", render: (d: string) => formatDate(d), width: 120 },
              { title: t("positions.person"), render: (_: unknown, r) => link(r.user_id) },
              { title: t("positions.change"), render: (_: unknown, r) => <Tag color={LOG_ACTION_COLOR[r.action]}>{t(`positions.action.${r.action}`)}</Tag> },
              { title: t("positions.periods.period"), render: (_: unknown, r) => periodLabel(t, r.valid_from, r.valid_to) || "—" },
              { title: t("positions.via"), render: (_: unknown, r) => (r.source === "direct" ? t("positions.viaDirect") : `${t("positions.viaTeam")}${r.team_name ? `: ${r.team_name}` : ""}`) },
              { title: t("positions.by"), render: (_: unknown, r) => (r.by_user_id ? users.get(r.by_user_id)?.name ?? "—" : "—") },
              ...(canErase ? [{
                title: "",
                render: (_: unknown, r: { id: string }) => (
                  <Popconfirm title={t("positions.deleteLogEntry")} onConfirm={() => cleanup.deleteLogEntry(r.id).then(() => message.success(t("positions.entryDeleted"))).catch((e) => message.error(errorText(e)))} okText={t("common.yes")} cancelText={t("common.no")}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ),
              }] : []),
            ]}
          />
        )}
        {!access.canSeeLog && <Alert type="info" showIcon message={t("positions.logOwnOnly")} style={{ marginTop: 8 }} />}
      </div>
    </div>
  );
};

// Trainings the position requires (edited by whoever maintains the catalogue) and the status of its holders.
const TrainingsTab = ({ positionId }: { positionId: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { has } = usePermissions();
  const refresh = usePositionsRefresh();
  const { data: requirements } = useTrainingRequirements();
  const { data: types } = useTrainingTypes();
  const { data: status } = useTrainingStatus();
  const { data: holders } = usePositionHolders();
  const users = useUserMap();
  const [pick, setPick] = useState<string | undefined>();
  const canEdit = has("training_types.edit");

  const required = (requirements ?? []).filter((r) => r.position_id === positionId);
  const requiredTypes = required.map((r) => ({ req: r, type: (types ?? []).find((x) => x.id === r.training_type_id) })).filter((x) => !!x.type);
  const holderIds = [...new Set((holders ?? []).filter((h) => h.position_id === positionId).map((h) => h.user_id))];
  const cell = new Map((status ?? []).map((s) => [`${s.user_id}:${s.training_type_id}`, s]));
  const options = (types ?? []).filter((x) => x.active && !required.some((r) => r.training_type_id === x.id));

  const add = async () => {
    if (!pick) return;
    const { error } = await supabaseClient.from("training_requirements").insert({ training_type_id: pick, position_id: positionId });
    if (error) return void message.error(errorText(error));
    setPick(undefined);
    refresh();
  };
  const remove = async (reqId: string) => {
    const { error } = await supabaseClient.from("training_requirements").delete().eq("id", reqId);
    if (error) return void message.error(errorText(error));
    refresh();
  };

  return (
    <div>
      <Typography.Paragraph type="secondary">{t("positions.trainingsHint")}</Typography.Paragraph>
      {canEdit && (
        <Space style={{ marginBottom: 12 }}>
          <Select showSearch allowClear optionFilterProp="label" placeholder={t("positions.addTraining")} value={pick} onChange={setPick} style={{ minWidth: 280 }} options={options.map((x) => ({ value: x.id, label: x.name }))} />
          <Button icon={<PlusOutlined />} disabled={!pick} onClick={add}>{t("common.add")}</Button>
        </Space>
      )}
      {requiredTypes.length === 0 ? <Empty description={t("positions.noRequiredTrainings")} /> : (
        <>
          <div style={{ marginBottom: 12 }}>
            {requiredTypes.map(({ req, type }) => (
              <Tag key={req.id} closable={canEdit} onClose={(e) => { e.preventDefault(); void remove(req.id); }}>{type!.name}</Tag>
            ))}
          </div>
          <InstructionsOfTrainings trainingTypeIds={requiredTypes.map(({ type }) => type!.id)} />
          {holderIds.length > 0 && (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: true }}
              dataSource={holderIds.map((uid) => ({ id: uid }))}
              columns={[
                { title: t("positions.person"), render: (_: unknown, r: { id: string }) => <Link to={`/people/${r.id}`}>{users.get(r.id)?.name ?? "—"}</Link>, fixed: "left" },
                ...requiredTypes.map(({ req, type }) => ({
                  key: req.id,
                  title: type!.name,
                  render: (_: unknown, r: { id: string }) => {
                    const c = cell.get(`${r.id}:${type!.id}`);
                    return c ? <TrainingStatusTag status={c.status} /> : "—";
                  },
                })),
              ]}
            />
          )}
        </>
      )}
    </div>
  );
};
