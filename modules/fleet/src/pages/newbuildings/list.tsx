// Ported 1:1 from the NPM tool (app/src/pages/newbuildings/list.tsx).
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useTable } from "@rbp/core";
import { useCanAccess as useCan} from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Tooltip, Button, Typography, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useListRowProps, rowLabel, useListKeyNav, attachmentsColumn, notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { formatDate } from "@rbp/ui";
import { loadCompanyOptionsWithGroupByIds, searchCompanyOptionsWithGroup } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { loadDistinctShipTypeGroups } from "../../modules/vessels/vessels";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { ListTable, ListColumn } from "@rbp/ui";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { HULL_EVENT_STATUS_HEX } from "../hullEvents/statusOptions";
import { NEWBUILDING_PROJECT_STATUS_OPTIONS } from "./statusOptions";
import { ProjectFormModal } from "./projectFormModal";
import { useNotesPanel, useListNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { usePageBannerTitle, usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.newbuilding_projects) => fieldLabel("newbuilding_projects", field);

// Newbuilding projects (~/npm_tool/docs/domain-model.md): the bid for a series of newbuilt vessels. Read from their own view; the
// newbuilding hull events of the individual vessels are listed on the project's page and in the Hull Events list.
type ProjectRow = {
  id: string;
  title: string;
  status: string | null;
  lost_reason: string | null;
  created_at: string;
  bidding_date: string | null;
  shipyard_name: string | null;
  shipyard_company_country: string | null;
  customer_name: string | null;
  customer_company_country: string | null;
  maker_names: string | null;
  estimated_contract_value: number | null;
  estimated_contract_value_currency: string | null;
  cash_rebate: number | null;
  ship_type: string | null;
  customer_sales_account_user_name: string | null;
  shipyard_sales_account_user_name: string | null;
  customer_sales_account_user_tenant_name: string | null;
  shipyard_sales_account_user_tenant_name: string | null;
  first_delivery_date: string | null;
  own_maker_on_makers_list: boolean;
  sales_account_user_name: string | null;
  hull_event_count: number;
  has_attachments: boolean;
  has_messages: boolean;
};

const withCountry = (name: string | null, country: string | null) => (name ? (country ? `${name}, ${country}` : name) : "—");

// A company cell: "name, country", then the company's sales rep's default tenant and the rep ("NPMEU | Ugur Akbati").
const companyCell = (name: string | null, country: string | null, repTenant: string | null, rep: string | null) => {
  const associates = [repTenant, rep].filter(Boolean).join(" | ");
  if (!name && !associates) return <span style={{ color: "#aaa" }}>—</span>;
  return (
    <div>
      <div>{withCountry(name, country)}</div>
      {associates && (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {associates}
        </Typography.Text>
      )}
    </div>
  );
};

const amount = (value: number | null, currency: string | null) =>
  value == null ? "—" : `${value.toLocaleString()}${currency ? ` ${currency}` : ""}`;

export const NewbuildingList = () => {
  const navigate = useNavigate();
  const { data: canCreate } = useCan({ resource: "newbuildings", action: "create" });
  const { openEntity } = useNotesPanel();
  useListNotes();
  const listRowProps = useListRowProps<ProjectRow>(navigate, "/newbuildings", "newbuilding_projects");
  const { tableProps, setFilters, filters } = useTable<ProjectRow>({
    resource: "newbuilding_projects_overview",
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });
  useListKeyNav(tableProps.dataSource, "newbuilding_projects");
  // Only the hero says "Newbuilding Projects"; the sidebar entry keeps the shorter resource label "Newbuilding".
  usePageBannerTitle("Newbuilding Projects");
  usePageBannerSubtitle(listCountSubtitle("newbuilding projects", tableProps.pagination));

  const [shipTypeOptions, setShipTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    loadUserOptions().then(setUserOptions);
    loadDistinctShipTypeGroups().then(setShipTypeOptions);
  }, []);

  const customerSearch = {
    loadOptions: (term: string) => searchCompanyOptionsWithGroup(term, "customer"),
    loadLabels: loadCompanyOptionsWithGroupByIds,
  };
  const shipyardSearch = {
    loadOptions: (term: string) => searchCompanyOptionsWithGroup(term, "shipyard"),
    loadLabels: loadCompanyOptionsWithGroupByIds,
  };
  const anyCompanySearch = {
    loadOptions: (term: string) => searchCompanyOptionsWithGroup(term),
    loadLabels: loadCompanyOptionsWithGroupByIds,
  };
  const filterDefs: ListFilterDef[] = [
    { key: "title", label: L("title"), kind: "text", fields: ["title"] },
    { key: "status", label: L("status"), kind: "select", field: "status", options: NEWBUILDING_PROJECT_STATUS_OPTIONS },
    { key: "ship_type", label: L("ship_type"), kind: "select", field: "ship_type", options: shipTypeOptions },
    { key: "customer", label: L("customer_name"), kind: "select", field: "customer_company_id", ...customerSearch },
    { key: "shipyard", label: L("shipyard_company_id"), kind: "select", field: "shipyard_company_id", ...shipyardSearch },
    { key: "owner_associate", label: L("owner_associate_name"), kind: "select", field: "owner_associate_company_id", ...anyCompanySearch },
    { key: "sales_account_user_id", label: L("sales_account_user_id"), kind: "select", field: "sales_account_user_id", options: userOptions },
    { key: "bidding_date", label: L("bidding_date"), kind: "dateRange", field: "bidding_date" },
    { key: "estimated_contract_value", label: L("estimated_contract_value"), kind: "numberRange", field: "estimated_contract_value" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={
        <Space wrap>
          {filterBar.picker}
          {canCreate?.can && (
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setCreateOpen(true)}>
              New Newbuilding Project
            </Button>
          )}
        </Space>
      }
    >
      {filterBar.modal}

      <ListTable<ProjectRow>
        {...tableProps}
        rowKey="id"
        onRow={listRowProps}
      >
        <ListColumn<ProjectRow>
          minWidth={160}
          title={L("title")}
          dataIndex="title"
          sorter
          // The status color strip, as on the Hull Events list (same colors).
          onCell={(record) => ({
            style: { boxShadow: `inset 4px 0 0 0 ${HULL_EVENT_STATUS_HEX[record.status ?? "Not set"] ?? "#d9d9d9"}` },
          })}
          render={(v: string, record) => (
            <Tooltip title={record.status ?? "Not set"}>
              <div>
                <strong>{v}</strong>
                {record.status === "Lost" && record.lost_reason && (
                  <div>
                    <Typography.Text type="danger" style={{ fontSize: 11 }}>
                      Lost: {record.lost_reason}
                    </Typography.Text>
                  </div>
                )}
              </div>
            </Tooltip>
          )}
        />
        <ListColumn<ProjectRow> minWidth={120} title={L("ship_type")} dataIndex="ship_type" sorter render={(v: string | null) => v ?? "—"} />
        <ListColumn<ProjectRow>
          minWidth={180}
          title={L("customer_name")}
          dataIndex="customer_name"
          sorter
          render={(v: string | null, record) =>
            companyCell(v, record.customer_company_country, record.customer_sales_account_user_tenant_name, record.customer_sales_account_user_name)
          }
        />
        <ListColumn<ProjectRow>
          minWidth={180}
          title={L("shipyard_company_id")}
          dataIndex="shipyard_name"
          sorter
          render={(v: string | null, record) =>
            companyCell(v, record.shipyard_company_country, record.shipyard_sales_account_user_tenant_name, record.shipyard_sales_account_user_name)
          }
        />
        <ListColumn<ProjectRow> minWidth={120} title={L("bidding_date")} dataIndex="bidding_date" sorter render={formatDate} />
        <ListColumn<ProjectRow>
          minWidth={170}
          title={L("estimated_contract_value")}
          dataIndex="estimated_contract_value"
          align="right"
          sorter
          render={(_, record) => amount(record.estimated_contract_value, record.estimated_contract_value_currency)}
        />
        <ListColumn<ProjectRow>
          minWidth={120} title={L("cash_rebate")}
          dataIndex="cash_rebate"
          align="right"
          sorter
          render={(_, record) => amount(record.cash_rebate, record.estimated_contract_value_currency)}
        />
        <ListColumn<ProjectRow> minWidth={140} title={L("maker_names")} dataIndex="maker_names" render={(v: string | null) => v ?? "—"} />
        <ListColumn<ProjectRow>
          minWidth={150} title={L("own_maker_on_makers_list")}
          dataIndex="own_maker_on_makers_list"
          sorter
          render={(v: boolean) => (v ? "Yes" : "No")}
        />
        <ListColumn<ProjectRow>
          minWidth={120} title={L("first_delivery_date")}
          dataIndex="first_delivery_date"
          sorter
          render={(v: string | null) => (v ? dayjs(v).format("MMM YYYY") : "—")}
        />
        <ListColumn<ProjectRow>
          minWidth={110} title={L("hull_event_count")}
          dataIndex="hull_event_count"
          align="right"
          sorter
          render={(v: number) => (v > 0 ? v : <span style={{ color: "#aaa" }}>None yet</span>)}
        />
        <ListColumn<ProjectRow> minWidth={110} title={L("sales_account_user_id")} dataIndex="sales_account_user_name" render={(v: string | null) => v ?? "—"} />
        {notesColumn<ProjectRow>((r) => openEntity({ type: "newbuilding_projects", id: r.id, label: rowLabel("newbuilding_projects", r) }))}
        {attachmentsColumn<ProjectRow>()}
      </ListTable>

      <ProjectFormModal open={createOpen} project={null} onClose={() => setCreateOpen(false)} onSaved={(id) => navigate(`/newbuildings/${id}`)} />
    </List>
  );
};
