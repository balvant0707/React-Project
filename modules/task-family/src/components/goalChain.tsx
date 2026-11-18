// Ported 1:1 from COMPASS (app/src/components/goalChain.tsx).
import { Link } from "react-router-dom";
import { Progress, Space, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import { AimOutlined, FlagOutlined, RightOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { fetchContribution, formatValue, percent, type ContributionRow } from "../lib/goals";
import { GoalStatusTag } from "./goalStatus";

// "This task contributes to": the initiative above it and the goals above that, up to the company's purpose.
// Shown to everyone who may view the task and holds a goals.view.* literal; renders nothing otherwise.
export const GoalChain = ({ taskId }: { taskId: string }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { data } = useQuery({ queryKey: ["task-contribution", taskId], queryFn: () => fetchContribution(taskId) });
  if (!data || data.length === 0) return null;
  // Top of the chain first: purpose > ... > goal > initiative > this task.
  const chain = [...data].sort((a, b) => b.step - a.step);

  const item = (r: ContributionRow) => {
    const pct = percent(r.progress);
    const label = (
      <>
        {r.kind === "initiative" ? <FlagOutlined /> : <AimOutlined />} {r.title}
      </>
    );
    const tip =
      r.kind === "goal" ? (
        <div>
          <div>#{r.number} {r.title}</div>
          {r.measure_label ? (
            <div>
              {r.measure_label}: {formatValue(r.start_value, r.measure_unit)} → <strong>{formatValue(r.current_value, r.measure_unit)}</strong> → {formatValue(r.target_value, r.measure_unit)}
            </div>
          ) : null}
          {r.owner_name && <div>{t("goals.owner")}: {r.owner_name}</div>}
        </div>
      ) : (
        <div>#{r.number} {r.title}</div>
      );
    const to = r.kind === "goal" ? `/goals/${r.id}` : `/tasks/${r.id}`;
    return (
      <Tooltip title={tip} key={`${r.kind}-${r.id}`}>
        <Space size={4}>
          {r.can_open ? <Link to={to}>{label}</Link> : <Typography.Text>{label}</Typography.Text>}
          {r.kind === "goal" && r.measure_label && pct != null && (
            <Progress type="circle" percent={pct} size={22} format={() => ""} />
          )}
          {r.kind === "goal" && r.status && <GoalStatusTag status={r.status} />}
        </Space>
      </Tooltip>
    );
  };

  return (
    <div
      style={{ margin: "0 0 12px", padding: "8px 12px", border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorFillQuaternary }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
        {t("goals.contributesTo")}
      </Typography.Text>
      <Space size={6} wrap split={<RightOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />}>
        {chain.map(item)}
        <Tag>{t("goals.thisTask")}</Tag>
      </Space>
    </div>
  );
};
