// Ported 1:1 from COMPASS (app/src/components/accessBadge.tsx).
import { Popover, Space, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { TeamDot } from "./masterLooks";

// Who can read (and edit) a task, ticket or asset (RPC record_access; ~/maintenance_tool/docs/permissions.md "Who can access"). Display only:
// the database lists the teams, people and roles that pass its own access check, so the list is what is enforced.
// A short line in the field bar, the full list in a popover.

type Row = { kind: "team" | "user" | "role"; ref_id: string; label: string; label_de: string | null; access_level: "view" | "edit"; sources: string[] };
type Entity = "tasks" | "tickets" | "assets";

export const useRecordAccess = (entityType: Entity, id: string | undefined) =>
  useQuery({
    queryKey: ["record-access", entityType, id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("record_access", { p_entity_type: entityType, p_entity_id: id });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

const SHOWN = 3;

export const AccessBadge = ({ entityType, id }: { entityType: Entity; id: string }) => {
  const { t } = useTranslation();
  const { data } = useRecordAccess(entityType, id);
  if (!data) return <Typography.Text type="secondary">…</Typography.Text>;
  if (data.length === 0) return <Typography.Text type="secondary">—</Typography.Text>;
  const name = (r: Row) => pickName(r.label, r.label_de);
  const sections: { kind: Row["kind"]; rows: Row[] }[] = (["team", "user", "role"] as const).map((kind) => ({ kind, rows: data.filter((r) => r.kind === kind) })).filter((s) => s.rows.length > 0);

  const content = (
    <div style={{ maxWidth: 340 }}>
      {sections.map((s) => (
        <div key={s.kind} style={{ marginBottom: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t(`recordAccess.kind.${s.kind}`)}
          </Typography.Text>
          {s.rows.map((r) => (
            <div key={r.ref_id} style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
              <Space size={6}>
                {r.kind === "team" && <TeamDot teamId={r.ref_id} />}
                <span>{name(r)}</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.sources.map((x) => t(`recordAccess.source.${x}`)).join(", ")}
                </Typography.Text>
              </Space>
              <Tag color={r.access_level === "edit" ? "blue" : undefined} style={{ marginInlineEnd: 0 }}>
                {t(`recordAccess.level.${r.access_level}`)}
              </Tag>
            </div>
          ))}
        </div>
      ))}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("recordAccess.hint")}
      </Typography.Text>
    </div>
  );

  const shown = data.slice(0, SHOWN);
  return (
    <Popover content={content} title={t("recordAccess.title")} trigger={["hover", "click"]} placement="bottomLeft">
      {/* Plain flex spans, no antd Space: the phone field bar stretches every Space to fill its cell (inputs). */}
      <span style={{ cursor: "pointer", display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px", maxWidth: "100%" }}>
        {shown.map((r) => (
          <span key={r.ref_id} style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, maxWidth: "100%" }}>
            {r.kind === "team" && <TeamDot teamId={r.ref_id} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(r)}</span>
          </span>
        ))}
        {data.length > SHOWN && <Typography.Text type="secondary">+{data.length - SHOWN}</Typography.Text>}
      </span>
    </Popover>
  );
};
