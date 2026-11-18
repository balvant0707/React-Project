// Ported 1:1 from the NPM tool (app/src/pages/companies/list.tsx).
import { useEffect, useState } from "react";
// Platform: the main "new" action as COMPASS does it (round + button on a phone).
import { NewButton } from "@rbp/core";
import { useTable } from "@rbp/core";
import { useGetIdentity } from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Table, Tag, Switch, Space, Tooltip, Typography } from "antd";
import { CrownFilled } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  useListRowProps,
  rowLabel,
  useListKeyNav,
  attachmentsColumn,
  notesColumn,
} from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { ENTITY_CONFIG } from "@rbp/module-fleet/src/entityTypes.ts";
import { buildVesselCompanyRoleUrl, buildCompanyRolesFilterUrl, NP_FILTER } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { useCompanyVesselTotals } from "../../utils/useCompanyVesselTotals";
import { useColumnVisibility } from "@rbp/ui";
import { ManageColumnsButton } from "@rbp/ui";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { NameSearchInput } from "@rbp/core";
import { useNotesPanel, useListNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { loadPhraseOptions } from "@rbp/core";
import { loadDistinctShipTypeGroups } from "../../modules/vessels/vessels";
import {
  loadCompanyOptionsWithGroupByIds,
  loadDistinctCountries,
  searchCompanyOptionsWithGroup,
  type CompanyOption,
} from "@rbp/module-companies/src/modules/companies/companies.ts";
import { loadUserOptions, type UserOption } from "@rbp/module-companies/src/modules/users/users.ts";
import { usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";
import { ResponsiveList } from "@rbp/core";
import { ListTable } from "@rbp/ui";

const config = ENTITY_CONFIG.companies;
const currentYear = dayjs().year();
const L = (field: keyof typeof FIELD_LABELS.companies) => fieldLabel("companies", field);

const ROLE_COLOR: Record<string, string> = {
  customer: "blue",
  supplier: "green",
  maker: "gold",
  dealer: "purple",
  shipyard: "cyan",
  facilitating_partner: "magenta",
};

// Matches Superset's "Group Owner Account Status" table's own colored-text
// treatment for this column (not a Tag/badge) - see
// Screenshots old system/superset/Screenshot 2026-09-07 163528.png.
const ACCOUNT_STATUS_COLOR: Record<string, string> = {
  Target: "#ffc000",
  Develop: "#2d3844",
  "Low-fit": "#b6b090",
};
const NO_STATUS_COLOR = "#d7d7d7";

// Small legend above the table for the row-color strip (the strip itself is on the Name cell).
const AccountStatusLegend = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginBottom: 8, fontSize: 12 }}>
    {Object.entries(ACCOUNT_STATUS_COLOR).map(([label, color]) => (
      <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 4, height: 14, background: color, borderRadius: 1 }} />
        {label}
      </span>
    ))}
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 4, height: 14, background: NO_STATUS_COLOR, borderRadius: 1 }} />
      Not set
    </span>
  </div>
);

// The three survey-due-year columns' labels shift every year (DD '26, DD
// '27, ...) so they're computed here rather than a static registry.
const SURVEY_YEAR_COLUMNS = [
  { key: "survey_due_count_y0", label: `DD '${String(currentYear).slice(-2)}`, year: currentYear },
  { key: "survey_due_count_y1", label: `DD '${String(currentYear + 1).slice(-2)}`, year: currentYear + 1 },
  { key: "survey_due_count_y2", label: `DD '${String(currentYear + 2).slice(-2)}`, year: currentYear + 2 },
] as const;

// Fixed vocabulary (countries.region's own check constraint - see
// 20260922140000_country_region.sql), not phrase-backed, so no server call.
const REGION_OPTIONS: CompanyOption[] = [
  { value: "EUX", label: "Europe (excl. Greece)" },
  { value: "GRE", label: "Greece" },
  { value: "MET", label: "Middle East / Turkey" },
];
const REGION_LABEL: Record<string, string> = Object.fromEntries(REGION_OPTIONS.map((o) => [o.value, o.label]));

