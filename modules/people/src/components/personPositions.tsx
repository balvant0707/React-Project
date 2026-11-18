// Ported 1:1 from COMPASS (app/src/components/personPositions.tsx).
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Card, List, Popconfirm, Tag, Typography } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useCanEditPeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useAppointmentLetters, usePositionCleanup, usePositionHolders, usePositionLog, usePositions } from "../hooks/usePositions";
import { formatDate } from "@rbp/ui";
import { LOG_ACTION_COLOR, type HolderRow } from "../lib/positions";
import { AppointmentLetters, periodLabel } from "./holderPeriods";
import { errorText } from "@rbp/core";

// The positions and appointments of one person (direct with their start date, or through a team) and the history of
// their assignments. Renders nothing for someone who never held a position.
export const PersonPositions = ({ personId }: { personId: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const canErase = useCanEditPeople();
  const cleanup = usePositionCleanup();
  const { data: positions } = usePositions();
  const { data: holders } = usePositionHolders();
  const { data: log } = usePositionLog({ userId: personId });
  const name = (id: string) => (positions ?? []).find((p) => p.id === id)?.name ?? "—";
  const isAppointment = (id: string) => (positions ?? []).find((p) => p.id === id)?.kind === "appointment";
  // One tag per position; Map keeps the last entry per key, so direct assignments sort last and win over the team route.
  const current = [...new Map([...(holders ?? [])].filter((h) => h.user_id === personId).sort((a, b) => (a.source === "direct" ? 1 : 0) - (b.source === "direct" ? 1 : 0)).map((h) => [h.position_id, h])).values()];
  const past = log ?? [];
  const jobs = current.filter((h) => !isAppointment(h.position_id));
  const appointments = current.filter((h) => isAppointment(h.position_id));
  const { data: letters } = useAppointmentLetters(appointments.flatMap((h) => (h.holder_id ? [h.holder_id] : [])));
  const tag = (h: HolderRow) => (
    <Link key={h.position_id} to={`/positions/${h.position_id}`}>
      <Tag color={isAppointment(h.position_id) ? "gold" : "blue"} style={{ cursor: "pointer" }}>
        {name(h.position_id)}
        {h.source === "team" ? ` · ${t("positions.viaTeam")}` : h.valid_from ? ` · ${t("positions.periods.since", { date: formatDate(h.valid_from) })}` : ""}
      </Tag>
    </Link>
  );
  if (current.length === 0 && past.length === 0) return null;

  return (
    <Card size="small" title={t("positions.cardTitle")} style={{ marginBottom: 16 }}>
      {current.length === 0 && <Typography.Text type="secondary">{t("positions.noneNow")}</Typography.Text>}
      {jobs.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{jobs.map(tag)}</div>}
      {appointments.length > 0 && (
        <div style={{ marginTop: jobs.length > 0 ? 12 : 0 }}>
          <Typography.Text type="secondary">{t("positions.kind.appointments")}</Typography.Text>
          {appointments.map((h) => (
            <div key={h.position_id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
              {tag(h)}
              {h.holder_id && <AppointmentLetters holderId={h.holder_id} letters={(letters ?? []).filter((l) => l.entity_id === h.holder_id)} canManage={false} />}
            </div>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer" }}>{t("positions.history")}</summary>
          <List
            size="small"
            dataSource={past}
            renderItem={(r) => (
              <List.Item
                actions={canErase ? [
                  <Popconfirm key="del" title={t("positions.deleteLogEntry")} onConfirm={() => cleanup.deleteLogEntry(r.id).then(() => message.success(t("positions.entryDeleted"))).catch((e) => message.error(errorText(e)))} okText={t("common.yes")} cancelText={t("common.no")}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ] : []}
              >
                {/* The date an entry was made; a direct entry also names the period it applies to. */}
                <span style={{ width: 100, display: "inline-block" }} title={t("positions.enteredOn")}>{formatDate(r.happened_at)}</span>
                <Tag color={LOG_ACTION_COLOR[r.action]}>{t(`positions.action.${r.action}`)}</Tag>
                <Link to={`/positions/${r.position_id}`}>{name(r.position_id)}</Link>
                {r.source === "team" && <Typography.Text type="secondary" style={{ marginLeft: 8 }}>{t("positions.viaTeam")}{r.team_name ? `: ${r.team_name}` : ""}</Typography.Text>}
                {r.valid_from && <Typography.Text type="secondary" style={{ marginLeft: 8 }}>{periodLabel(t, r.valid_from, r.valid_to)}</Typography.Text>}
              </List.Item>
            )}
          />
        </details>
      )}
    </Card>
  );
};
