// Ported 1:1 from the NPM tool (app/src/pages/vessels/list.tsx).
import { useEffect, useState } from "react";
// Platform: the main "new" action as COMPASS does it (round + button on a phone).
import { NewButton } from "@rbp/core";
import { useTable } from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Button, Tag, Typography, Space } from "antd";
import { ImportOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  useListRowProps,
  rowLabel,
  useListKeyNav,
  attachmentsColumn,
  notesColumn,
} from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { HULL_EVENT_STATUS_HEX } from "../hullEvents/statusOptions";
import { ResponsiveList } from "@rbp/core";
import { formatDate, formatMonthYear, formatMonthsAgo, formatMonthsToGo } from "@rbp/ui";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { ENTITY_CONFIG } from "@rbp/module-fleet/src/entityTypes.ts";
import {
  loadCompanyOptionsWithGroupByIds,
  searchCompanyOptionsWithGroup,
  type CompanyOption,
} from "@rbp/module-companies/src/modules/companies/companies.ts";
import { loadDistinctShipTypeGroups, loadDistinctVesselStatuses } from "../../modules/vessels/vessels";
import { useColumnVisibility } from "@rbp/ui";
import { CompanyVesselRoleStats } from "../../components/companyVesselRoleStats";
import { companyWithGroup } from "../../components/companyWithGroup";
import { COMPANY_ROLES_FILTER_KEY, COMPANY_ROLE_FIELDS, COMPANY_OWN_ROLE_FIELDS, VESSEL_COMPANY_ROLES } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { ManageColumnsButton } from "@rbp/ui";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { NameSearchInput } from "@rbp/core";
import { useNotesPanel, useListNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { VesselShipTypeTreemap } from "../../components/vesselShipTypeTreemap";
import { VesselSupplierTreemap } from "../../components/vesselSupplierTreemap";
import { ImportVesselsModal } from "./importVesselsModal";
import { usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";
import { roleCell, stackedRoleCells } from "../../components/roleCell";
import { ListTable, ListColumn } from "@rbp/ui";
import { useUrlFilterSync } from "@rbp/core";
import { useVesselAverages } from "../../utils/useVesselAverages";

const config = ENTITY_CONFIG.vessels;
const L = (field: keyof typeof FIELD_LABELS.vessels) => fieldLabel("vessels", field);

// A next hull event due this soon or sooner is called out in red - same
// "next 3 months" horizon as the Survey due date preset below.
const URGENT_MONTHS = 3;

// Optional/toggleable columns - kept as plain page-local data (just
// key/label pairs, no filter/render logic hides behind these) rather than in
// a shared config, since nothing beyond this page reads the list. DWT isn't
// here - it's always shown in the Name column's capacity line now, so a
// separate toggleable column would just be a duplicate.
const OPTIONAL_COLUMNS = [
  { key: "ship_type", label: L("ship_type_group") },
  { key: "status", label: L("status") },
  { key: "gt", label: L("gross_tonnage") },
  { key: "dd_hull_event_count", label: L("dd_hull_event_count") },
  { key: "created_at", label: L("created_at") },
];
const ALL_OPTIONAL_KEYS = OPTIONAL_COLUMNS.map((c) => c.key);
const DEFAULT_VISIBLE_COLUMNS = ALL_OPTIONAL_KEYS.filter((k) => k !== "ship_type" && k !== "status" && k !== "gt" && k !== "created_at");

const NIPPON_STRIP_COLOR = "#52c41a";
const NO_NIPPON_STRIP_COLOR = "#d7d7d7";

type VesselRow = {
  current_maker_is_own: boolean | null;
  service_period_expired: boolean | null;
  service_period_expired_no_followup: boolean | null;
  id: string;
  imo: string;
  name: string | null;
  ship_type_group: string | null;
  flag: string | null;
  class_society: string | null;
  deadweight_tonnage: number | null;
  gross_tonnage: number | null;
  nb_teu: number | null;
  built_year: number | null;
  status: string | null;
  docking_survey_date: string | null;
  last_hull_event_date: string | null;
  next_hull_event_date: string | null;
  nb_shipyard_name: string | null;
  nb_supplier_name: string | null;
  nb_supplier_short_code: string | null;
  group_owner: string | null;
  group_owner_country: string | null;
  operator: string | null;
  operator_country: string | null;
  ship_manager: string | null;
  ship_manager_country: string | null;
  technical_manager: string | null;
  technical_manager_country: string | null;
  dd_hull_event_count: number;
  has_nb_hull_event: boolean;
  last_hull_event_supplier_name: string | null;
  last_hull_event_vertical_af_product_name: string | null;
  last_hull_event_service_period_months: number | null;
  next_hull_event_status: string | null;
  has_attachments: boolean;
  has_messages: boolean;
  resolved_group_company_id: string | null;
  resolved_group_company_name: string | null;
  resolved_group_owner_company_id: string | null;
  resolved_group_owner_company_name: string | null;
  resolved_group_owner_company_country: string | null;
  resolved_ship_manager_company_id: string | null;
  resolved_ship_manager_company_name: string | null;
  resolved_ship_manager_company_country: string | null;
  resolved_ship_manager_group_company_id: string | null;
  resolved_ship_manager_group_company_name: string | null;
  resolved_technical_manager_company_id: string | null;
  resolved_technical_manager_company_name: string | null;
  resolved_technical_manager_company_country: string | null;
  resolved_technical_manager_group_company_id: string | null;
  resolved_technical_manager_group_company_name: string | null;
  resolved_operator_company_id: string | null;
  resolved_operator_company_name: string | null;
  resolved_operator_company_country: string | null;
  resolved_operator_group_company_id: string | null;
  resolved_operator_group_company_name: string | null;
  created_at: string;
};
// The list asks for exactly the columns it shows. With `select *` PostgREST reads all 89 columns of vessels_overview,
// so Postgres has to plan (and join) every company, country and hull-event table of the view: ~120 ms of planning per
// request; with only these columns the joins nobody reads are left out (~40 ms). The check below fails to compile
// when a column of VesselRow is missing here - a missing column would show an empty cell.
const VESSEL_LIST_COLUMNS = [
  "current_maker_is_own",
  "service_period_expired",
  "service_period_expired_no_followup",
  "id",
  "imo",
  "name",
  "ship_type_group",
  "flag",
  "class_society",
  "deadweight_tonnage",
  "gross_tonnage",
  "nb_teu",
  "built_year",
  "status",
  "docking_survey_date",
  "last_hull_event_date",
  "next_hull_event_date",
  "nb_shipyard_name",
  "nb_supplier_name",
  "nb_supplier_short_code",
  "group_owner",
  "group_owner_country",
  "operator",
  "operator_country",
  "ship_manager",
  "ship_manager_country",
  "technical_manager",
  "technical_manager_country",
  "dd_hull_event_count",
  "has_nb_hull_event",
  "last_hull_event_supplier_name",
  "last_hull_event_vertical_af_product_name",
  "last_hull_event_service_period_months",
  "next_hull_event_status",
  "has_attachments",
  "has_messages",
  "resolved_group_company_id",
  "resolved_group_company_name",
  "resolved_group_owner_company_id",
  "resolved_group_owner_company_name",
  "resolved_group_owner_company_country",
  "resolved_ship_manager_company_id",
  "resolved_ship_manager_company_name",
  "resolved_ship_manager_company_country",
  "resolved_ship_manager_group_company_id",
  "resolved_ship_manager_group_company_name",
  "resolved_technical_manager_company_id",
  "resolved_technical_manager_company_name",
  "resolved_technical_manager_company_country",
  "resolved_technical_manager_group_company_id",
  "resolved_technical_manager_group_company_name",
  "resolved_operator_company_id",
  "resolved_operator_company_name",
  "resolved_operator_company_country",
  "resolved_operator_group_company_id",
  "resolved_operator_group_company_name",
  "created_at",
] as const satisfies readonly (keyof VesselRow)[];
type MissingListColumn = Exclude<keyof VesselRow, (typeof VESSEL_LIST_COLUMNS)[number]>;
const listColumnsComplete: [MissingListColumn] extends [never] ? true : MissingListColumn = true;
void listColumnsComplete;
const VESSEL_LIST_SELECT = VESSEL_LIST_COLUMNS.join(",");


// "built {year} at {shipyard} with {supplier}" - the vessel's build year (the
// view's integer built_year) plus the
// shipyard/supplier resolved from its first (only) Newbuilding hull event
// (the supplier by its short code when it has one, else its full name).
// Countries are deliberately omitted here (unlike roleCell) - this is one
// dense line, not a role column with room for a caption.
const buildLine = (r: VesselRow) => {
  const parts = [r.built_year ? `built ${r.built_year}` : null, r.nb_shipyard_name ? `at ${r.nb_shipyard_name}` : null, (r.nb_supplier_short_code ?? r.nb_supplier_name) ? `with ${r.nb_supplier_short_code ?? r.nb_supplier_name}` : null];
  return parts.filter(Boolean).join(" ") || null;
};

// IMO/Flag/Status/Class on one line, Type/DWT/GT/TEU on the next, inside the Name column (DWT/GT/TEU also have
// optional columns of their own, for sorting).
// Each segment is kept unbreakable (spaces inside it become non-breaking), so
// a line only ever wraps at the " | " separators.
const joinSegments = (parts: (string | null)[]) =>
  parts
    .filter(Boolean)
    .map((s) => s!.replace(/ /g, "\u00a0"))
    .join(" | ") || "—";
const identityLine = (r: VesselRow) => joinSegments([r.imo, r.flag, r.status, r.class_society]);
// Non-breaking space between a number and its unit - so a narrow column
// wraps the line at " | " boundaries, never splitting e.g. "20,073" from
// "DWT" onto separate lines.
const capacityLine = (r: VesselRow) =>
  joinSegments([
    r.ship_type_group,
    r.deadweight_tonnage != null ? `${r.deadweight_tonnage.toLocaleString()} DWT` : null,
    r.gross_tonnage != null ? `${r.gross_tonnage.toLocaleString()} GT` : null,
    r.nb_teu != null ? `${r.nb_teu.toLocaleString()} TEU` : null,
  ]);

// "A – B" for the hull-event cells (product – service period, date – time ago/to go).
const joinDash = (parts: (string | null)[]) => parts.filter(Boolean).join(" – ");

// White text on dark status badges, black on light ones (WCAG relative
// luminance of the #rrggbb badge colour; 0.4 keeps the mid-blues white).
const badgeTextColor = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4 ? "#fff" : "#000";
};

export const VesselList = () => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  useListNotes();
  const listRowProps = useListRowProps<VesselRow>(navigate, config.listPath!, "vessels");
  const { tableProps, tableQuery, filters, setFilters, setCurrentPage, sorters, setSorters } = useTable<VesselRow>({
    resource: "vessels_overview",
    syncWithLocation: true,
    meta: { select: VESSEL_LIST_SELECT },
    pagination: { pageSize: 100 },
    sorters: { initial: [{ field: "name", order: "asc" }] },
  });
  useListKeyNav(tableProps.dataSource, "vessels");
  // The company stat cards link to /vessels?filters... from within this very
  // list; useTable would not pick that URL change up on its own.
  useUrlFilterSync(filters, setFilters, setCurrentPage);
  const averages = useVesselAverages(filters);
  const countSubtitle = listCountSubtitle("ships", tableProps.pagination);
  usePageBannerSubtitle(
    countSubtitle
      ? [
          countSubtitle,
          averages?.deadweightTonnage != null ? `Average DWT: ${Math.round(averages.deadweightTonnage).toLocaleString()}` : null,
          averages?.ageYears != null ? `Average age: ${Math.round(averages.ageYears)} years` : null,
        ]
          .filter(Boolean)
          .join(" / ")
      : undefined,
  );

  const [shipTypeOptions, setShipTypeOptions] = useState<CompanyOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<CompanyOption[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useColumnVisibility(
    "npmeu-columns-vessels-v2",
    ALL_OPTIONAL_KEYS,
    DEFAULT_VISIBLE_COLUMNS,
  );

  useEffect(() => {
    loadDistinctShipTypeGroups().then(setShipTypeOptions);
    loadDistinctVesselStatuses().then(setStatusOptions);
  }, []);

  // Filters are added via the "Add filter" picker + modal (see
  // components/listFilterBar.tsx). All four company roles match the chosen
  // company itself (direct column) and every company in its group (rollup
  // column), see VESSEL_COMPANY_ROLES.
  // Companies are far too many to preload (tens of thousands, and the API
  // caps responses at 1000 rows), so these selects search on the server as
  // the user types.
  const companySearch = {
    loadOptions: (term: string) => searchCompanyOptionsWithGroup(term),
    loadLabels: loadCompanyOptionsWithGroupByIds,
  };
  const filterDefs: ListFilterDef[] = [
    { key: "nameOrImo", label: "Name / IMO", kind: "text", fields: ["name", "imo"] },
    { key: "ship_type", label: L("ship_type_group"), kind: "select", field: "ship_type_group", options: shipTypeOptions },
    { key: "status", label: L("status"), kind: "select", field: "status", options: statusOptions },
    ...(
      [
        ["owner", "Group Owner"],
        ["operator", "Operator"],
        ["technicalManager", "Technical Manager"],
        ["shipManager", "Ship Manager"],
      ] as const
    ).map(([role, label]): ListFilterDef => {
      const { key, fields } = VESSEL_COMPANY_ROLES[role];
      return { key, label, kind: "select", field: fields[0], alsoFields: [fields[1]], ...companySearch };
    }),
    {
      // Written by the Company page's "Show Vessels" link: the company (or a
      // subsidiary) in any of the four roles.
      key: COMPANY_ROLES_FILTER_KEY,
      label: "Company (any role)",
      kind: "select",
      field: COMPANY_ROLE_FIELDS[0],
      alsoFields: [...COMPANY_ROLE_FIELDS.slice(1), ...COMPANY_OWN_ROLE_FIELDS],
      ...companySearch,
    },
    {
      key: "current_maker_is_own",
      label: "Nippon Paint applied",
      kind: "select",
      field: "current_maker_is_own",
      multiple: false,
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
    {
      // Last DD/NB event is old, its service period is over and no later DD/NB event exists, not even a planned one.
      key: "service_period_expired_no_followup",
      label: "Service period expired",
      kind: "select",
      field: "service_period_expired_no_followup",
      multiple: false,
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
    { key: "docking_survey_date", label: L("docking_survey_date"), kind: "dateRange", field: "docking_survey_date", presetMonths: [3, 6, 12] },
    { key: "deadweight_tonnage", label: L("deadweight_tonnage"), kind: "numberRange", field: "deadweight_tonnage", unit: "DWT" },
    { key: "gross_tonnage", label: L("gross_tonnage"), kind: "numberRange", field: "gross_tonnage", unit: "GT" },
    { key: "dd_hull_event_count", label: L("dd_hull_event_count"), kind: "numberRange", field: "dd_hull_event_count" },
    {
      key: "has_nb_hull_event",
      label: L("has_nb_hull_event"),
      kind: "select",
      field: "has_nb_hull_event",
      multiple: false,
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
    },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);
  // Opened from a company's "Show Vessels" link: the role stat cards for that company.
  const roleStatsFilter = filters.find((f) => f.operator === "or" && "key" in f && f.key === COMPANY_ROLES_FILTER_KEY);
  const roleStatsCompanyId = (roleStatsFilter?.value as { value: string }[] | undefined)?.[0]?.value;

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={
        <Space wrap>
          <NameSearchInput filters={filters} setFilters={setFilters} fields={["name", "imo"]} placeholder="Search ship" />
          {filterBar.picker}
          <ManageColumnsButton options={OPTIONAL_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} />
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
            Import Excel
          </Button>
          <NewButton label={`New ${config.label}`} onClick={() => navigate(`${config.listPath}/new`)} />
        </Space>
      }
    >
      {filterBar.modal}
      {roleStatsCompanyId && <CompanyVesselRoleStats companyId={roleStatsCompanyId} />}
      <ResponsiveList<VesselRow>
          tableProps={tableProps}
          sort={{
            options: [
              { value: "name", label: "Name" },
              { value: "deadweight_tonnage", label: "DWT" },
              { value: "built_year", label: "Built" },
              { value: "next_hull_event_date", label: "Next hull event" },
            ],
            sorters,
            setSorters,
            setCurrentPage,
          }}
          onOpen={(row) => navigate(`${config.listPath}/${row.id}`)}
          render={(r) => ({
            accent: r.current_maker_is_own ? NIPPON_STRIP_COLOR : NO_NIPPON_STRIP_COLOR,
            title: r.name ?? "—",
            subtitle: [r.imo, r.ship_type_group, r.deadweight_tonnage != null ? `${r.deadweight_tonnage.toLocaleString("en-US")} DWT` : null, r.built_year ? `built ${r.built_year}` : null].filter(Boolean).join(" | "),
            tags: (
              <>
                {r.current_maker_is_own ? <Tag color="green">Nippon Paint</Tag> : r.last_hull_event_supplier_name ? <Tag>{r.last_hull_event_supplier_name}</Tag> : null}
                {r.service_period_expired_no_followup && <Tag color="orange">Service period expired</Tag>}
              </>
            ),
            footer: [r.group_owner && `Owner: ${r.group_owner}`, r.operator && `Operator: ${r.operator}`].filter(Boolean).join(" | ") || undefined,
          })}
      >
      {() => (
        <>
        <VesselShipTypeTreemap filters={filters} />
        <VesselSupplierTreemap filters={filters} />
        <ListTable<VesselRow>
          {...tableProps}
          rowKey="id"
          showHeader={false}
          onRow={listRowProps}
        >
          <ListColumn<VesselRow>
            minWidth={220}
            title={L("name")}
            dataIndex="name"
            width={320}
            // Green strip = currently coated with Nippon Paint (box-shadow on the cell, like companies/list.tsx).
            onCell={(r) => ({
              style: { boxShadow: `inset 4px 0 0 0 ${r.current_maker_is_own ? NIPPON_STRIP_COLOR : NO_NIPPON_STRIP_COLOR}` },
            })}
            render={(v, record) => (
              <div>
                <div>
                  <strong>{v ?? "—"}</strong>
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {identityLine(record)}
                </Typography.Text>
                <br />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {capacityLine(record)}
                </Typography.Text>
                {buildLine(record) && (
                  <>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {buildLine(record)}
                    </Typography.Text>
                  </>
                )}
              </div>
            )}
          />

          <ListColumn<VesselRow>
            minWidth={200}
            dataIndex="last_hull_event_date"
            render={(v: string | null, record) => {
              // No product known -> fall back to the maker, else leave empty.
              // The service period of the last event is over and nothing newer exists: the system is unknown again.
              const product = record.last_hull_event_vertical_af_product_name ?? record.last_hull_event_supplier_name;
              const period = record.last_hull_event_service_period_months;
              const coating = record.service_period_expired
                ? "Unknown"
                : product
                  ? joinDash([product, period != null ? `${period} months` : null])
                  : null;
              return (
                <div>
                  {roleCell("Hull Coating", null, coating)}
                  <div style={{ marginTop: 6 }}>
                    {roleCell("Last Hull Event", null, v ? joinDash([formatMonthYear(v), formatMonthsAgo(v)]) : null)}
                  </div>
                </div>
              );
            }}
          />

          <ListColumn<VesselRow>
            minWidth={240}
            dataIndex="docking_survey_date"
            render={(v: string | null, record) => {
              const next = record.next_hull_event_date;
              const monthsToGo = next ? dayjs(next).diff(dayjs(), "month") : null;
              const isUrgent = monthsToGo != null && monthsToGo <= URGENT_MONTHS;
              // An event without a status still gets a badge - "Not set" is the
              // same label the Hull Events list uses for it.
              const status = next ? (record.next_hull_event_status ?? "Not set") : null;
              const statusHex = (status && HULL_EVENT_STATUS_HEX[status]) || "#f2f2f2";
              return (
                <div>
                  {roleCell("Next special survey", null, v ? formatMonthYear(v) : null)}
                  <div style={{ marginTop: 6 }}>
                    {roleCell(
                      "Next hull event",
                      null,
                      next ? (
                        <>
                          <span style={{ color: isUrgent ? "#cf1322" : undefined }}>
                            {joinDash([formatMonthYear(next), formatMonthsToGo(next)])}
                          </span>
                          {status && (
                            <Tag
                              style={{
                                marginLeft: 8,
                                color: badgeTextColor(statusHex),
                                background: statusHex,
                                borderColor: "#d9d9d9",
                              }}
                            >
                              {status}
                            </Tag>
                          )}
                        </>
                      ) : null,
                    )}
                  </div>
                </div>
              );
            }}
          />

          <ListColumn<VesselRow>
            minWidth={220}
            title="Owner / Operator"
            key="owner_operator"
            width={260}
            render={(_, r) =>
              stackedRoleCells(
                roleCell(
                  "Owner",
                  r.resolved_group_owner_company_country ?? r.group_owner_country,
                  companyWithGroup(
                    r.resolved_group_owner_company_id,
                    r.resolved_group_owner_company_name,
                    null,
                    r.resolved_group_company_id,
                    r.resolved_group_company_name,
                    null,
                  ) ?? (r.group_owner ? <>{r.group_owner}</> : null),
                ),
                roleCell(
                  "Operator",
                  r.resolved_operator_company_country ?? r.operator_country,
                  companyWithGroup(
                    r.resolved_operator_company_id,
                    r.resolved_operator_company_name,
                    null,
                    r.resolved_operator_group_company_id,
                    r.resolved_operator_group_company_name,
                    null,
                  ) ?? (r.operator ? <>{r.operator}</> : null),
                ),
              )
            }
          />

          <ListColumn<VesselRow>
            minWidth={220}
            title="Technical Manager / Ship Manager"
            key="technical_ship_manager"
            width={260}
            render={(_, r) =>
              stackedRoleCells(
                roleCell(
                  "Technical Manager",
                  r.resolved_technical_manager_company_country ?? r.technical_manager_country,
                  companyWithGroup(
                    r.resolved_technical_manager_company_id,
                    r.resolved_technical_manager_company_name,
                    null,
                    r.resolved_technical_manager_group_company_id,
                    r.resolved_technical_manager_group_company_name,
                    null,
                  ) ?? (r.technical_manager ? <>{r.technical_manager}</> : null),
                ),
                roleCell(
                  "Ship Manager",
                  r.resolved_ship_manager_company_country ?? r.ship_manager_country,
                  companyWithGroup(
                    r.resolved_ship_manager_company_id,
                    r.resolved_ship_manager_company_name,
                    null,
                    r.resolved_ship_manager_group_company_id,
                    r.resolved_ship_manager_group_company_name,
                    null,
                  ) ?? (r.ship_manager ? <>{r.ship_manager}</> : null),
                ),
              )
            }
          />

          {visibleColumns.includes("ship_type") && (
            <ListColumn<VesselRow>
              minWidth={120}
              title={L("ship_type_group")}
              dataIndex="ship_type_group"
            />
          )}

          {visibleColumns.includes("status") && (
            <ListColumn<VesselRow>
              title={L("status")}
              dataIndex="status"
            />
          )}

          {visibleColumns.includes("gt") && (
            <ListColumn<VesselRow>
              dataIndex="gross_tonnage"
              title={L("gross_tonnage")}
              align="right"
              render={(v: number | null) => (v != null ? `${v.toLocaleString()} GT` : "—")}
            />
          )}
          {visibleColumns.includes("dd_hull_event_count") && (
            <ListColumn<VesselRow>
              dataIndex="dd_hull_event_count"
              title={L("dd_hull_event_count")}
              align="right"
            />
          )}
          {visibleColumns.includes("created_at") && (
            <ListColumn<VesselRow> dataIndex="created_at" title={L("created_at")} render={formatDate} />
          )}
          {notesColumn<VesselRow>((r) => openEntity({ type: "vessels", id: r.id, label: rowLabel("vessels", r) }))}
          {attachmentsColumn<VesselRow>()}
        </ListTable>
        </>
      )}
      </ResponsiveList>
      <ImportVesselsModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => tableQuery.refetch()} />
    </List>
  );
};