// Order here is also the ManageColumnsButton picker's order, and (for the
// ones on by default) the table's render order below - see
// DEFAULT_VISIBLE_COLUMNS.
const OPTIONAL_COLUMNS = [
  { key: "unique_vessel_count", label: L("unique_vessel_count") },
  { key: "vessel_count", label: L("vessel_count") },
  { key: "technical_manager_vessel_count", label: L("technical_manager_vessel_count") },
  { key: "operator_vessel_count", label: L("operator_vessel_count") },
  { key: "dwt_sum", label: L("dwt_sum") },
  { key: "awg_dwt", label: L("awg_dwt") },
  { key: "np_now_count", label: L("np_now_count") },
  ...SURVEY_YEAR_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
  { key: "short_code", label: L("short_code") },
  { key: "roles", label: L("roles") },
  { key: "city_country", label: `${L("city")} / ${L("country")}` },
  { key: "region", label: L("region") },
  { key: "group_company_name", label: L("group_company_id") },
  { key: "np_nb_count", label: L("np_nb_count") },
  { key: "np_now_pct", label: L("np_now_pct") },
];
const ALL_OPTIONAL_KEYS = OPTIONAL_COLUMNS.map((c) => c.key);
// Name isn't in this list at all - it's a fixed column, always shown (its
// account status is the color strip on the cell; Status stays a filter).
const DEFAULT_VISIBLE_COLUMNS = [
  "unique_vessel_count",
  "vessel_count",
  "technical_manager_vessel_count",
  "operator_vessel_count",
  "dwt_sum",
  "awg_dwt",
  "np_now_count",
  "survey_due_count_y0",
  "survey_due_count_y1",
  "survey_due_count_y2",
];

// Every column gets an explicit width and the table runs table-layout: fixed.
// With the sticky header antd renders the header and the body as two separate
// tables; under the default auto layout each sizes itself independently (header
// to its labels, body to its cells), so the headers drift out of line with the
// columns. Fixed widths make both tables agree. Keep these in step with the
// SHORT_LABEL abbreviations, which exist to keep the columns narrow.
const COLUMN_WIDTH: Record<string, number> = {
  name: 300,
  // Platform: wide enough for the two-number cells ("110975 | 9") on one line.
  unique_vessel_count: 140,
  vessel_count: 140,
  technical_manager_vessel_count: 140,
  operator_vessel_count: 140,
  dwt_sum: 110,
  awg_dwt: 100,
  np_now_count: 100,
  survey_due_count_y0: 95,
  survey_due_count_y1: 95,
  survey_due_count_y2: 95,
  roles: 200,
  short_code: 90,
  city_country: 200,
  region: 160,
  group_company_name: 240,
  np_nb_count: 95,
  np_now_pct: 100,
};
// The notes + attachments icon columns (utils/tableFilter.tsx), 36px each.
const ICON_COLUMNS_WIDTH = 72;

// Abbreviated header text; the full label shows as a tooltip. Columns not
// listed (Name, Country, DD 'yy) already have a short label.
const SHORT_LABEL: Record<string, string> = {
  account_status_label: "Status",
  vessel_count: "Own #",
  technical_manager_vessel_count: "Mgd #",
  operator_vessel_count: "Opd #",
  dwt_sum: "Σ DWT",
  awg_dwt: "Avg DWT",
  short_code: "Code",
  city_country: "City / Ctry",
  group_company_name: "Group",
};
const colTitle = (key: string, full: string) =>
  SHORT_LABEL[key] ? <Tooltip title={full}>{SHORT_LABEL[key]}</Tooltip> : full;

