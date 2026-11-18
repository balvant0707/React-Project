// Ported 1:1 from COMPASS (app/src/pages/positions/reviews.tsx).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Select, Switch, Table, Tag } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { FitResultTag } from "../../components/personFitReviews";
import { useTeamMembers } from "@rbp/core";
import { useFitAccess, useFitStatus } from "../../hooks/useFitReviews";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { usePositionHolders, usePositions } from "../../hooks/usePositions";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { FIT_STATUS_COLOR, FIT_STATUS_ORDER, type FitStatusKey, type FitStatusRow } from "../../lib/positions";
import { formatDate } from "@rbp/ui";
import { TeamSearchSelect } from "@rbp/module-task-family/src/components/teamSearchSelect.tsx";

// Overview of the periodic suitability reviews: everybody who holds a position, with the status of the latest review.
export const FitReviewOverview = () => {
  const { t } = useTranslation();
  const access = useFitAccess();
  const { data: status, isLoading } = useFitStatus(access.canViewOthers);
  const { data: people } = usePeople();
  const { data: holders } = usePositionHolders();
  const { data: positions } = usePositions();
  const { data: members } = useTeamMembers();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<FitStatusKey | undefined>();
  const [position, setPosition] = useState<string | undefined>();
  const [team, setTeam] = useState<string | undefined>();
  const [onlyOpen, setOnlyOpen] = useState(false);

  const personById = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (status ?? [])
      .filter((s) => personById.has(s.user_id))
      .filter((s) => !term || personName(personById.get(s.user_id)).toLowerCase().includes(term))
      .filter((s) => !state || s.status === state)
      .filter((s) => !position || (holders ?? []).some((h) => h.user_id === s.user_id && h.position_id === position))
      .filter((s) => !team || (members ?? []).some((m) => m.user_id === s.user_id && m.team_id === team))
      .filter((s) => !onlyOpen || s.deviation_open)
      .sort((a, b) => FIT_STATUS_ORDER[a.status] - FIT_STATUS_ORDER[b.status] || (a.next_review_on ?? "").localeCompare(b.next_review_on ?? "") || personName(personById.get(a.user_id)).localeCompare(personName(personById.get(b.user_id))));
  }, [status, personById, search, state, position, team, onlyOpen, holders, members]);

  const positionNames = (uid: string) => [...new Set((holders ?? []).filter((h) => h.user_id === uid).map((h) => (positions ?? []).find((p) => p.id === h.position_id)?.name))].filter(Boolean).join(", ");
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [[t("fit.person"), t("positions.title"), t("fit.lastReview"), t("fit.nextReview"), t("fit.rating.title"), t("fit.statusLabel")].map(esc).join(";")];
    for (const s of rows) {
      lines.push([personName(personById.get(s.user_id)), positionNames(s.user_id), s.reviewed_on ?? "", s.next_review_on ?? "", s.result ? t(`fit.rating.${s.result}`) : "", t(`fit.status.${s.status}`)].map(esc).join(";"));
    }
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "suitability-reviews.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <Input.Search allowClear placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />
        <Select allowClear placeholder={t("fit.statusLabel")} value={state} onChange={setState} style={{ minWidth: 160 }} options={(["overdue", "never", "due_soon", "ok"] as FitStatusKey[]).map((k) => ({ value: k, label: t(`fit.status.${k}`) }))} />
        <Select allowClear showSearch optionFilterProp="label" placeholder={t("positions.title")} value={position} onChange={setPosition} style={{ minWidth: 200 }} options={(positions ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} />
        <TeamSearchSelect use="filters" value={team} onChange={setTeam} style={{ minWidth: 180 }} />
        <span><Switch checked={onlyOpen} onChange={setOnlyOpen} /> {t("fit.onlyDeviations")}</span>
        <span style={{ flex: 1 }} />
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={rows.length === 0}>{t("fit.export")}</Button>
      </div>
      <Table<FitStatusRow>
        rowKey="user_id"
        size="small"
        loading={isLoading}
        dataSource={rows}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        columns={[
          { title: t("fit.person"), render: (_: unknown, r) => <Link to={`/people/${r.user_id}`}>{personName(personById.get(r.user_id))}</Link> },
          { title: t("positions.title"), render: (_: unknown, r) => positionNames(r.user_id) },
          { title: t("fit.lastReview"), render: (_: unknown, r) => (r.reviewed_on ? formatDate(r.reviewed_on) : "—") },
          { title: t("fit.nextReview"), render: (_: unknown, r) => (r.next_review_on ? formatDate(r.next_review_on) : "—") },
          { title: t("fit.rating.title"), render: (_: unknown, r) => (r.result ? <><FitResultTag result={r.result} />{r.deviation_open && <Tag color="red" style={{ marginLeft: 4 }}>{t("fit.deviationOpen")}</Tag>}</> : "—") },
          { title: t("fit.statusLabel"), render: (_: unknown, r) => <Tag color={FIT_STATUS_COLOR[r.status]} style={{ margin: 0 }}>{t(`fit.status.${r.status}`)}</Tag> },
          { title: "", render: (_: unknown, r) => (access.canEdit ? <Link to={`/people/${r.user_id}/fit-review`}>{t("fit.start")}</Link> : null) },
        ]}
      />
    </>
  );
};
