// Ported 1:1 from COMPASS (app/src/pages/trainings/index.tsx).
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Drawer, Input, Select, Switch, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Page } from "@rbp/core";
import { PersonAvatar } from "@rbp/core";
import { PersonTrainings } from "../../components/personTrainings";
import { TrainingStatusTag } from "../../components/trainingStatusTag";
import { useTeamMembers, useTeams, useRoles } from "@rbp/core";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { usePhraseText, usePhrases } from "@rbp/core";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useTrainingAccess, useTrainingRequirements, useTrainingStatus, useTrainingTypes } from "../../hooks/useTrainings";
import { hasLeft, personName, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";
import { needsAttention, STATUS_COLOR, STATUS_ORDER, type TrainingStatusRow, type TrainingType } from "../../lib/trainings";
import { formatDate } from "@rbp/ui";
import { TrainingSessionList } from "./sessions";
import { TrainingSessionModal } from "./sessionForm";
import { TrainingTypeModal } from "./typeModal";
import { TeamSearchSelect } from "@rbp/module-task-family/src/components/teamSearchSelect.tsx";

export const TrainingsPage = () => {
  const { t } = useTranslation();
  const { data: people } = usePeople();
  const { data: types } = useTrainingTypes();
  const { data: statusRows, error } = useTrainingStatus();
  const { data: groups } = useTeams();
  const { data: roles } = useRoles();
  const { data: requirements } = useTrainingRequirements();
  const { data: members } = useTeamMembers();
  const access = useTrainingAccess();
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [openPerson, setOpenPerson] = useState<PersonRow | null>(null);
  const [planning, setPlanning] = useState(false);
  const [params, setParams] = useSearchParams();
  const [typeModal, setTypeModal] = useState<{ type?: TrainingType | null } | null>(null);

  const cell = useMemo(() => new Map((statusRows ?? []).map((r) => [`${r.user_id}:${r.training_type_id}`, r])), [statusRows]);
  const inTeam = useMemo(() => new Set((members ?? []).filter((m) => m.team_id === team).map((m) => m.user_id)), [members, team]);
  const { data: allCategories } = usePhrases("training_category");
  const categoryText = usePhraseText();
  const categories = useMemo(() => (allCategories ?? []).filter((c) => (types ?? []).some((x) => x.category_phrase_id === c.id)), [allCategories, types]);
  const typeById = useMemo(() => new Map((types ?? []).map((x) => [x.id, x])), [types]);
  const peopleById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);

  const candidateTypes = (types ?? []).filter((x) => x.active && (!category || x.category_phrase_id === category));
  const rowsPeople = (people ?? []).filter((p) => {
    if (hasLeft(p) || !access.canView(p.id)) return false;
    if (team && !inTeam.has(p.id)) return false;
    if (search.trim() && !personName(p).toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (onlyAttention && !candidateTypes.some((x) => { const c = cell.get(`${p.id}:${x.id}`); return c && needsAttention(c.status); })) return false;
    return true;
  });

  // Columns: only trainings with at least one entry among the people shown (with "only action needed": at least one case).
  const activeTypes = candidateTypes.filter((x) =>
    rowsPeople.some((p) => { const c = cell.get(`${p.id}:${x.id}`); return !!c && (!onlyAttention || needsAttention(c.status)); }),
  );

  const counts = { expired: 0, missing: 0, reinstruction: 0, due_soon: 0 };
  for (const r of statusRows ?? []) {
    const p = peopleById.get(r.user_id);
    if (p && !hasLeft(p) && typeById.get(r.training_type_id)?.active) {
      if (r.status === "expired") counts.expired++;
      if (r.status === "missing") counts.missing++;
      if (r.status === "due_soon") counts.due_soon++;
      if (r.status === "reinstruction") counts.reinstruction++;
    }
  }

  const matrix = (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <Input.Search allowClear placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
        <TeamSearchSelect use="filters" value={team} onChange={setTeam} style={{ minWidth: 200 }} />
        {categories.length > 0 && <Select allowClear placeholder={t("trainings.category")} value={category} onChange={setCategory} style={{ minWidth: 160 }} options={categories.map((c) => ({ value: c.id, label: categoryText(c) }))} />}
        <span><Switch checked={onlyAttention} onChange={setOnlyAttention} /> {t("trainings.onlyAttention")}</span>
        <Tag color="red">{t("trainings.status.expired")}: {counts.expired}</Tag>
        <Tag color="volcano">{t("trainings.status.missing")}: {counts.missing}</Tag>
        {counts.reinstruction > 0 && <Tag color="gold">{t("trainings.status.reinstruction")}: {counts.reinstruction}</Tag>}
        <Tag color="orange">{t("trainings.status.due_soon")}: {counts.due_soon}</Tag>
      </div>
      <Table<PersonRow>
        className="table-keep"
        size="small"
        rowKey="id"
        dataSource={rowsPeople}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: "max-content" }}
        columns={[
          {
            title: t("people.directory"),
            fixed: "left",
            render: (_, p) => (
              <a onClick={() => setOpenPerson(p)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <PersonAvatar person={p} size={24} /> {personName(p)}
              </a>
            ),
          },
          ...activeTypes.map((x) => ({
            title: <Tooltip title={x.validity_months ? t("trainings.validForMonths", { count: x.validity_months }) : t("trainings.oneOff")}><span>{x.name}</span></Tooltip>,
            align: "center" as const,
            render: (_: unknown, p: PersonRow) => {
              const c = cell.get(`${p.id}:${x.id}`);
              if (!c) return <Typography.Text type="secondary">—</Typography.Text>;
              if (c.status === "missing" || c.status === "exempt") {
                return <Tag color={STATUS_COLOR[c.status]} style={{ margin: 0, cursor: "pointer" }} onClick={() => setOpenPerson(p)}>{t(`trainings.status.${c.status}`)}</Tag>;
              }
              return (
                <Tooltip title={`${t("trainings.completedOn")}: ${formatDate(c.completed_on)}${c.status === "reinstruction" ? ` · ${t("trainings.status.reinstruction")}` : ""}`}>
                  <Tag color={STATUS_COLOR[c.status]} style={{ margin: 0, cursor: "pointer" }} onClick={() => setOpenPerson(p)}>
                    {c.valid_until ? formatDate(c.valid_until) : t("trainings.noExpiry")}
                  </Tag>
                </Tooltip>
              );
            },
          })),
        ]}
      />
    </>
  );

  const dueRows = (statusRows ?? [])
    .filter((r) => needsAttention(r.status) && peopleById.has(r.user_id) && !hasLeft(peopleById.get(r.user_id)!) && typeById.get(r.training_type_id)?.active)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.valid_until ?? "").localeCompare(b.valid_until ?? ""));
  const due = (
    <Table<TrainingStatusRow>
      size="small"
      rowKey={(r) => `${r.user_id}:${r.training_type_id}`}
      dataSource={dueRows}
      pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
      columns={[
        { title: t("people.directory"), render: (_, r) => { const p = peopleById.get(r.user_id)!; return <a onClick={() => setOpenPerson(p)}>{personName(p)}</a>; } },
        { title: t("trainings.type"), render: (_, r) => typeById.get(r.training_type_id)?.name },
        { title: t("trainings.statusLabel"), render: (_, r) => <TrainingStatusTag status={r.status} /> },
        { title: t("trainings.validUntil"), dataIndex: "valid_until", render: (v) => (v ? formatDate(v) : "—") },
        { title: t("trainings.completedOn"), dataIndex: "completed_on", render: (v) => (v ? formatDate(v) : "—") },
      ]}
    />
  );

  const catalogue = (
    <>
      {access.canEditCatalogue && <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setTypeModal({})}>{t("trainings.addType")}</Button>}
      <Table<TrainingType>
        size="small"
        rowKey="id"
        dataSource={types ?? []}
        pagination={false}
        scroll={{ x: "max-content" }}
        columns={[
          { title: t("fields.name"), dataIndex: "name", render: (v, r) => (access.canEditCatalogue ? <a onClick={() => setTypeModal({ type: r })}>{v}</a> : v) },
          { title: t("trainings.category"), dataIndex: "category_phrase_id", render: (v) => { const c = allCategories?.find((x) => x.id === v); return c ? categoryText(c) : "—"; } },
          { title: t("trainings.responsible"), render: (_, r) => (r.responsible_kind === "supervisor" ? t("trainings.responsibleKind.supervisor") : r.responsible_kind === "person" ? personName((people ?? []).find((p) => p.id === r.responsible_user_id) ?? { name: "—", email: null }) : r.responsible_kind === "external" ? r.responsible_external : "—") },
          { title: t("trainings.validityMonths"), dataIndex: "validity_months", render: (v) => (v ? t("trainings.months", { count: v }) : t("trainings.oneOff")) },
          {
            title: t("trainings.requiredFor"),
            render: (_, r) => {
              const mine = (requirements ?? []).filter((q) => q.training_type_id === r.id);
              if (!mine.length) return <Typography.Text type="secondary">—</Typography.Text>;
              return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {mine.map((q) => <Tag key={q.id} style={{ margin: 0 }}>{q.team_id ? (groups ?? []).find((g) => g.id === q.team_id)?.name : localName((roles ?? []).find((x) => x.id === q.role_id))}</Tag>)}
                </div>
              );
            },
          },
          { title: t("trainings.reminderDays"), dataIndex: "reminder_days_before" },
          { title: t("trainings.requiresCertificate"), dataIndex: "requires_certificate", render: (v) => (v ? t("common.yes") : t("common.no")) },
          { title: t("trainings.retentionYears"), dataIndex: "retention_years_after_exit" },
          { title: t("fields.active"), dataIndex: "active", render: (v) => (v ? t("common.yes") : <Tag>{t("common.no")}</Tag>) },
        ]}
      />
    </>
  );

  return (
    <Page
      title={t("trainings.title")}
      headerButtons={(people ?? []).some((p) => !hasLeft(p) && access.canEdit(p.id)) ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setPlanning(true)}>{t("trainings.sessions.plan")}</Button> : undefined}
    >
      {error && <Alert type="error" message={t("common.error")} style={{ marginBottom: 12 }} />}
      <Tabs
        activeKey={params.get("tab") ?? "matrix"}
        onChange={(tab) => setParams(tab === "matrix" ? {} : { tab }, { replace: true })}
        items={[
          { key: "matrix", label: t("trainings.matrix"), children: matrix },
          { key: "due", label: `${t("trainings.dueSoon")} (${dueRows.length})`, children: due },
          { key: "sessions", label: t("trainings.sessions.title"), children: <TrainingSessionList /> },
          { key: "catalogue", label: t("trainings.catalogue"), children: catalogue },
        ]}
      />
      <Drawer open={!!openPerson} onClose={() => setOpenPerson(null)} width="100%" destroyOnClose title={openPerson ? <Link to={`/people/${openPerson.id}`}>{personName(openPerson)}</Link> : undefined}>
        {openPerson && <div style={{ maxWidth: 1200, margin: "0 auto" }}><PersonTrainings personId={openPerson.id} /></div>}
      </Drawer>
      <TrainingSessionModal open={planning} onClose={() => setPlanning(false)} />
      <TrainingTypeModal open={!!typeModal} type={typeModal?.type} onClose={() => setTypeModal(null)} />
    </Page>
  );
};
