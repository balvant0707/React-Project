// Ported 1:1 from the NPM tool (app/src/pages/orders/list.tsx).
import { useEffect, useState } from "react";
import { useTable } from "@rbp/core";
import { useGetIdentity } from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Tag, Button, Dropdown, Space, Switch, theme } from "antd";
import { PlusOutlined, DownOutlined, MessageFilled, MailFilled, ClockCircleOutlined } from "@ant-design/icons";
import type { CrudFilters } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { attachmentsColumn, notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { formatDate } from "@rbp/ui";
import dayjs from "dayjs";
import { userTimeZone } from "@rbp/ui";
import { formatNumber } from "@rbp/ui";
import { useNotesPanel, useListNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { DEAL_STATUS_COLOR, DEAL_STATUS_LEGEND } from "./statusColor";
import { usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";
import { ListTable, ListColumn } from "@rbp/ui";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { loadCompanyOptionsWithGroupByIds, searchCompanyOptionsWithGroup } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { NewSeastockOfferModal } from "../specifications/newSeastockOfferModal";

// "Offers & Orders": one row per deal (view deals_overview, migration 20261023160000). An order is a row of its own
// (and carries its offer's number); a Seastock offer is a row until it has a live order. DD / NB specifications are
// not listed until they became an order (they stay on the Specifications page).

type DealRow = {
  id: string;
  kind: "offer" | "order";
  deal_number: string | null;
  specification_number: string | null;
  specification_version: number | null;
  deal_type: "SS" | "DD" | "NB" | "OTHER" | string;
  status_code: string;
  status_label: string;
  vessel_name: string | null;
  customer_name: string | null;
  team_name: string | null;
  supplier_name: string | null;
  responsible_user_id: string | null;
  responsible_user_name: string | null;
  amount: number | null;
  currency: string | null;
  deal_date: string | null;
  has_attachments: boolean;
  has_messages: boolean;
  assigned_team_id: string | null;
  has_unread_notes: boolean;
  has_unread_emails: boolean;
  request_received_at: string | null;
  sent_at: string | null;
  invoiced_at: string | null;
};

// "2d 4h", "3h 20m", "15m": elapsed time between two instants (the end defaults to now).
function formatElapsed(fromIso: string, toIso: string | null): string {
  const minutes = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// The end of a calendar day (a plain date) in the user's time zone, as an ISO instant.
const deliveryDayEnd = (date: string) => (dayjs as any).tz(date, userTimeZone()) /* platform: the dayjs timezone typings do not reach this file */.endOf("day").toISOString();

// Elapsed time, still running (no end yet) in the warning colour with a clock.
const Elapsed = ({ from, to, runningColor }: { from: string; to: string | null; runningColor: string }) =>
  to ? (
    <span>{formatElapsed(from, to)}</span>
  ) : (
    <span style={{ color: runningColor }} title="Still running">
      <ClockCircleOutlined /> {formatElapsed(from, null)}
    </span>
  );

const TYPE_LABEL: Record<string, string> = { SS: "Seastock", DD: "Dry dock", NB: "Newbuilding", OTHER: "Other" };
const CLOSED_STATUS_CODES = ["invoiced", "cancelled", "lost"];
const NO_STATUS_COLOR = "#d7d7d7";
const statusColor = (r: DealRow) => DEAL_STATUS_COLOR[r.status_code] ?? NO_STATUS_COLOR;

const StatusLegend = () => (
  <Space size={[16, 4]} wrap style={{ marginBottom: 8, fontSize: 12 }}>
    {DEAL_STATUS_LEGEND.map(({ code, label }) => (
      <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 4, height: 14, background: DEAL_STATUS_COLOR[code], borderRadius: 1 }} />
        {label}
      </span>
    ))}
  </Space>
);

const pathOf = (r: DealRow) => (r.kind === "order" ? `/orders/${r.id}` : `/specifications/${r.id}`);

export const OrderList = () => {
  const navigate = useNavigate();
  const [newSeastockOpen, setNewSeastockOpen] = useState(false);
  const { token } = theme.useToken();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { openEntity, listNotesActive, effectiveEntity } = useNotesPanel();
  useListNotes();
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    loadUserOptions().then(setUserOptions);
  }, []);

  const [teamIds, setTeamIds] = useState<string[]>([]);
  useEffect(() => {
    if (!identity?.id) return;
    supabaseClient
      .from("user_teams")
      .select("team_id")
      .eq("user_id", identity.id)
      .then(({ data }) => setTeamIds((data ?? []).map((r: any) => r.team_id)));
  }, [identity?.id]);

  const { tableProps, filters, setFilters } = useTable<DealRow>({
    resource: "deals_overview",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });
  usePageBannerSubtitle(listCountSubtitle("offers and orders", tableProps.pagination));

  const entityOf = (r: DealRow) => ({
    type: (r.kind === "order" ? "orders" : "specifications") as "orders" | "specifications",
    id: r.id,
    label: [r.deal_number, r.vessel_name].filter(Boolean).join(" · ") || undefined,
  });
  // With the Notes panel on, a click selects the row's notes (ctrl/cmd-click opens it); else it opens the record.
  const onRow = (r: DealRow) => {
    const selected = effectiveEntity?.id === r.id;
    return {
      style: {
        cursor: "pointer" as const,
        boxShadow: `inset 4px 0 0 0 ${statusColor(r)}`,
        background: listNotesActive && selected ? token.colorPrimaryBg : undefined,
      },
      onClick: (e: React.MouseEvent) => (listNotesActive && !e.ctrlKey && !e.metaKey ? openEntity(entityOf(r)) : navigate(pathOf(r))),
    };
  };

  // "Mine" is derived from the responsible_user_id filter, so it never drifts from the chip.
  const mineValue = filters.find((f) => "field" in f && f.field === "responsible_user_id" && f.operator === "in")?.value;
  const isMine = !!identity?.id && Array.isArray(mineValue) && mineValue.length === 1 && mineValue[0] === identity.id;
  const toggleMine = (checked: boolean) =>
    setFilters([{ field: "responsible_user_id", operator: "in", value: checked && identity?.id ? [identity.id] : undefined }]);

  // "My teams": records assigned to one of my groups. "Unread": a note or email thread of the record is unread for me.
  const teamValue = filters.find((f) => "field" in f && f.field === "assigned_team_id" && f.operator === "in")?.value;
  const isMyTeams = Array.isArray(teamValue) && teamValue.length > 0;
  const toggleMyTeams = (checked: boolean) =>
    setFilters([{ field: "assigned_team_id", operator: "in", value: checked ? teamIds : undefined }]);
  const isUnreadOnly = filters.some((f) => f.operator === "or" && (f as { key?: string }).key === "unread" && Array.isArray(f.value) && f.value.length > 0);
  const toggleUnread = (checked: boolean) =>
    setFilters([
      {
        operator: "or",
        key: "unread",
        value: checked
          ? [
              { field: "has_unread_notes", operator: "eq", value: true },
              { field: "has_unread_emails", operator: "eq", value: true },
            ]
          : [],
      },
    ] as CrudFilters);

  // "Hide closed": invoiced, cancelled and lost drop out of the list (own `nin` filter, independent of the Status chip).
  const hideClosed = filters.some((f) => "field" in f && f.field === "status_code" && f.operator === "nin");
  const toggleHideClosed = (checked: boolean) =>
    setFilters([{ field: "status_code", operator: "nin", value: checked ? CLOSED_STATUS_CODES : undefined }]);

  const filterDefs: ListFilterDef[] = [
    { key: "responsible_user_id", label: "Responsible", kind: "select", field: "responsible_user_id", options: userOptions },
    {
      key: "kind",
      label: "Offer / Order",
      kind: "select",
      field: "kind",
      options: [
        { value: "offer", label: "Offers" },
        { value: "order", label: "Orders" },
      ],
    },
    {
      key: "deal_type",
      label: "Type",
      kind: "select",
      field: "deal_type",
      options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
    },
    {
      key: "status_code",
      label: "Status",
      kind: "select",
      field: "status_code",
      options: [
        { value: "draft", label: "Offer: Draft" },
        { value: "under_review", label: "Offer: Under review" },
        { value: "approved", label: "Offer: Approved" },
        { value: "accepted", label: "Offer: Accepted" },
        { value: "lost", label: "Offer: Lost" },
        { value: "confirmed", label: "Order: Confirmed" },
        { value: "delivered", label: "Order: Delivered" },
        { value: "invoiced", label: "Order: Invoiced" },
        { value: "cancelled", label: "Order: Cancelled" },
      ],
    },
    { key: "vessel_name", label: "Vessel", kind: "text", fields: ["vessel_name"] },
    // Written by the company page links ("Show Offers & Orders" / "Show Orders").
    { key: "customer_company_id", label: "Customer company", kind: "select", field: "customer_company_id", loadOptions: (term: string) => searchCompanyOptionsWithGroup(term, "customer"), loadLabels: loadCompanyOptionsWithGroupByIds },
    { key: "supplier_id", label: "Supplier", kind: "select", field: "supplier_id", loadOptions: (term: string) => searchCompanyOptionsWithGroup(term, "supplier"), loadLabels: loadCompanyOptionsWithGroupByIds },
    { key: "customer_name", label: "Customer", kind: "text", fields: ["customer_name"] },
    { key: "team_name", label: "Owner Associate", kind: "text", fields: ["team_name"] },
    { key: "deal_date", label: "Date", kind: "dateRange", field: "deal_date" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={
        <Space wrap>
          {filterBar.picker}
          <Switch checked={isMine} onChange={toggleMine} disabled={!identity?.id} />
          <span>Mine</span>
          <Switch checked={isMyTeams} onChange={toggleMyTeams} disabled={teamIds.length === 0} />
          <span>My teams</span>
          <Switch checked={isUnreadOnly} onChange={toggleUnread} />
          <span>Unread</span>
          <Switch checked={hideClosed} onChange={toggleHideClosed} />
          <span>Hide closed</span>
          <Dropdown
            menu={{
              items: [
                { key: "seastock-offer", label: "Seastock offer" },
                { key: "order", label: "Order" },
              ],
              onClick: ({ key }) => (key === "order" ? navigate("/orders/new") : setNewSeastockOpen(true)),
            }}
          >
            <Button type="primary" icon={<PlusOutlined />}>
              New <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      }
    >
      {filterBar.modal}
      <NewSeastockOfferModal open={newSeastockOpen} onClose={() => setNewSeastockOpen(false)} />
      <StatusLegend />
      <ListTable<DealRow> {...tableProps} rowKey="id" onRow={onRow}>
        <ListColumn<DealRow> minWidth={150} dataIndex="deal_number" title="Number" sorter />
        <ListColumn<DealRow>
          minWidth={110}
          dataIndex="kind"
          title="Offer / Order"
          sorter
          render={(_, r) => <Tag color={r.kind === "order" ? "blue" : "default"}>{r.kind === "order" ? "Order" : "Offer"}</Tag>}
        />
        <ListColumn<DealRow> minWidth={110} dataIndex="deal_type" title="Type" sorter render={(v) => TYPE_LABEL[v] ?? v} />
        <ListColumn<DealRow>
          minWidth={150}
          title="Offer"
          render={(_, r) => (r.kind === "order" && r.specification_number ? `${r.specification_number} - v${r.specification_version}` : r.kind === "offer" ? `v${r.specification_version}` : "-")}
        />
        <ListColumn<DealRow> minWidth={180} dataIndex="vessel_name" title="Vessel" sorter />
        <ListColumn<DealRow> minWidth={180} dataIndex="customer_name" title="Customer" sorter />
        <ListColumn<DealRow> minWidth={100} dataIndex="team_name" title="Owner Associate" sorter />
        <ListColumn<DealRow> minWidth={160} dataIndex="supplier_name" title="Supplier" sorter />
        <ListColumn<DealRow> minWidth={140} dataIndex="responsible_user_name" title="Responsible" sorter />
        <ListColumn<DealRow>
          minWidth={120}
          dataIndex="amount"
          title="Amount"
          sorter
          align="right"
          render={(v, r) => (v == null ? "-" : `${formatNumber(v)}${r.currency ? ` ${r.currency}` : ""}`)}
        />
        <ListColumn<DealRow>
          title=""
          width={60}
          render={(_, r) =>
            r.has_unread_notes || r.has_unread_emails ? (
              <Space size={4} style={{ color: token.colorPrimary }}>
                {r.has_unread_notes && <MessageFilled title="Unread notes" />}
                {r.has_unread_emails && <MailFilled title="Unread emails" />}
              </Space>
            ) : null
          }
        />
        <ListColumn<DealRow>
          minWidth={120}
          title="Request → sent"
          render={(_, r) =>
            r.request_received_at ? <Elapsed from={r.request_received_at} to={r.sent_at} runningColor={token.colorWarning} /> : "-"
          }
        />
        <ListColumn<DealRow>
          minWidth={130}
          title="Delivery → invoiced"
          render={(_, r) =>
            // Orders only (deal_date = the requested delivery date, end of the window), counted from the end of that day in
            // the user's time zone.
            r.kind === "order" && r.deal_date && deliveryDayEnd(r.deal_date) <= new Date().toISOString() && r.status_code !== "cancelled" ? (
              <Elapsed from={deliveryDayEnd(r.deal_date)} to={r.invoiced_at} runningColor={token.colorError} />
            ) : (
              "-"
            )
          }
        />
        {notesColumn<DealRow>((r) => openEntity(entityOf(r)))}
        {attachmentsColumn<DealRow>()}
        <ListColumn dataIndex="deal_date" title="Date" sorter render={formatDate} />
      </ListTable>
    </List>
  );
};
