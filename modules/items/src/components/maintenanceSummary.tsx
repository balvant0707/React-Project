// Ported 1:1 from COMPASS (app/src/components/maintenanceSummary.tsx).
import { Card, Statistic } from "antd";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { usePermissions } from "@rbp/core";
import { fetchMaintenanceStats } from "../lib/maintenanceStats";
import { formatMoney } from "@rbp/module-task-family/src/lib/money.ts";

// The asset and everything below it, last 12 months. Hidden while there is nothing to show.
export const MaintenanceSummary = ({ assetId }: { assetId: string }) => {
  const { t, i18n } = useTranslation();
  const { has } = usePermissions();
  const from = dayjs().subtract(12, "month").add(1, "day").format("YYYY-MM-DD");
  const to = dayjs().format("YYYY-MM-DD");
  const { data } = useQuery({ queryKey: ["maintenance-stats", from, to, assetId], queryFn: () => fetchMaintenanceStats(from, to, assetId) });
  if (!data || data.length === 0) return null;
  const sum = (k: "tasks_done" | "corrective_tasks" | "work_hours" | "downtime_hours" | "external_cost" | "items_cost") => data.reduce((s, r) => s + r[k], 0);
  return (
    <Card size="small" title={t("statistics.summaryTitle")} style={{ marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 40px" }}>
        <Statistic title={t("statistics.tasksDone")} value={sum("tasks_done")} />
        <Statistic title={t("statistics.corrective")} value={sum("corrective_tasks")} />
        <Statistic title={t("statistics.workHours")} value={sum("work_hours")} suffix="h" />
        <Statistic title={t("statistics.downtimeHours")} value={Math.round(sum("downtime_hours") * 10) / 10} suffix="h" />
        {has("costs.view") && <Statistic title={t("statistics.externalCost")} value={formatMoney(sum("external_cost"), i18n.language)} />}
        {has("costs.view") && has("items.view") && sum("items_cost") > 0 && <Statistic title={t("statistics.partsCost")} value={formatMoney(sum("items_cost"), i18n.language)} />}
      </div>
    </Card>
  );
};