type CompanyRow = {
  id: string;
  name: string;
  short_code: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  roles: string[];
  group_company_id: string | null;
  group_company_name: string | null;
  sales_account_user_id: string | null;
  sales_account_user_name: string | null;
  account_status_label: string | null;
  has_attachments: boolean;
  has_messages: boolean;
  vessel_count: number;
  technical_manager_vessel_count: number;
  operator_vessel_count: number;
  unique_vessel_count: number;
  np_technical_manager_vessel_count: number;
  np_operator_vessel_count: number;
  np_unique_vessel_count: number;
  dwt_sum: number | null;
  dwt_average: number | null;
  np_now_count: number;
  np_nb_count: number;
  survey_due_count_y0: number;
  survey_due_count_y1: number;
  survey_due_count_y2: number;
  is_group_company: boolean;
  is_group_parent: boolean;
};

// The vessel counts on this list are per company: a group parent counts its whole
// group, a subsidiary or standalone company only its own vessels (see
// 20261002110000_companies_vessel_rollup_own_vs_group.sql). A count's link opens
// the vessel list filtered to "assigned to the company or its subsidiaries" for
// that role (VESSEL_COMPANY_ROLES), the same set for every company.

// "Vessels | of which Nippon Paint applied", the same pair as the company page's
// big numbers (components/companyVesselRoleStats.tsx), read from the
// materialized companies_vessel_rollup. Each number links to the vessel list
// filtered the way it was counted; a zero stays plain text (empty list behind it).
const NpPair = ({ total, np, totalUrl, npUrl }: { total: number; np: number; totalUrl: string; npUrl: string }) => {
  const navigate = useNavigate();
  const link = (count: number, url: string) =>
    count > 0 ? (
      <a
        onClick={(e) => {
          e.stopPropagation();
          navigate(url);
        }}
      >
        {count}
      </a>
    ) : (
      <span>{count}</span>
    );
  return (
    <>
      {link(total, totalUrl)}
      <span style={{ margin: "0 6px", opacity: 0.45 }}>|</span>
      <Tooltip title="Of these, vessels with Nippon Paint currently applied">{link(np, npUrl)}</Tooltip>
    </>
  );
};

