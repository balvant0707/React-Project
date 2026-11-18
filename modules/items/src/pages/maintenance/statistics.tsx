// Ported 1:1 from COMPASS (app/src/pages/maintenance/statistics.tsx).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, DatePicker, Segmented, Select, Space, Table, Tooltip, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Page } from "@rbp/core";
import { AssetSelect } from "@rbp/module-task-family/src/components/assetSelect.tsx";
import { TeamSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { PunctualityPanel } from "@rbp/module-task-family/src/components/punctuality.tsx";
import { useTaskTypes } from "@rbp/module-task-family/src/pages/tasks/taskForm.tsx";
import { localName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { usePermissions } from "@rbp/core";
import { useSuppliers } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { fetchCostBreakdown, fetchMaintenanceStats, type CostBreakdownRow, type CostGroupBy, type MaintenanceStatsRow } from "../../lib/maintenanceStats";
import { formatMoney } from "@rbp/module-task-family/src/lib/money.ts";

const FMT = "YYYY-MM-DD";

export const MaintenanceStatistics = () => {
  const { t, i18n } = useTranslation();
  const { has } = usePermissions();
  const showCost = has("costs.view");
  // Parts from stock: an amount (costs.view) about spare parts (items.view).
  const showItems = showCost && has("items.view");
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(12, "month").add(1, "day"), dayjs()]);
  const [root, setRoot] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<CostGroupBy>("asset");
  const [supplier, setSupplier] = useState<string | undefined>();
  const [team, setTeam] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<string | undefined>();
  const { data: taskTypes } = useTaskTypes();
  // Supplier and month views are about cost: they need costs.view.
  const grouped = showCost && groupBy !== "asset";

  const { data: suppliers } = useSuppliers();
  const { data: statRows, isLoading: loadingStats } = useQuery({
    queryKey: ["maintenance-stats", range[0].format(FMT), range[1].format(FMT), root ?? null],
    queryFn: () => fetchMaintenanceStats(range[0].format(FMT), range[1].format(FMT), root),
    enabled: !grouped,
  });
  const { data: groupRows, isLoading: loadingGroups } = useQuery({
    queryKey: ["maintenance-stats", "breakdown", groupBy, range[0].format(FMT), range[1].format(FMT), root ?? null, supplier ?? null],
    queryFn: () => fetchCostBreakdown(range[0].format(FMT), range[1].format(FMT), groupBy, root, supplier),
    enabled: grouped,
  });
  const rows = grouped ? groupRows : statRows;
  const isLoading = grouped ? loadingGroups : loadingStats;

  const exportCsv = () => {
    if (grouped) {
      const label = groupBy === "supplier" ? t("costs.supplier") : t("statistics.month");
      const lines = (groupRows ?? []).map((r) => [r.group_label || t("statistics.noSupplier"), r.items, r.amount]);
      return download([[label, t("statistics.items"), `${t("statistics.externalCost")} EUR`], ...lines]);
    }
    const head = [t("fields.asset"), t("statistics.tasksDone"), t("statistics.corrective"), t("statistics.workHours"), t("statistics.downtimeHours"), ...(showCost ? [`${t("statistics.externalCost")} EUR`] : []), ...(showItems ? [`${t("statistics.partsCost")} EUR`] : [])];
    const lines = (statRows ?? []).map((r) => [r.asset_name, r.tasks_done, r.corrective_tasks, r.work_hours, r.downtime_hours, ...(showCost ? [r.external_cost] : []), ...(showItems ? [r.items_cost] : [])]);
    download([head, ...lines]);
  };

  const download = (all: (string | number)[][]) => {
    const csv = all.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance-statistics-${range[0].format(FMT)}_${range[1].format(FMT)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const num = (a: number, b: number) => a - b;
  return (
    <Page
      title={t("statistics.title")}
      hint={t("statistics.hint")}
      headerButtons={
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!rows?.length}>
          {t("statistics.export")}
        </Button>
      }
    >
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker
          allowClear={false}
          value={range}
          onChange={(v) => v?.[0] && v?.[1] && setRange([v[0], v[1]])}
          presets={[
            { label: t("statistics.last12"), value: [dayjs().subtract(12, "month").add(1, "day"), dayjs()] },
            { label: t("statistics.thisYear"), value: [dayjs().startOf("year"), dayjs()] },
          ]}
        />
        {showCost && (
          <Segmented
            value={groupBy}
            onChange={(v) => setGroupBy(v as CostGroupBy)}
            options={[
              { value: "asset", label: t("statistics.byAsset") },
              { value: "supplier", label: t("statistics.bySupplier") },
              { value: "month", label: t("statistics.byMonth") },
            ]}
          />
        )}
        {showCost && (
          <Select allowClear showSearch value={supplier} onChange={setSupplier} placeholder={t("statistics.allSuppliers")} optionFilterProp="label" options={(suppliers ?? []).map((x) => ({ value: x.id, label: x.name }))} style={{ width: 200 }} />
        )}
        <AssetSelect value={root} onChange={(v) => setRoot(v ?? undefined)} placeholder={t("statistics.area")} style={{ width: 280 }} />
      </Space>
      {grouped ? (
        <Table<CostBreakdownRow>
          size="small"
          rowKey="group_key"
          loading={isLoading}
          dataSource={groupRows}
          locale={{ emptyText: t("statistics.empty") }}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          columns={[
            { title: groupBy === "supplier" ? t("costs.supplier") : t("statistics.month"), dataIndex: "group_label", render: (v: string) => v || <Typography.Text type="secondary">{t("statistics.noSupplier")}</Typography.Text> },
            { title: t("statistics.items"), dataIndex: "items", align: "right" },
            { title: t("statistics.externalCost"), dataIndex: "amount", align: "right", render: (v: number) => formatMoney(v, i18n.language) },
          ]}
          summary={(data) =>
            data.length > 1 ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Typography.Text strong>Σ</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><Typography.Text strong>{data.reduce((s, r) => s + r.items, 0)}</Typography.Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><Typography.Text strong>{formatMoney(data.reduce((s, r) => s + r.amount, 0), i18n.language)}</Typography.Text></Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
      ) : (
      <Table<MaintenanceStatsRow>
        size="small"
        rowKey="asset_id"
        loading={isLoading}
        dataSource={statRows}
        locale={{ emptyText: t("statistics.empty") }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        columns={[
          { title: t("fields.asset"), dataIndex: "asset_name", render: (v: string, r) => <Link to={`/assets/${r.asset_id}`}>{v}</Link> },
          { title: t("statistics.tasksDone"), dataIndex: "tasks_done", align: "right", sorter: (a, b) => num(a.tasks_done, b.tasks_done) },
          { title: t("statistics.corrective"), dataIndex: "corrective_tasks", align: "right", sorter: (a, b) => num(a.corrective_tasks, b.corrective_tasks) },
          { title: t("statistics.workHours"), dataIndex: "work_hours", align: "right", sorter: (a, b) => num(a.work_hours, b.work_hours) },
          { title: t("statistics.downtimeHours"), dataIndex: "downtime_hours", align: "right", sorter: (a, b) => num(a.downtime_hours, b.downtime_hours) },
          ...(showCost
            ? [
                {
                  title: t("statistics.externalCost"),
                  dataIndex: "external_cost",
                  align: "right" as const,
                  defaultSortOrder: "descend" as const,
                  sorter: (a: MaintenanceStatsRow, b: MaintenanceStatsRow) => num(a.external_cost, b.external_cost),
                  render: (v: number) => formatMoney(v, i18n.language),
                },
              ]
            : []),
          ...(showItems
            ? [
                {
                  title: <Tooltip title={t("statistics.partsCostHint")}>{t("statistics.partsCost")}</Tooltip>,
                  dataIndex: "items_cost",
                  align: "right" as const,
                  sorter: (a: MaintenanceStatsRow, b: MaintenanceStatsRow) => num(a.items_cost, b.items_cost),
                  render: (v: number) => formatMoney(v, i18n.language),
                },
              ]
            : []),
        ]}
        summary={(data) =>
          data.length > 1 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <Typography.Text strong>Σ</Typography.Text>
              </Table.Summary.Cell>
              {[
                data.reduce((s, r) => s + r.tasks_done, 0),
                data.reduce((s, r) => s + r.corrective_tasks, 0),
                data.reduce((s, r) => s + r.work_hours, 0),
                Math.round(data.reduce((s, r) => s + r.downtime_hours, 0) * 10) / 10,
              ].map((v, i) => (
                <Table.Summary.Cell key={i} index={i + 1} align="right">
                  <Typography.Text strong>{v}</Typography.Text>
                </Table.Summary.Cell>
              ))}
              {showCost && (
                <Table.Summary.Cell index={5} align="right">
                  <Typography.Text strong>{formatMoney(data.reduce((s, r) => s + r.external_cost, 0), i18n.language)}</Typography.Text>
                </Table.Summary.Cell>
              )}
              {showItems && (
                <Table.Summary.Cell index={6} align="right">
                  <Typography.Text strong>{formatMoney(data.reduce((s, r) => s + r.items_cost, 0), i18n.language)}</Typography.Text>
                </Table.Summary.Cell>
              )}
            </Table.Summary.Row>
          ) : null
        }
      />
      )}
      <Typography.Title level={4} style={{ marginTop: 32 }}>{t("punctuality.title")}</Typography.Title>
      <Space wrap style={{ marginBottom: 12 }}>
        <TeamSelect value={team} onChange={setTeam} style={{ width: 200 }} />
        <Select allowClear showSearch optionFilterProp="label" value={taskType} onChange={setTaskType} placeholder={t("fields.taskType")} style={{ width: 200 }} options={sortByName(taskTypes).map((x) => ({ value: x.id, label: localName(x) }))} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("punctuality.sameFilters")}</Typography.Text>
      </Space>
      <PunctualityPanel
        scope={{ from: range[0].format(FMT), to: range[1].format(FMT), assetId: root ?? null, teamId: team, taskTypeId: taskType ?? null }}
        breakdown
        breakdownLabel={t("punctuality.series")}
      />
    </Page>
  );
};
