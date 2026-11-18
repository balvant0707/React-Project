// Ported 1:1 from COMPASS (app/src/pages/people/index.tsx).
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Input, Select, Spin, Switch, Tabs } from "antd";
import { PhoneOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Page } from "@rbp/core";
import { useTeamMembers, useTeams } from "@rbp/core";
import { useCanEditPeople, usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { hasLeft, personName, withSubordinates, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";
import { PeopleCards } from "./directory";
import { OrgChartView } from "./org";
import { PersonFormModal } from "./personForm";
import { TeamSearchSelect } from "@rbp/module-task-family/src/components/teamSearchSelect.tsx";

const matches = (p: PersonRow, term: string) =>
  [p.name, p.position, p.email, p.phone_office, p.phone_mobile, p.site].some((v) => v?.toLowerCase().includes(term));

// Directory and org chart share one page and one filter: both tabs show the same filtered people.
export const PeoplePage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "org" ? "org" : "directory";
  const { data: people, isLoading, error } = usePeople();
  const { data: groups } = useTeams();
  const { data: members } = useTeamMembers();
  const canEdit = useCanEditPeople();
  // Platform: the former employees switch is for whoever edits person data (people.edit, held by HR), not a role name.
  const isHr = canEdit;
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<string | undefined>();
  const [supervisor, setSupervisor] = useState<string | undefined>();
  const [site, setSite] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [showFormer, setShowFormer] = useState(false);
  const former = isHr && showFormer;

  const teamsOf = useMemo(() => {
    const names = new Map((groups ?? []).map((g) => [g.id, g.name]));
    const out = new Map<string, string[]>();
    for (const m of members ?? []) out.set(m.user_id, [...(out.get(m.user_id) ?? []), names.get(m.team_id) ?? ""]);
    return out;
  }, [groups, members]);
  const inTeam = useMemo(() => new Set((members ?? []).filter((m) => m.team_id === team).map((m) => m.user_id)), [members, team]);
  const sites = useMemo(() => [...new Set((people ?? []).map((p) => p.site).filter((s): s is string => !!s))].sort(), [people]);
  const supervisorOptions = useMemo(
    () => (people ?? []).filter((p) => p.has_login && (former || !hasLeft(p))).map((p) => ({ value: p.id, label: personName(p) })),
    [people, former],
  );
  const below = useMemo(() => (supervisor ? withSubordinates(people ?? [], supervisor) : null), [people, supervisor]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (people ?? []).filter(
      (p) => (former || !hasLeft(p)) && (!term || matches(p, term)) && (!team || inTeam.has(p.id)) && (!site || p.site === site) && (!below || below.has(p.id)),
    );
  }, [people, search, team, site, inTeam, below, former]);

  const content = isLoading ? (
    <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>
  ) : view === "org" ? (
    <OrgChartView people={shown} teamsOf={teamsOf} />
  ) : (
    <PeopleCards people={shown} teamsOf={teamsOf} unfiltered={!search && !team && !site && !supervisor} />
  );

  return (
    <Page
      title={t("people.title")}
      subtitle={t("common.results", { count: shown.length })}
      headerButtons={
        <>
          <Link to="/people/phone-list"><Button icon={<PhoneOutlined />}>{t("people.phoneList")}</Button></Link>
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>{t("people.addPerson")}</Button>}
        </>
      }
    >
      {error && <Alert type="error" message={t("common.error")} style={{ marginBottom: 16 }} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <Input.Search autoFocus={params.get("focus") === "search"} allowClear placeholder={t("people.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 260px", maxWidth: 420 }} />
        <TeamSearchSelect use="filters" value={team} onChange={setTeam} style={{ minWidth: 200 }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder={t("people.supervisorAndBelow")} value={supervisor} onChange={setSupervisor} style={{ minWidth: 220 }} options={supervisorOptions} />
        {sites.length > 1 && <Select allowClear placeholder={t("people.site")} value={site} onChange={setSite} style={{ minWidth: 160 }} options={sites.map((s) => ({ value: s, label: s }))} />}
        {isHr && <span><Switch checked={showFormer} onChange={setShowFormer} /> {t("people.showFormer")}</span>}
      </div>
      <Tabs
        activeKey={view}
        onChange={(key) => setParams(key === "org" ? { view: "org" } : {}, { replace: true })}
        items={[
          { key: "directory", label: t("people.directory") },
          { key: "org", label: t("people.orgChart") },
        ]}
      />
      {content}
      <PersonFormModal open={adding} onClose={() => setAdding(false)} />
    </Page>
  );
};