export const CompanyList = () => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  useListNotes();
  const listRowProps = useListRowProps<CompanyRow>(navigate, config.listPath!, "companies");
  const { tableProps, filters, setFilters, sorters, setSorters, setCurrentPage } = useTable<CompanyRow>({
    resource: "companies_overview",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
    sorters: { initial: [{ field: "dwt_sum", order: "desc" }] },
    filters: {
      initial: [
        { field: "is_group_company", operator: "eq", value: true },
      ],
    },
  });
  useListKeyNav(tableProps.dataSource, "companies");
  const totals = useCompanyVesselTotals(filters);
  const countSubtitle = listCountSubtitle("companies", tableProps.pagination);
  usePageBannerSubtitle(
    countSubtitle
      ? [
          countSubtitle,
          totals ? `Number of ships owned: ${totals.owned.toLocaleString()}` : null,
          totals ? `currently with Nippon: ${totals.npOwned.toLocaleString()}` : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : undefined,
  );
  const { data: identity } = useGetIdentity<{ id: string }>();

  const [groupsOnly, setGroupsOnly] = useState(true);
  const [visibleColumns, setVisibleColumns] = useColumnVisibility(
    "npmeu-columns-companies-v3",
    ALL_OPTIONAL_KEYS,
    DEFAULT_VISIBLE_COLUMNS,
  );

  const tableWidth =
    COLUMN_WIDTH.name +
    visibleColumns.reduce((sum, key) => sum + (COLUMN_WIDTH[key] ?? 0), 0) +
    ICON_COLUMNS_WIDTH;

  const [accountStatusOptions, setAccountStatusOptions] = useState<CompanyOption[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [countryOptions, setCountryOptions] = useState<CompanyOption[]>([]);
  const [shipTypeOptions, setShipTypeOptions] = useState<CompanyOption[]>([]);

  useEffect(() => {
    // account_status_label is already the resolved text (joined in
    // companies_overview), not a phrase id - so the filter's options need
    // the label as both value and label, not loadPhraseOptions' normal
    // {value: id, label: text} shape (that's for FK-bound form selects).
    loadPhraseOptions("company_account_status").then((opts) =>
      setAccountStatusOptions(opts.map((o) => ({ value: o.label, label: o.label }))),
    );
    loadUserOptions().then(setUserOptions);
    loadDistinctCountries().then(setCountryOptions);
    loadDistinctShipTypeGroups().then(setShipTypeOptions);
  }, []);

  // setFilters merges rather than replaces - clearing a filter (switching a
  // toggle/range back off) means explicitly setting its value to undefined,
  // not omitting it from the array.
  const toggleGroupsOnly = (checked: boolean) => {
    setGroupsOnly(checked);
    setFilters([{ field: "is_group_company", operator: "eq", value: checked ? true : undefined }]);
  };

  // "My Companies" is derived straight from the active sales_account_user_id
  // filter (the same field the "Sales Rep" filter chip below already uses,
  // same "in" operator) rather than held as separate state - so it can never
  // drift out of sync with that chip. Switching this on/off and adding/
  // removing the Sales Rep chip by hand both land in exactly the same place.
  const myCompaniesFilterValue = filters.find((f) => "field" in f && f.field === "sales_account_user_id" && f.operator === "in")?.value;
  const isMyCompanies =
    !!identity?.id && Array.isArray(myCompaniesFilterValue) && myCompaniesFilterValue.length === 1 && myCompaniesFilterValue[0] === identity.id;
  const toggleMyCompanies = (checked: boolean) =>
    setFilters([{ field: "sales_account_user_id", operator: "in", value: checked && identity?.id ? [identity.id] : undefined }]);

  // Filters are added via the "Add filter" picker + modal (see
  // components/listFilterBar.tsx).
  const filterDefs: ListFilterDef[] = [
    { key: "name", label: L("name"), kind: "text", fields: ["name"] },
    { key: "account_status_label", label: L("account_status_label"), kind: "select", field: "account_status_label", options: accountStatusOptions },
    { key: "short_code", label: L("short_code"), kind: "text", fields: ["short_code"] },
    { key: "city", label: L("city"), kind: "text", fields: ["city"] },
    { key: "country", label: L("country"), kind: "select", field: "country", options: countryOptions },
    { key: "region", label: L("region"), kind: "select", field: "region", options: REGION_OPTIONS },
    {
      key: "group_company_id",
      label: L("group_company_id"),
      kind: "select",
      field: "group_company_id",
      // Searched on the server as the user types (tens of thousands of companies).
      loadOptions: (term) => searchCompanyOptionsWithGroup(term),
      loadLabels: loadCompanyOptionsWithGroupByIds,
    },
    { key: "sales_account_user_id", label: L("sales_account_user_id"), kind: "select", field: "sales_account_user_id", options: userOptions },
    // Not a column: the data provider turns it into the companies_list() argument, so the vessel counts, DWT sums and
    // NP numbers of every row (and the total row) only cover vessels of the chosen types.
    { key: "ship_type_groups", label: L("ship_type_group"), kind: "select", field: "ship_type_groups", options: shipTypeOptions },
    { key: "vessel_count", label: L("vessel_count"), kind: "numberRange", field: "vessel_count" },
    { key: "dwt_sum", label: L("dwt_sum"), kind: "numberRange", field: "dwt_sum" },
    { key: "dwt_average", label: L("awg_dwt"), kind: "numberRange", field: "dwt_average" },
    { key: "np_nb_count", label: L("np_nb_count"), kind: "numberRange", field: "np_nb_count" },
    { key: "np_now_count", label: L("np_now_count"), kind: "numberRange", field: "np_now_count" },
    ...SURVEY_YEAR_COLUMNS.map(
      (c): ListFilterDef => ({ key: c.key, label: c.label, kind: "numberRange", field: c.key }),
    ),
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={
        <Space wrap>
          <NameSearchInput filters={filters} setFilters={setFilters} placeholder="Search name" />
          {filterBar.picker}
          <Switch checked={isMyCompanies} onChange={toggleMyCompanies} disabled={!identity?.id} />
          <span>My Companies</span>
          <Switch checked={groupsOnly} onChange={toggleGroupsOnly} />
          <span>Group companies</span>
          <ManageColumnsButton options={OPTIONAL_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} />
          <NewButton label={`New ${config.label}`} onClick={() => navigate(`${config.listPath}/new`)} />
        </Space>
      }
    >
      {filterBar.modal}
      <AccountStatusLegend />
      <ResponsiveList<CompanyRow>
          tableProps={tableProps}
          sort={{
            options: [
              { value: "name", label: "Name" },
              { value: "unique_vessel_count", label: "Ships" },
              { value: "dwt_sum", label: "Σ DWT" },
              { value: "np_unique_vessel_count", label: "Ships with Nippon" },
            ],
            sorters,
            setSorters,
            setCurrentPage,
          }}
          onOpen={(row) => navigate(`${config.listPath}/${row.id}`)}
          render={(r) => ({
            accent: ACCOUNT_STATUS_COLOR[r.account_status_label ?? ""] ?? NO_STATUS_COLOR,
            title: r.name,
            subtitle: [r.country, r.sales_account_user_name].filter(Boolean).join(" | ") || undefined,
            tags: r.account_status_label ? <Tag>{r.account_status_label}</Tag> : undefined,
            footer: `Ships ${r.unique_vessel_count} (Nippon ${r.np_unique_vessel_count}) | Σ DWT ${r.dwt_sum != null ? r.dwt_sum.toLocaleString("en-US") : "—"}`,
          })}
      >
      {() => (
        <>
        <ListTable<CompanyRow>
          {...tableProps}
          rowKey="id"
          tableLayout="fixed"
          scroll={{ x: tableWidth }}
          onRow={listRowProps}
          summary={() => {
            if (!totals) return null;
            const pair = (total: number, np: number) => `${total.toLocaleString()} | ${np.toLocaleString()}`;
            const cells: Record<string, string> = {
              vessel_count: pair(totals.owned, totals.npOwned),
              technical_manager_vessel_count: pair(totals.managed, totals.npManaged),
              operator_vessel_count: pair(totals.operated, totals.npOperated),
              np_now_count: totals.npOwned.toLocaleString(),
              np_nb_count: totals.npNb.toLocaleString(),
              survey_due_count_y0: totals.surveyY0.toLocaleString(),
              survey_due_count_y1: totals.surveyY1.toLocaleString(),
              survey_due_count_y2: totals.surveyY2.toLocaleString(),
            };
            // Same left-to-right order as the columns below. Ships (unique_vessel_count), average DWT and
            // the NP share and the DWT total are left blank: a vessel held by several listed companies would be counted twice.
            const order = [
              "unique_vessel_count", "vessel_count", "technical_manager_vessel_count", "operator_vessel_count",
              "dwt_sum", "awg_dwt", "np_now_count", ...SURVEY_YEAR_COLUMNS.map((c) => c.key),
              "roles", "short_code", "city_country", "region", "group_company_name", "np_nb_count", "np_now_pct",
            ].filter((key) => visibleColumns.includes(key));
            return (
              <Table.Summary fixed="bottom">
                <Table.Summary.Row style={{ fontWeight: 600, fontSize: 13 }}>
                  <Table.Summary.Cell index={0}>
                    Total ({tableProps.pagination ? tableProps.pagination.total?.toLocaleString() : ""} companies)
                  </Table.Summary.Cell>
                  {order.map((key, i) => (
                    <Table.Summary.Cell key={key} index={i + 1} align={cells[key] ? "right" : undefined}>
                      {cells[key] ?? ""}
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={order.length + 1} />
                  <Table.Summary.Cell index={order.length + 2} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        >
          {/* is_group_parent (has at least one subsidiary), not is_group_company:
              the latter is true for every standalone company too, so the
              "Group companies" toggle's rows alone can't tell the two apart. */}
          <Table.Column<CompanyRow>
            dataIndex="name"
            title={L("name")}
            width={COLUMN_WIDTH.name}
            sorter
            // Status color strip on the cell's own box-shadow (see hullEvents/list.tsx for why not the row).
            onCell={(r) => ({
              style: { boxShadow: `inset 4px 0 0 0 ${ACCOUNT_STATUS_COLOR[r.account_status_label ?? ""] ?? NO_STATUS_COLOR}` },
            })}
            render={(v: string, r) => (
              <div>
                <div>
                  {v}
                  {r.is_group_parent && (
                    <Tooltip title="Group company (has subsidiaries)">
                      <CrownFilled style={{ color: "#faad14", marginLeft: 6 }} />
                    </Tooltip>
                  )}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {[r.country, r.sales_account_user_name].filter(Boolean).join(" | ") || "—"}
                </Typography.Text>
              </div>
            )}
          />
          {visibleColumns.includes("unique_vessel_count") && (
            <Table.Column<CompanyRow>
              dataIndex="unique_vessel_count"
              title={colTitle("unique_vessel_count", L("unique_vessel_count"))}
              width={COLUMN_WIDTH.unique_vessel_count}
              align="right"
              sorter
              render={(v: number, r) => (
                <NpPair
                  total={v}
                  np={r.np_unique_vessel_count}
                  totalUrl={buildCompanyRolesFilterUrl(r.id)}
                  npUrl={buildCompanyRolesFilterUrl(r.id, [NP_FILTER])}
                />
              )}
            />
          )}
          {visibleColumns.includes("vessel_count") && (
            <Table.Column<CompanyRow>
              dataIndex="vessel_count"
              title={colTitle("vessel_count", L("vessel_count"))}
              width={COLUMN_WIDTH.vessel_count}
              align="right"
              sorter
              render={(v: number, r) => (
                <NpPair
                  total={v}
                  np={r.np_now_count}
                  totalUrl={buildVesselCompanyRoleUrl("owner", r.id)}
                  npUrl={buildVesselCompanyRoleUrl("owner", r.id, [NP_FILTER])}
                />
              )}
            />
          )}
          {visibleColumns.includes("technical_manager_vessel_count") && (
            <Table.Column<CompanyRow>
              dataIndex="technical_manager_vessel_count"
              title={colTitle("technical_manager_vessel_count", L("technical_manager_vessel_count"))}
              width={COLUMN_WIDTH.technical_manager_vessel_count}
              align="right"
              sorter
              render={(v: number, r) => (
                <NpPair
                  total={v}
                  np={r.np_technical_manager_vessel_count}
                  totalUrl={buildVesselCompanyRoleUrl("technicalManager", r.id)}
                  npUrl={buildVesselCompanyRoleUrl("technicalManager", r.id, [NP_FILTER])}
                />
              )}
            />
          )}
          {visibleColumns.includes("operator_vessel_count") && (
            <Table.Column<CompanyRow>
              dataIndex="operator_vessel_count"
              title={colTitle("operator_vessel_count", L("operator_vessel_count"))}
              width={COLUMN_WIDTH.operator_vessel_count}
              align="right"
              sorter
              render={(v: number, r) => (
                <NpPair
                  total={v}
                  np={r.np_operator_vessel_count}
                  totalUrl={buildVesselCompanyRoleUrl("operator", r.id)}
                  npUrl={buildVesselCompanyRoleUrl("operator", r.id, [NP_FILTER])}
                />
              )}
            />
          )}
          {visibleColumns.includes("dwt_sum") && (
            <Table.Column<CompanyRow>
              dataIndex="dwt_sum"
              title={colTitle("dwt_sum", L("dwt_sum"))}
              width={COLUMN_WIDTH.dwt_sum}
              align="right"
              sorter
              render={(v: number | null) => (v != null ? v.toLocaleString() : "—")}
            />
          )}
          {visibleColumns.includes("awg_dwt") && (
            <Table.Column<CompanyRow>
              title={colTitle("awg_dwt", L("awg_dwt"))}
              width={COLUMN_WIDTH.awg_dwt}
              dataIndex="dwt_average"
              align="right"
              sorter
              render={(v: number | null) => (v != null ? v.toLocaleString() : "—")}
            />
          )}
          {visibleColumns.includes("np_now_count") && (
            <Table.Column<CompanyRow>
              dataIndex="np_now_count"
              title={colTitle("np_now_count", L("np_now_count"))}
              width={COLUMN_WIDTH.np_now_count}
              align="right"
              sorter
            />
          )}
          {SURVEY_YEAR_COLUMNS.map(({ key, label, year }) =>
            visibleColumns.includes(key) ? (
              <Table.Column<CompanyRow>
                key={key}
                dataIndex={key}
                title={label}
                width={COLUMN_WIDTH[key]}
                align="right"
                sorter
                render={(v: number, r) => (
                  <a
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        buildVesselCompanyRoleUrl("owner", r.id, [
                          { field: "docking_survey_date", operator: "gte", value: `${year}-01-01` },
                          { field: "docking_survey_date", operator: "lt", value: `${year + 1}-01-01` },
                        ]),
                      );
                    }}
                  >
                    {v}
                  </a>
                )}
              />
            ) : null,
          )}
          {/* No filter here: roles is a Postgres text[] column, and
              PostgREST's `in` operator (what a select filter maps to through
              Refine's standard CrudOperators) can't target array types at all
              - confirmed live: `roles=in.(supplier)` returns
              42704 "could not find array type for data type text[]". Refine's
              supabase provider has no array-contains operator, so this would
              need a DB-side change (e.g. per-role boolean columns on the view)
              to ever be filterable - not something to fake with a broken
              filter icon. */}
          {visibleColumns.includes("roles") && (
            <Table.Column<CompanyRow>
              title={L("roles")}
              width={COLUMN_WIDTH.roles}
              dataIndex="roles"
              render={(roles: string[]) => (roles ?? []).map((role) => <Tag key={role} color={ROLE_COLOR[role]}>{role}</Tag>)}
            />
          )}
          {visibleColumns.includes("short_code") && (
            <Table.Column<CompanyRow> dataIndex="short_code" title={colTitle("short_code", L("short_code"))} width={COLUMN_WIDTH.short_code} />
          )}
          {visibleColumns.includes("city_country") && (
            <Table.Column<CompanyRow>
              title={colTitle("city_country", `${L("city")} / ${L("country")}`)}
              width={COLUMN_WIDTH.city_country}
              dataIndex="city"
              render={(_, r) => [r.city, r.country].filter(Boolean).join(" / ") || "—"}
            />
          )}
          {visibleColumns.includes("region") && (
            <Table.Column<CompanyRow>
              dataIndex="region"
              title={L("region")}
              width={COLUMN_WIDTH.region}
              render={(v: string | null) => v ? (REGION_LABEL[v] ?? v) : "—"}
            />
          )}
          {visibleColumns.includes("group_company_name") && (
            <Table.Column<CompanyRow>
              title={colTitle("group_company_name", L("group_company_id"))}
              width={COLUMN_WIDTH.group_company_name}
              dataIndex="group_company_id"
              render={(_, r) => r.group_company_name ?? "—"}
            />
          )}
          {visibleColumns.includes("np_nb_count") && (
            <Table.Column<CompanyRow>
              dataIndex="np_nb_count"
              title={colTitle("np_nb_count", L("np_nb_count"))}
              width={COLUMN_WIDTH.np_nb_count}
              align="right"
              sorter
            />
          )}
          {visibleColumns.includes("np_now_pct") && (
            <Table.Column<CompanyRow>
              title={colTitle("np_now_pct", L("np_now_pct"))}
              width={COLUMN_WIDTH.np_now_pct}
              align="right"
              render={(_, r) => (r.unique_vessel_count > 0 ? `${((r.np_now_count / r.unique_vessel_count) * 100).toFixed(1)}%` : "—")}
            />
          )}
          {notesColumn<CompanyRow>((r) => openEntity({ type: "companies", id: r.id, label: rowLabel("companies", r) }))}
          {attachmentsColumn<CompanyRow>()}
        </ListTable>
        </>
      )}
      </ResponsiveList>
    </List>
  );
};
