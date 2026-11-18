// Ported 1:1 from COMPASS (app/src/pages/people/org.tsx).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, Empty, Tag, Typography, theme as antdTheme } from "antd";
import { useTranslation } from "react-i18next";
import { OrgToggle, OrgTree } from "@rbp/module-task-family/src/components/orgTree.tsx";
import { useIsMobile } from "@rbp/ui";
import { OrgChartMobile } from "./orgMobile";
import { PersonAvatar } from "@rbp/core";
import { buildPeopleTree, personName, type PersonNode, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";

const Node = ({ node, teams, compact, collapsed, onToggle }: { node: PersonNode; teams: string[]; compact: boolean; collapsed: boolean; onToggle: () => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  return (
    <div
      className="org-tree-node"
      style={{
        width: compact ? 128 : 220,
        textAlign: "left",
        padding: compact ? "5px 6px" : "8px 10px",
        display: "flex",
        gap: compact ? 6 : 10,
        alignItems: "center",
        background: token.colorBgContainer,
        border: `1px ${node.has_login ? "solid" : "dashed"} ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        boxShadow: token.boxShadowTertiary,
        position: "relative",
      }}
    >
      <PersonAvatar person={node} size={compact ? 26 : 40} />
      <div style={{ minWidth: 0 }}>
        <Link to={`/people/${node.id}`} style={{ fontWeight: 600, display: "block", lineHeight: 1.25, fontSize: compact ? 12 : undefined, overflowWrap: "anywhere" }}>{personName(node)}</Link>
        {node.position && <Typography.Text type="secondary" style={{ fontSize: compact ? 10 : 12, display: "block", lineHeight: 1.25 }}>{node.position}</Typography.Text>}
        {teams.length > 0 && <Typography.Text type="secondary" style={{ fontSize: compact ? 10 : 11, display: "block", lineHeight: 1.25 }}>{teams.join(", ")}</Typography.Text>}
        {!node.has_login && <Typography.Text type="secondary" style={{ fontSize: compact ? 10 : 11 }}>{t("people.noLogin")}</Typography.Text>}
      </div>
      {node.children.length > 0 && <OrgToggle count={node.children.length} collapsed={collapsed} onToggle={onToggle} />}
    </div>
  );
};

export const OrgChartView = ({ people, teamsOf }: { people: PersonRow[]; teamsOf: Map<string, string[]> }) => {
  const { t } = useTranslation();
  const compact = useIsMobile();
  const tree = useMemo(() => buildPeopleTree(people), [people]);
  if (!people.length) return <Empty description={t("common.noMatches")} />;
  return (
    <>
      {compact ? <OrgChartMobile roots={tree.roots} teamsOf={teamsOf} /> : <OrgTree roots={tree.roots} compact={compact} renderNode={(n, collapsed, toggle) => <Node node={n} teams={teamsOf.get(n.id) ?? []} compact={compact} collapsed={collapsed} onToggle={toggle} />} />}
      {tree.detached.length > 0 && (
        <Card size="small" title={t("people.notInHierarchy", { count: tree.detached.length })} style={{ marginTop: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tree.detached.map((p: PersonRow) => (
              <Link key={p.id} to={`/people/${p.id}`}><Tag style={{ cursor: "pointer", margin: 0 }}>{personName(p)}</Tag></Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
};
