// Ported 1:1 from COMPASS (app/src/pages/positions/index.tsx).
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Segmented, Select, Switch, Table, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Page } from "@rbp/core";
import { useTeams, useUserMap } from "@rbp/core";
import { useFitAccess } from "../../hooks/useFitReviews";
import { usePositionAccess, usePositionHolders, usePositions, usePositionTeams, useVersionSummaries } from "../../hooks/usePositions";
import type { JobDescriptionVersion, PositionKind, PositionRow } from "../../lib/positions";
import { PositionFormModal } from "./positionForm";
import { FitReviewOverview } from "./reviews";
import { TeamSearchSelect } from "@rbp/module-task-family/src/components/teamSearchSelect.tsx";

type VersionRef = Pick<JobDescriptionVersion, "id" | "position_id" | "version_no" | "status">;
type Row = PositionRow & { teamIds: string[]; holderIds: string[]; published?: VersionRef; open?: VersionRef };

export const PositionList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: positions, isLoading } = usePositions();
  const { data: teams } = usePositionTeams();
  const { data: holders } = usePositionHolders();
  const { data: versions } = useVersionSummaries();
  const { data: groups } = useTeams();
  const users = useUserMap();
  const access = usePositionAccess();
  const fit = useFitAccess();
  const [params, setParams] = useSearchParams();
  const reviews = fit.canViewOthers && params.get("view") === "reviews";
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState<string | undefined>();
  const [onlyVacant, setOnlyVacant] = useState(false);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [kind, setKind] = useState<PositionKind | undefined>();
  const [creating, setCreating] = useState(false);

  const groupName = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g.name])), [groups]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (positions ?? [])
      .map((p): Row => {
        const own = (versions ?? []).filter((v) => v.position_id === p.id);
        return {
          ...p,
          teamIds: (teams ?? []).filter((x) => x.position_id === p.id).map((x) => x.team_id),
          holderIds: [...new Set((holders ?? []).filter((h) => h.position_id === p.id).map((h) => h.user_id))],
          published: own.find((v) => v.status === "published"),
          open: own.find((v) => v.status === "draft" || v.status === "submitted"),
        };
      })
      .filter((r) => (showInactive || r.active) && (!term || r.name.toLowerCase().includes(term) || (r.code ?? "").toLowerCase().includes(term)))
      .filter((r) => !kind || r.kind === kind)
      .filter((r) => !team || r.teamIds.includes(team))
      .filter((r) => !onlyVacant || r.holderIds.length === 0)
      .filter((r) => !onlyWaiting || r.open?.status === "submitted");
  }, [positions, teams, holders, versions, search, kind, team, onlyVacant, onlyWaiting, showInactive]);

  return (
    <Page
      title={t("positions.title")}
      headerButtons={!reviews && access.canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t("positions.add")}</Button>}
    >
      {fit.canViewOthers && (
        <Segmented
          style={{ marginBottom: 12 }}
          value={reviews ? "reviews" : "list"}
          onChange={(v) => setParams(v === "reviews" ? { view: "reviews" } : {}, { replace: true })}
          options={[{ value: "list", label: t("positions.title") }, { value: "reviews", label: t("fit.tab") }]}
        />
      )}
      {reviews ? <FitReviewOverview /> : (<>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <Input.Search allowClear placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
        <Select allowClear placeholder={t("positions.kind.label")} value={kind} onChange={setKind} style={{ width: 170 }} options={[{ value: "job", label: t("positions.kind.jobs") }, { value: "appointment", label: t("positions.kind.appointments") }]} />
        <TeamSearchSelect use="filters" value={team} onChange={setTeam} style={{ minWidth: 200 }} />
        <span><Switch checked={onlyVacant} onChange={setOnlyVacant} /> {t("positions.onlyVacant")}</span>
        <span><Switch checked={onlyWaiting} onChange={setOnlyWaiting} /> {t("positions.onlyWaiting")}</span>
        <span><Switch checked={showInactive} onChange={setShowInactive} /> {t("positions.showInactive")}</span>
      </div>
      <Table<Row>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={rows}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => navigate(`/positions/${r.id}`), style: { cursor: "pointer" } })}
        columns={[
          { title: t("fields.name"), render: (_: unknown, r: Row) => <><Link to={`/positions/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.name}</Link>{r.kind === "appointment" && <Tag color="gold" style={{ marginLeft: 8 }}>{t("positions.kind.appointment")}</Tag>}</>, sorter: (a: Row, b: Row) => a.name.localeCompare(b.name), defaultSortOrder: "ascend" },
          { title: t("positions.code"), dataIndex: "code" },
          { title: t("positions.teams"), render: (_: unknown, r: Row) => r.teamIds.map((g) => <Tag key={g}>{groupName.get(g) ?? g}</Tag>) },
          {
            title: t("positions.holders"),
            render: (_: unknown, r: Row) =>
              r.holderIds.length === 0 ? <Tag color="volcano">{t("positions.vacant")}</Tag> : r.holderIds.slice(0, 3).map((id) => users.get(id)?.name ?? "—").join(", ") + (r.holderIds.length > 3 ? ` +${r.holderIds.length - 3}` : ""),
          },
          {
            title: t("positions.description"),
            render: (_: unknown, r: Row) => (
              <>
                {r.published ? <Tag color="green">{t("positions.versionNo", { no: r.published.version_no })}</Tag> : <Tag>{t("positions.noDescription")}</Tag>}
                {r.open && <Tag color={r.open.status === "submitted" ? "gold" : "default"}>{t(`positions.status.${r.open.status}`)}</Tag>}
              </>
            ),
          },
        ]}
      />
      </>)}
      <PositionFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/positions/${id}`)} />
    </Page>
  );
};
