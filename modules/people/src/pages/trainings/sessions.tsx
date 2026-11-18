// Ported 1:1 from COMPASS (app/src/pages/trainings/sessions.tsx).
import { Link } from "react-router-dom";
import { Table, Tooltip, Typography } from "antd";
import { IconAlertTriangle, IconPaperclip } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useTrainingSessions } from "../../hooks/useTrainings";
import { CI_RED } from "@rbp/ui";
import type { TrainingSessionRow } from "../../lib/trainings";
import { formatDate } from "@rbp/ui";
import { SessionStatusTag } from "./sessionParts";

// Tab "Sessions" of the trainings page: planned ones first (by date), then the confirmed ones, newest first.
export const TrainingSessionList = () => {
  const { t } = useTranslation();
  const { data, isLoading } = useTrainingSessions();
  const rows = [...(data ?? [])].sort((a, b) =>
    a.status !== b.status ? (a.status === "planned" ? -1 : 1) : a.status === "planned" ? a.held_on.localeCompare(b.held_on) : b.held_on.localeCompare(a.held_on),
  );
  return (
    <Table<TrainingSessionRow>
      size="small"
      rowKey="id"
      loading={isLoading}
      dataSource={rows}
      pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
      locale={{ emptyText: t("trainings.sessions.empty") }}
      columns={[
        { title: t("trainings.sessions.heldOn"), dataIndex: "held_on", render: (v, r) => <Link to={`/trainings/sessions/${r.id}`}>{formatDate(v)}</Link> },
        { title: t("trainings.sessions.types"), dataIndex: "type_names", render: (v, r) => <Link to={`/trainings/sessions/${r.id}`}>{v || "—"}</Link> },
        { title: t("trainings.statusLabel"), render: (_, r) => <SessionStatusTag session={r} /> },
        { title: t("trainings.trainer"), dataIndex: "trainer", render: (v) => v ?? "—" },
        { title: t("trainings.sessions.location"), dataIndex: "location", render: (v) => v ?? "—" },
        {
          title: t("trainings.people"),
          render: (_, r) => (r.status === "confirmed" ? r.attended_count : r.participant_count === r.attended_count ? r.participant_count : `${r.attended_count} / ${r.participant_count}`),
        },
        {
          title: t("trainings.proof"),
          render: (_, r) =>
            r.proof_count > 0 ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconPaperclip size={14} aria-hidden /> {r.proof_count}</span>
            ) : r.requires_certificate && r.status === "confirmed" ? (
              <Tooltip title={t("trainings.certificateRequired")}><IconAlertTriangle size={16} color={CI_RED} aria-label={t("trainings.certificateRequired")} /></Tooltip>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            ),
        },
      ]}
    />
  );
};
