// Ported from COMPASS app/src/pages/admin/taskTypes/routeOverview.tsx (cut parts listed there).
import { Card, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient, useRoles } from "@rbp/core";
import { localName, pickName } from "../../../lib/masterData";
import { actionColor, actionLabel } from "../../../lib/routing";
import type { FormStep } from "./edit";
const STEP_BOX = { border: "1px solid var(--ant-color-border-secondary, #eee)", borderRadius: 6, padding: 12, marginBottom: 12 };

export const RouteOverview = ({ steps }: { steps: FormStep[] }) => {
  const { t, i18n } = useTranslation();
  const nameOf = (key: string | null) => (key === null ? t("taskTypes.finish") : (() => { const s = steps.find((x) => x?.step_key === key); return s ? pickName(s.name, s.name_de) || key : key; })());
  if (!steps.length) return null;
  return (
    <div style={{ ...STEP_BOX, background: "var(--ant-color-fill-quaternary, #fafafa)" }}>
      <Typography.Text type="secondary">{t("taskTypes.routeOverview")}</Typography.Text>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginTop: 6 }}>
          <Typography.Text strong style={{ minWidth: 190 }}>{i + 1}. {pickName(s?.name, s?.name_de) || t("taskTypes.unnamedStep")}{s?.is_decision ? <Tag color="orange" style={{ marginLeft: 8 }}>{t("taskTypes.decisionStep")}</Tag> : null}</Typography.Text>
          {(s?.actions ?? []).filter((a) => a?.key).map((a, j) => (
            <Tag key={j} color={actionColor({ ...a, to: a.to ?? null })}>{actionLabel(t, i18n.language, a)} → {nameOf(a.to ?? null)}</Tag>
          ))}
        </div>
      ))}
    </div>
  );
};

// Read-only: which roles may start this type. Maintained on the roles page (a role without entries may use every
// type).
export const WhoCanStart = ({ typeId }: { typeId: string | null }) => {
  const { t } = useTranslation();
  const { data: roles } = useRoles();
  const { data: rows } = useQuery({
    queryKey: ["admin-role-task-types"],
    queryFn: async () => {
      const map: Record<string, string[]> = {};
      for (const r of (await supabaseClient.from("role_task_types").select("role_id, task_type_id")).data ?? []) (map[r.role_id] ??= []).push(r.task_type_id);
      return map;
    },
  });
  const restricted = rows && Object.keys(rows).length > 0;
  const allowed = (roles ?? []).filter((r) => !rows?.[r.id] || (typeId !== null && rows[r.id].includes(typeId)));
  const excluded = (roles ?? []).filter((r) => !allowed.includes(r));
  return (
    <Card size="small" title={t("taskTypes.whoCanStart")} extra={<Link to="/admin/roles">{t("admin.roles")}</Link>} style={{ height: "100%" }}>
      {!restricted ? (
        <Typography.Paragraph>{t("taskTypes.everyRole")}</Typography.Paragraph>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            {allowed.map((r) => <Tag key={r.id} color="green">{localName(r)}</Tag>)}
          </div>
          {excluded.length ? (
            <Typography.Paragraph type="secondary">
              {t("taskTypes.notFor")} {excluded.map((r) => localName(r)).join(", ")}
            </Typography.Paragraph>
          ) : null}
        </>
      )}
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>{t("taskTypes.whoCanStartHint")}</Typography.Paragraph>
    </Card>
  );
};
