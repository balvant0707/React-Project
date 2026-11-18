// Ported 1:1 from COMPASS (app/src/pages/recurring/list.tsx).
import { usePermissions } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { SortButton } from "@rbp/core";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTable } from "@rbp/core";
import { App as AntdApp, Button, Popconfirm, Space, Switch, Table, Tag, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from "@ant-design/icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useHasModule } from "../../lib/modules";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { RuleFormModal, SCHEDULE_KINDS, type RuleRow } from "./ruleForm";
import { scheduleLabel } from "./schedule";
import { errorText } from "@rbp/core";

type OverviewRow = RuleRow & {
  task_type_name: string;
  asset_name: string | null;
  team_name: string | null;
  assigned_user_name: string | null;
  open_task_count: number;
};

const whoLabel = (t: TFunction, r: OverviewRow) => {
  if (r.assignment_mode === "user") return r.assigned_user_name ?? "—";
  if (r.assignment_mode === "rotate") return t("recurring.rotateLabel", { team: r.team_name ?? "—" });
  return r.team_name ?? "—";
};

// Recurring task rules: what is done how often, on which asset, and by whom (team, person or rotation).
export const RecurringList = () => {
  const hasAssets = useHasModule("assets");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  // "Generate now" is operation: admins only (recurring_tasks_run_now checks it too).
  const { admin } = usePermissions();
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const { tableProps, filters, setFilters, sorters, setSorters, tableQuery } = useTable<OverviewRow>({
    resource: "recurring_task_rules_overview",
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: [{ field: "next_due_date", order: "asc" }] },
  });

  const filterDefs: ListFilterDef[] = [
    { kind: "text", key: "search", label: t("common.search"), fields: ["name", "asset_name"] },
    { kind: "select", key: "kind", label: t("recurring.kind"), field: "schedule_kind", options: SCHEDULE_KINDS.map((k) => ({ value: k, label: t(`recurring.kinds.${k}`) })) },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);

  const toggleActive = async (r: OverviewRow, active: boolean) => {
    const { error } = await supabaseClient.from("recurring_task_rules").update({ active }).eq("id", r.id);
    if (error) message.error(errorText(error));
    await tableQuery.refetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("recurring_task_rules").delete().eq("id", id);
    if (error) message.error(errorText(error));
    await tableQuery.refetch();
  };

  const runNow = async () => {
    const { data, error } = await supabaseClient.rpc("recurring_tasks_run_now");
    if (error) message.error(errorText(error));
    else message.success(t("recurring.generated", { count: data as number }));
    await tableQuery.refetch();
  };

  return (
    <List
      hint={t("recurring.hint")}
      headerButtons={
        <>
          {filterBar.picker}
          {isMobile && (
            <SortButton
              options={[
                { key: "nextDue", label: t("common.sortOptions.nextDue"), field: "next_due_date", order: "asc" },
                { key: "name", label: t("common.sortOptions.name"), field: "name", order: "asc" },
              ]}
              sorters={sorters}
              onChange={setSorters}
            />
          )}
          {admin && (
            <Tooltip title={t("recurring.runNowHint")}>
              <Button icon={<PlayCircleOutlined />} onClick={runNow}>
                {t("recurring.runNow")}
              </Button>
            </Tooltip>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
            {t("recurring.new")}
          </Button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>{filterBar.chips}</div>
      {filterBar.modal}
      <Table<OverviewRow> {...tableProps} rowKey="id" scroll={{ x: true }}>
        <Table.Column dataIndex="name" title={t("fields.title")} sorter />
        <Table.Column title={t("recurring.schedule")} render={(_, r: OverviewRow) => scheduleLabel(t, r)} />
        <Table.Column
          dataIndex="next_due_date"
          title={t("recurring.nextDue")}
          sorter
          render={(v, r: OverviewRow) =>
            r.schedule_kind === "operating_hours" ? t("recurring.byHours") : v ? formatDate(v) : <Tag>{t("recurring.waitingForCompletion")}</Tag>
          }
        />
        {hasAssets && <Table.Column dataIndex="asset_name" title={t("fields.asset")} render={(v) => v ?? "—"} />}
        <Table.Column title={t("recurring.who")} render={(_, r: OverviewRow) => whoLabel(t, r)} />
        <Table.Column
          dataIndex="open_task_count"
          title={t("recurring.openTasks")}
          render={(n: number, r: OverviewRow) =>
            n > 0 ? <a onClick={() => navigate(`/tasks?filters[0][field]=recurring_task_rule_id&filters[0][operator]=eq&filters[0][value]=${r.id}`)}>{n}</a> : 0
          }
        />
        <Table.Column
          dataIndex="active"
          title={t("fields.active")}
          render={(v: boolean, r: OverviewRow) => (
            <Space>
              <Switch size="small" checked={v} onChange={(checked) => toggleActive(r, checked)} />
              {r.last_error && (
                <Tooltip title={r.last_error}>
                  <Tag color="red">{t("recurring.error")}</Tag>
                </Tooltip>
              )}
            </Space>
          )}
        />
        <Table.Column
          title={t("common.actions")}
          width={110}
          render={(_, r: OverviewRow) => (
            <>
              <Button icon={<EditOutlined />} type="text" onClick={() => setEditing(r)} />
              <Popconfirm title={t("recurring.deleteConfirm")} onConfirm={() => remove(r.id)}>
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </>
          )}
        />
      </Table>
      <RuleFormModal
        open={editing !== null}
        rule={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void tableQuery.refetch();
        }}
      />
    </List>
  );
};
