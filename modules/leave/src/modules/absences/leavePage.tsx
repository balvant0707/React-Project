// Ported 1:1 from COMPASS (app/src/modules/absences/leavePage.tsx).
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { App as AntdApp, Badge, Button, Popconfirm, Statistic, Table, Tabs, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { Page } from "@rbp/core";
import { LeavePlanner } from "./planner";
import { LeaveRequestModal } from "./requestModal";
import { useMe } from "@rbp/core";
import { useInvalidateLeave, useLeavePending, useLeaveViolations, useMyLeave, useMyLeaveYears, type LeavePending } from "./useLeave";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { usePermissions } from "@rbp/core";
import { LEAVE_STATUS_COLOR, canWithdraw, formatDays, groupViolations, type LeaveRequest, type ViolationPeriod } from "./leave";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { AbsenceTypeLabel } from "./absenceTypeLabel";

export const LeavePage = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const invalidate = useInvalidateLeave();
  const [params, setParams] = useSearchParams();
  const { userId } = useMe();
  const { has } = usePermissions();
  const { data: people } = usePeople();
  const { data: requests, isLoading } = useMyLeave(userId);
  const { data: years } = useMyLeaveYears(userId);
  const { data: violations } = useLeaveViolations();
  const { data: pending } = useLeavePending();
  const [modal, setModal] = useState<{ range?: [string, string]; forUserId?: string } | null>(null);
  const today = dayjs().format("YYYY-MM-DD");
  const tab = params.get("tab") ?? "planner";

  const refresh = invalidate;

  const withdraw = async (r: LeaveRequest) => {
    const { error } = await supabaseClient.rpc("leave_request_withdraw", { p_leave_request_id: r.id });
    if (error) return void message.error(errorText(error));
    message.success(t("leave.withdrawn"));
    refresh();
  };

  const thisYear = dayjs().year();
  // Leave days per year: the types that count as leave, added up.
  const yearRows = Object.values(
    (years ?? [])
      .filter((y) => y.counts_as_leave && y.year >= thisYear - 1)
      .reduce<Record<number, { year: number; approved_days: number; requested_days: number }>>((acc, y) => {
        const row = (acc[y.year] ??= { year: y.year, approved_days: 0, requested_days: 0 });
        row.approved_days += Number(y.approved_days);
        row.requested_days += Number(y.requested_days);
        return acc;
      }, {}),
  );
  const nameOf = (id: string | null) => personName(people?.find((p) => p.id === id));

  const mineTab = (
    <>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 16 }}>
        {yearRows.map((y) => (
          <Statistic
            key={y.year}
            title={t("leave.inYear", { year: y.year })}
            value={formatDays(y.approved_days)}
            suffix={y.requested_days > 0 ? <Typography.Text type="secondary" style={{ fontSize: 14 }}>{t("leave.plusRequested", { days: formatDays(y.requested_days) })}</Typography.Text> : undefined}
          />
        ))}
      </div>
      <Typography.Paragraph type="secondary">{t("leave.noEntitlement")}</Typography.Paragraph>
      <Table<LeaveRequest>
        rowKey="id"
        loading={isLoading}
        dataSource={requests ?? []}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          {
            title: t("leave.period"),
            render: (_, r) => (
              <Link to={`/tasks/${r.task_id}`}>
                {formatDate(r.from_date)}{r.start_half ? ` (${t("leave.fromMidday")})` : ""} – {formatDate(r.to_date)}{r.end_half ? ` (${t("leave.untilMidday")})` : ""}
              </Link>
            ),
          },
          { title: t("leave.days"), dataIndex: "working_days", render: (n: number) => formatDays(n) },
          { title: t("leave.kind"), dataIndex: "absence_type_id", render: (id: string) => <AbsenceTypeLabel id={id} /> },
          { title: t("leave.status"), dataIndex: "status", render: (s: LeaveRequest["status"]) => <Tag color={LEAVE_STATUS_COLOR[s]}>{t(`leave.statuses.${s}`)}</Tag> },
          {
            title: "",
            align: "right",
            render: (_, r) =>
              canWithdraw(r, today) ? (
                <Popconfirm title={t("leave.withdrawConfirm")} okText={t("leave.withdraw")} onConfirm={() => withdraw(r)}>
                  <Button size="small">{t("leave.withdraw")}</Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />
    </>
  );

  const approvalsTab = (
    <>
      <Typography.Paragraph type="secondary">{t("leave.approvalsHint")}</Typography.Paragraph>
      <Table<LeavePending>
        rowKey="id"
        dataSource={pending ?? []}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: t("leave.approvalsNone") }}
        columns={[
          { title: t("leave.planner.person"), render: (_, r) => nameOf(r.user_id) },
          {
            title: t("leave.period"),
            render: (_, r) => (
              <Link to={`/tasks/${r.task_id}`}>
                {formatDate(r.from_date)}{r.start_half ? ` (${t("leave.fromMidday")})` : ""} – {formatDate(r.to_date)}{r.end_half ? ` (${t("leave.untilMidday")})` : ""}
              </Link>
            ),
          },
          { title: t("leave.days"), dataIndex: "working_days", render: (n: number) => formatDays(n) },
          { title: "", align: "right", render: (_, r) => <Link to={`/tasks/${r.task_id}`}>{t("leave.decide")}</Link> },
        ]}
      />
    </>
  );

  const violationsTab = (
    <>
      <Typography.Paragraph type="secondary">{t("leave.rule.listHint")}</Typography.Paragraph>
      <Table<ViolationPeriod>
        rowKey={(r) => `${r.team_id}:${r.from}`}
        dataSource={groupViolations(violations ?? [])}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: t("leave.rule.none") }}
        columns={[
          { title: t("leave.rule.team"), dataIndex: "team_name" },
          { title: t("leave.period"), render: (_, r) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} – ${formatDate(r.to)}`) },
          { title: t("leave.rule.load"), render: (_, r) => t("leave.rule.loadValue", { away: formatDays(r.maxAway), size: r.team_size, allowed: r.allowed }) },
          { title: t("leave.rule.awayPeople"), render: (_, r) => r.user_ids.map(nameOf).join(", ") },
        ]}
      />
    </>
  );

  return (
    <Page
      title={t("leave.title")}
      headerButtons={has("leave.create.created") ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({})}>{t("leave.request")}</Button> : undefined}
    >
      <Tabs
        activeKey={tab}
        onChange={(k) => setParams(k === "planner" ? {} : { tab: k })}
        items={[
          { key: "planner", label: t("leave.tabs.planner"), children: <LeavePlanner onRequest={(range, forUserId) => has("leave.create.created") && setModal({ range, forUserId })} /> },
          ...((pending?.length ?? 0) > 0
            ? [{ key: "approvals", label: <Badge count={pending?.length ?? 0} size="small" offset={[8, -2]}>{t("leave.tabs.approvals")}</Badge>, children: approvalsTab }]
            : []),
          { key: "mine", label: t("leave.tabs.mine"), children: mineTab },
          ...((violations?.length ?? 0) > 0 || has("leave.view.all")
            ? [{ key: "violations", label: <Badge count={violations?.length ?? 0} size="small" offset={[8, -2]}>{t("leave.tabs.violations")}</Badge>, children: violationsTab }]
            : []),
        ]}
      />
      <LeaveRequestModal open={!!modal} initialRange={modal?.range} forUserId={modal?.forUserId} onClose={() => setModal(null)} onSaved={refresh} />
    </Page>
  );
};
