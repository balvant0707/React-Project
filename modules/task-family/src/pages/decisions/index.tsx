// Ported 1:1 from COMPASS (app/src/pages/decisions/index.tsx).
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { App as AntdApp, Badge, Button, Card, Empty, Input, List as AntList, Modal, Space, Spin, Table, Tabs, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Page } from "@rbp/core";
import { DecisionCardBody } from "../../components/decisionCards";
import { DECISIONS_KEY, useDecidedByMe, useDecisions, useMyRequests, type DecidedRow, type DecisionRow, type MyRequestRow } from "../../hooks/useDecisions";
import type { StepAction } from "../../lib/domain";
import { actionColor, actionLabel, isNegativeAction } from "@rbp/module-tasks/src/lib/routing.ts";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { formatDate, formatDateTime } from "@rbp/ui";
import { useIsMobile } from "@rbp/ui";
import { supabaseClient } from "@rbp/core";
import { errorText } from "@rbp/core";
import { usePurposeInvalidate } from "../../modules/purposes";

// "To decide": every task waiting for the signed-in user's decision (view tasks_to_decide). A decision is made with
// one click; one that needs a comment asks for it, one with open required items of the step or that ends the task opens
// the task page.
// On a phone a decision asks again first. The card of a task type with a special function shows what matters for it.
export const DecisionsPage = () => {
  const { t, i18n } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidatePurpose = usePurposeInvalidate();
  const { data: rows, isLoading } = useDecisions();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "decide";
  const { data: requests, isLoading: requestsLoading } = useMyRequests(tab === "requests");
  const { data: decided, isLoading: decidedLoading } = useDecidedByMe(tab === "decided");
  const [pending, setPending] = useState<{ row: DecisionRow; action: StepAction } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  // Open required checklist items of the step are filled in on the task page (its action dialog asks for them).
  const needsFields = (row: DecisionRow, action: StepAction) => row.step_open_required > 0 && !isNegativeAction(action);

  const perform = async (row: DecisionRow, action: StepAction, text: string | null) => {
    setBusy(true);
    const { error } = await supabaseClient.rpc("task_perform_action", { p_task_id: row.id, p_action_key: action.key, p_comment: text });
    setBusy(false);
    if (error) {
      message.error(errorText(error));
      return false;
    }
    // A decision on a task with a special function also changes that module's lists and numbers.
    invalidatePurpose(row.purpose);
    for (const key of [DECISIONS_KEY[0], "dashboard", "task", "tasks", "data", "feed"]) await queryClient.invalidateQueries({ queryKey: [key] });
    return true;
  };

  const decide = (row: DecisionRow, action: StepAction) => {
    // Fields and the questions of the task page (hours, items, open subtasks when it ends) are asked on the task page.
    // A task type with a special function (leave) asks none of them when it ends, so it is decided here.
    if (needsFields(row, action) || (action.to === null && !row.purpose)) {
      navigate(`/tasks/${row.id}`);
      return;
    }
    if (action.requires_comment) {
      setComment("");
      setPending({ row, action });
      return;
    }
    if (isMobile) {
      modal.confirm({
        title: `${actionLabel(t, i18n.language, action)}: #${row.task_number}`,
        content: row.title,
        okText: actionLabel(t, i18n.language, action),
        onOk: () => perform(row, action, null),
      });
      return;
    }
    void perform(row, action, null);
  };

  const decideTab = (
    <>
      {isLoading ? (
        <Spin />
      ) : !rows?.length ? (
        <Empty description={t("decisions.none")} />
      ) : (
        <AntList
          grid={{ gutter: 16, xs: 1, md: 1, xl: 2 }}
          dataSource={rows}
          renderItem={(row) => (
            <AntList.Item>
              <Card size="small" title={<Link to={`/tasks/${row.id}`}>#{row.task_number} {row.title}</Link>} extra={<Tag>{pickName(row.task_type_name, row.task_type_name_de)}</Tag>}>
                <DecisionCardBody row={row} />
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    {(row.step_actions ?? []).map((a) => (
                      <Button key={a.key} loading={busy} danger={actionColor(a) === "red"} type={actionColor(a) === "green" ? "primary" : "default"} onClick={() => decide(row, a)}>
                        {actionLabel(t, i18n.language, a)}
                      </Button>
                    ))}
                    <Typography.Text type="secondary">{pickName(row.current_step_name ?? "", row.current_step_name_de ?? "")}</Typography.Text>
                  </Space>
                </div>
              </Card>
            </AntList.Item>
          )}
        />
      )}
    </>
  );

  const requestsTab = (
    <>
      <Typography.Paragraph type="secondary">{t("decisions.requestsHint")}</Typography.Paragraph>
      <Table<MyRequestRow>
        rowKey="id"
        loading={requestsLoading}
        dataSource={requests ?? []}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: t("decisions.requestsNone") }}
        columns={[
          { title: t("fields.title"), render: (_, r) => <Link to={`/tasks/${r.id}`}>#{r.task_number} {r.title}</Link> },
          { title: t("fields.taskType"), render: (_, r) => pickName(r.task_type_name, r.task_type_name_de) },
          { title: t("fields.status"), render: (_, r) => <StatusTag status={r.status} /> },
          {
            title: t("decisions.with"),
            render: (_, r) =>
              ["done", "cancelled"].includes(r.status)
                ? "—"
                : (r.with_user_name ?? r.with_team_name ?? pickName(r.with_role_name, r.with_role_name_de)) || "—",
          },
          { title: t("decisions.step"), render: (_, r) => (r.awaiting_decision ? <Tag color="orange">{pickName(r.current_step_name ?? "", r.current_step_name_de ?? "")}</Tag> : pickName(r.current_step_name ?? "", r.current_step_name_de ?? "") || "—") },
          { title: t("decisions.since"), render: (_, r) => (["done", "cancelled"].includes(r.status) ? formatDate(r.completed_at) : formatDateTime(r.in_step_since)) },
        ]}
      />
    </>
  );

  const decidedTab = (
    <Table<DecidedRow>
      rowKey="id"
      loading={decidedLoading}
      dataSource={decided ?? []}
      pagination={{ pageSize: 20, hideOnSinglePage: true }}
      locale={{ emptyText: t("decisions.decidedNone") }}
      columns={[
        { title: t("fields.title"), render: (_, r) => <Link to={`/tasks/${r.task_id}`}>#{r.task_number} {r.title}</Link> },
        { title: t("fields.taskType"), render: (_, r) => pickName(r.task_type_name, r.task_type_name_de) },
        { title: t("decisions.decision"), render: (_, r) => <Tag color={actionColor(r.action)}>{actionLabel(t, i18n.language, r.action)}</Tag> },
        { title: t("fields.comment"), dataIndex: "comment", render: (v: string | null) => v ?? "—" },
        { title: t("decisions.decidedAt"), render: (_, r) => formatDateTime(r.decided_at) },
      ]}
    />
  );

  return (
    <Page title={t("decisions.title")} hint={t("decisions.hint")}>
      <Tabs
        activeKey={tab}
        onChange={(key) => setParams(key === "decide" ? {} : { tab: key }, { replace: true })}
        items={[
          { key: "decide", label: <Badge count={rows?.length ?? 0} size="small" offset={[8, -2]}>{t("decisions.tabDecide")}</Badge>, children: decideTab },
          { key: "requests", label: t("decisions.tabRequests"), children: requestsTab },
          { key: "decided", label: t("decisions.tabDecided"), children: decidedTab },
        ]}
      />
      <Modal
        open={!!pending}
        title={pending ? `${actionLabel(t, i18n.language, pending.action)}: #${pending.row.task_number}` : ""}
        confirmLoading={busy}
        okButtonProps={{ disabled: !comment.trim() }}
        onCancel={() => setPending(null)}
        onOk={async () => {
          if (pending && (await perform(pending.row, pending.action, comment.trim()))) setPending(null);
        }}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">{t("decisions.commentRequired")}</Typography.Paragraph>
        <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
      </Modal>
    </Page>
  );
};
