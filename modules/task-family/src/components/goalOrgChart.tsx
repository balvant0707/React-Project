// Ported 1:1 from COMPASS (app/src/components/goalOrgChart.tsx).
import { Link } from "react-router-dom";
import { Progress, Tag, Typography, theme as antdTheme } from "antd";
import { useTranslation } from "react-i18next";
import { GoalStatusTag } from "./goalStatus";
import { OrgToggle, OrgTree } from "./orgTree";
import { formatValue, hasMeasure, isStale, percent, type GoalTreeNode } from "../lib/goals";

// The goals as an org chart (generic tree in orgTree.tsx).
const NODE_WIDTH = 230;

const Node = ({ node, collapsed, onToggle }: { node: GoalTreeNode; collapsed: boolean; onToggle: () => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const pct = percent(node.progress);
  return (
    <div
      className="org-tree-node"
      style={{
        width: NODE_WIDTH,
        textAlign: "left",
        padding: "8px 10px",
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        boxShadow: token.boxShadowTertiary,
        position: "relative",
      }}
    >
      <Link to={`/goals/${node.id}`} style={{ fontWeight: 600, display: "block", lineHeight: 1.3 }}>
        #{node.goal_number} {node.title}
      </Link>
      <div style={{ margin: "4px 0", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        <GoalStatusTag status={node.status} />
        {isStale(node) && <Tag color="orange">{t("goals.stale")}</Tag>}
        {node.initiative_count > 0 && <Tag>{t("goals.initiativeCount", { count: node.initiative_count })}</Tag>}
      </div>
      {hasMeasure(node) ? (
        <Typography.Text style={{ fontSize: 12 }} title={node.measure_label ?? undefined}>
          {formatValue(node.current_value, node.measure_unit)} / {formatValue(node.target_value, node.measure_unit)}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t("goals.noMeasureShort")}
        </Typography.Text>
      )}
      {pct != null && <Progress percent={pct} size="small" showInfo={false} strokeColor={node.progress_is_derived ? "#bfbfbf" : undefined} style={{ margin: 0 }} />}
      {node.owner_name && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
          {node.owner_name}
        </Typography.Text>
      )}
      {node.children.length > 0 && <OrgToggle count={node.children.length} collapsed={collapsed} onToggle={onToggle} />}
    </div>
  );
};

export const GoalOrgChart = ({ roots }: { roots: GoalTreeNode[] }) => (
  <OrgTree roots={roots} renderNode={(n, collapsed, toggle) => <Node node={n} collapsed={collapsed} onToggle={toggle} />} />
);
