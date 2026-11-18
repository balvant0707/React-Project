// Ported 1:1 from the NPM tool (app/src/pages/hullEvents/list.tsx).
import { useEffect, useMemo, useState, type ReactNode } from "react";
// Platform: the main "new" action as COMPASS does it (round + button on a phone).
import { NewButton } from "@rbp/core";
import { useTable } from "@rbp/core";
import { List } from "@rbp/core";
import { useGetIdentity, type LogicalFilter } from "@rbp/core";
import { Link, useNavigate } from "react-router-dom";
import { Tag, Tooltip, Typography, Space, Switch } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  useListRowProps,
  rowLabel,
  useListKeyNav,
  attachmentsColumn,
  notesColumn,
} from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { ENTITY_CONFIG } from "@rbp/module-fleet/src/entityTypes.ts";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { HULL_EVENT_COMPANY_ANY_FIELDS, HULL_EVENT_COMPANY_ANY_KEY } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { formatDate } from "@rbp/ui";
import { supabaseClient } from "@rbp/core";
import {
  loadCompanyOptions,
  loadCompanyOptionsWithGroupByIds,
  searchCompanyOptionsWithGroup,
  type CompanyOption,
} from "@rbp/module-companies/src/modules/companies/companies.ts";
import { loadDistinctShipTypeGroups } from "../../modules/vessels/vessels";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { useColumnVisibility } from "@rbp/ui";
import { ListTable, ListColumn } from "@rbp/ui";
import { companyWithGroup } from "../../components/companyWithGroup";
import { roleCell, stackedRoleCells } from "../../components/roleCell";
import { ManageColumnsButton } from "@rbp/ui";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { useNotesPanel, useListNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { HULL_EVENT_STATUS_OPTIONS, HULL_EVENT_STATUS_HEX } from "./statusOptions";
import { DEFAULT_CHART_RANGE, HullEventsStatusChart } from "./statusChart";
import { usePageBannerSubtitle } from "@rbp/core";
import { CONTINENT_OPTIONS } from "@rbp/module-companies/src/modules/countries/continents.ts";
import { listCountSubtitle } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.hull_events) => fieldLabel("hull_events", field);

// A chart month range as the Event Date chip's filters (dateRange: gte/lte, day granularity). event_date is
// always the 1st of its month, so the last month's end includes it.
const eventDateRangeFilters = ([from, to]: [Dayjs, Dayjs]): LogicalFilter[] => [
  { field: "event_date", operator: "gte", value: from.startOf("month").format("YYYY-MM-DD") },
  { field: "event_date", operator: "lte", value: to.endOf("month").format("YYYY-MM-DD") },
];

const OPTIONAL_COLUMNS = [
  { key: "location", label: L("location") },
  { key: "antifoulings", label: L("antifoulings") },
  { key: "opportunity", label: L("opportunity") },
  { key: "event_summary", label: L("event_summary") },
  { key: "specification_count", label: L("specification_count") },
  { key: "offered_antifoulings", label: L("offered_antifoulings") },
  { key: "vessel_ship_type", label: L("vessel_ship_type_group") },
  { key: "vessel_deadweight_tonnage", label: L("vessel_deadweight_tonnage") },
  // Combines maker_name + service_period_months into one cell (matches the
  // Superset "Supplier" column - name, then Service Period). The underlying
  // fields still each have their own independent filter below.
  { key: "supplier", label: L("supplier") },
  { key: "newbuilding_project_title", label: L("newbuilding_project_title") },
  // Combines sales_account_user_id + invoicing_party_name +
  // facilitating_partner_company_id + dealer_company_id into one cell
  // (matches the Superset "Sales Contact" column). Same note as above - each
  // field keeps its own filter.
  { key: "sales_contact", label: L("sales_contact") },
  { key: "newbuilding_code", label: L("newbuilding_code") },
  { key: "newbuilding_deadweight_tonnage", label: L("newbuilding_deadweight_tonnage") },
  { key: "newbuilding_teu", label: L("newbuilding_teu") },
  { key: "newbuilding_contract_date", label: L("newbuilding_contract_date") },
  { key: "newbuilding_steel_cut_date", label: L("newbuilding_steel_cut_date") },
  { key: "created_at", label: L("created_at") },
];
const ALL_OPTIONAL_KEYS = OPTIONAL_COLUMNS.map((c) => c.key);
const DEFAULT_VISIBLE_COLUMNS = ["location", "antifoulings", "opportunity"];

// The overview view has ~55 left joins. A `select *` keeps all of them in the plan and PostgreSQL then needs over a
// second to plan the page query (the chart's aggregates, which only read hull_events columns, plan in ~6 ms because
// the planner drops the joins nothing reads). So the table asks only for the columns its always-visible cells and
// the currently visible optional columns read; a hidden column's joins fall out of the plan. A column added to a
// cell's render must be added here too, or the cell silently shows its empty state.
const CORE_SELECT = [
  "id", "status", "lost_reason", "event_date", "type_code", "type_text", "has_attachments", "has_messages",
  // vessel cell
  "vessel_name", "vessel_imo", "vessel_flag", "vessel_status", "vessel_built_date", "vessel_ship_type_group",
  "vessel_deadweight_tonnage", "vessel_gross_tonnage", "vessel_nb_supplier_label",
  // owner / operator and technical / ship manager cells: the vessel's live company (with group) else the snapshot
  "resolved_group_owner_company_id", "resolved_group_owner_company_name", "resolved_group_owner_company_country",
  "resolved_group_company_id", "resolved_group_company_name",
  "snapshot_group_owner_company_id", "snapshot_group_owner_company_name", "snapshot_group_owner_company_country",
  "resolved_operator_company_id", "resolved_operator_company_name", "resolved_operator_company_country",
  "resolved_operator_group_company_id", "resolved_operator_group_company_name",
  "snapshot_operator_company_id", "snapshot_operator_company_name", "snapshot_operator_company_country",
  "resolved_technical_manager_company_id", "resolved_technical_manager_company_name", "resolved_technical_manager_company_country",
  "resolved_technical_manager_group_company_id", "resolved_technical_manager_group_company_name",
  "snapshot_technical_manager_company_id", "snapshot_technical_manager_company_name", "snapshot_technical_manager_company_country",
  "resolved_ship_manager_company_id", "resolved_ship_manager_company_name", "resolved_ship_manager_company_country",
  "resolved_ship_manager_group_company_id", "resolved_ship_manager_group_company_name",
  "snapshot_ship_manager_company_id", "snapshot_ship_manager_company_name", "snapshot_ship_manager_company_country",
];
// Per optional column key (OPTIONAL_COLUMNS): the extra view columns its cell reads.
const OPTIONAL_SELECT: Record<string, string[]> = {
  location: [
    "shipyard_city", "shipyard_name", "location_continent", "location_country_name", "sales_account_user_tenant_name",
    "sales_account_user_name", "dealer_short_code", "dealer_name", "facilitating_partner_short_code", "facilitating_partner_name",
  ],
  antifoulings: ["vertical_af_product_name", "flat_bottom_af_product_name"],
  opportunity: ["opportunity_value", "opportunity_value_currency", "opportunity_exchange_rate", "opportunity_litres"],
  event_summary: ["customer_name", "customer_company_country"],
  specification_count: ["specification_count", "has_accepted_specification"],
  offered_antifoulings: ["vertical_offered_af_product_name", "flat_bottom_offered_af_product_name"],
  supplier: ["maker_name", "service_period_months"],
  newbuilding_project_title: ["newbuilding_project_id", "newbuilding_project_title"],
  sales_contact: ["sales_account_user_name", "invoicing_party_name", "facilitating_partner_name", "dealer_name"],
  newbuilding_code: ["newbuilding_code"],
  newbuilding_deadweight_tonnage: ["newbuilding_deadweight_tonnage"],
  newbuilding_teu: ["newbuilding_teu"],
  newbuilding_contract_date: ["newbuilding_contract_date"],
  newbuilding_steel_cut_date: ["newbuilding_steel_cut_date"],
  created_at: ["created_at"],
};
// vessel_ship_type and vessel_deadweight_tonnage need nothing extra: the vessel cell already reads both.
const selectForColumns = (visible: string[]) =>
  [...new Set([...CORE_SELECT, ...visible.flatMap((key) => OPTIONAL_SELECT[key] ?? [])])].join(",");

type HullEventOverviewRow = {
  id: string;
  status: string | null;
  lost_reason: string | null;
  created_at: string;
  vessel_name: string | null;
  vessel_imo: string | null;
  vessel_ship_type_group: string | null;
  vessel_built_date: string | null;
  vessel_deadweight_tonnage: number | null;
  type_text: string | null;
  snapshot_group_owner_company_id: string | null;
  snapshot_group_owner_company_name: string | null;
  snapshot_group_owner_company_country: string | null;
  snapshot_ship_manager_company_id: string | null;
  snapshot_ship_manager_company_name: string | null;
  snapshot_ship_manager_company_country: string | null;
  snapshot_technical_manager_company_id: string | null;
  snapshot_technical_manager_company_name: string | null;
  snapshot_technical_manager_company_country: string | null;
  snapshot_operator_company_id: string | null;
  snapshot_operator_company_name: string | null;
  snapshot_operator_company_country: string | null;
  specification_count: number;
  has_accepted_specification: boolean;
  has_attachments: boolean;
  has_messages: boolean;
  event_date: string | null;
  resolved_group_company_id: string | null;
  resolved_group_company_name: string | null;
  resolved_group_company_country: string | null;
  resolved_group_owner_company_id: string | null;
  resolved_group_owner_company_name: string | null;
  resolved_group_owner_company_country: string | null;
  resolved_ship_manager_company_id: string | null;
  resolved_ship_manager_company_name: string | null;
  resolved_ship_manager_company_country: string | null;
  resolved_ship_manager_group_company_id: string | null;
  resolved_ship_manager_group_company_name: string | null;
  resolved_ship_manager_group_company_country: string | null;
  resolved_technical_manager_company_id: string | null;
  resolved_technical_manager_company_name: string | null;
  resolved_technical_manager_company_country: string | null;
  resolved_technical_manager_group_company_id: string | null;
  resolved_technical_manager_group_company_name: string | null;
  resolved_technical_manager_group_company_country: string | null;
  resolved_operator_company_id: string | null;
  resolved_operator_company_name: string | null;
  resolved_operator_company_country: string | null;
  resolved_operator_group_company_id: string | null;
  resolved_operator_group_company_name: string | null;
  resolved_operator_group_company_country: string | null;
  type_code: string | null;
  maker_company_id: string | null;
  maker_name: string | null;
  customer_company_id: string | null;
  customer_name: string | null;
  customer_company_country: string | null;
  newbuilding_project_id: string | null;
  newbuilding_project_title: string | null;
  dealer_company_id: string | null;
  dealer_name: string | null;
  invoicing_party_name: string | null;
  newbuilding_code: string | null;
  newbuilding_deadweight_tonnage: number | null;
  newbuilding_teu: number | null;
  newbuilding_contract_date: string | null;
  newbuilding_steel_cut_date: string | null;
  vertical_af_product_name: string | null;
  flat_bottom_af_product_name: string | null;
  sales_account_user_id: string | null;
  sales_account_user_name: string | null;
  facilitating_partner_company_id: string | null;
  facilitating_partner_name: string | null;
  service_period_months: number | null;
  vertical_offered_af_product_name: string | null;
  flat_bottom_offered_af_product_name: string | null;
  location_continent: string | null;
  location_country_id: string | null;
  location_country_name: string | null;
  shipyard_name: string | null;
  opportunity_value: number | null;
  opportunity_value_currency: string | null;
  opportunity_exchange_rate: number | null;
  offered_litres: number | null;
  opportunity_litres: number | null;
  vessel_status: string | null;
  vessel_flag: string | null;
  vessel_gross_tonnage: number | null;
  shipyard_city: string | null;
  dealer_short_code: string | null;
  facilitating_partner_short_code: string | null;
  vessel_nb_supplier_label: string | null;
  sales_account_user_tenant_name: string | null;
};


// This page is DD/NB-only - Seastock ("SS") projects are created and
// managed from the vessel's own Seastock panel instead (seastockOffersPanel.tsx),
// so both the Type filter and the create modal's Type select exclude it here.
const loadNonSeastockHullEventTypePhrases = async () => {
  const { data } = await supabaseClient
    .from("phrases")
    .select("id, code, text_en")
    .eq("category", "hull_event_type")
    .neq("code", "SS")
    .order("sequence");
  return data ?? [];
};

const roleLine = (label: string, content: ReactNode | null) =>
  content ? (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        {label}:
      </Typography.Text>{" "}
      {content}
    </div>
  ) : null;

const joinBar = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" | ") || null;

// The four role companies: the vessel's live company (with its group folded in)
// first, else the company frozen on the hull event (snapshot_*). The country is
// shown in the caption ("Owner in Greece"), not behind the name.
const ownerCompany = (r: HullEventOverviewRow) =>
  companyWithGroup(r.resolved_group_owner_company_id, r.resolved_group_owner_company_name, null, r.resolved_group_company_id, r.resolved_group_company_name, null) ??
  companyWithGroup(r.snapshot_group_owner_company_id, r.snapshot_group_owner_company_name, null, null, null, null);
const ownerCountry = (r: HullEventOverviewRow) => r.resolved_group_owner_company_country ?? r.snapshot_group_owner_company_country;
const operatorCompany = (r: HullEventOverviewRow) =>
  companyWithGroup(r.resolved_operator_company_id, r.resolved_operator_company_name, null, r.resolved_operator_group_company_id, r.resolved_operator_group_company_name, null) ??
  companyWithGroup(r.snapshot_operator_company_id, r.snapshot_operator_company_name, null, null, null, null);
const operatorCountry = (r: HullEventOverviewRow) => r.resolved_operator_company_country ?? r.snapshot_operator_company_country;
const technicalManagerCompany = (r: HullEventOverviewRow) =>
  companyWithGroup(r.resolved_technical_manager_company_id, r.resolved_technical_manager_company_name, null, r.resolved_technical_manager_group_company_id, r.resolved_technical_manager_group_company_name, null) ??
  companyWithGroup(r.snapshot_technical_manager_company_id, r.snapshot_technical_manager_company_name, null, null, null, null);
const technicalManagerCountry = (r: HullEventOverviewRow) => r.resolved_technical_manager_company_country ?? r.snapshot_technical_manager_company_country;
const shipManagerCompany = (r: HullEventOverviewRow) =>
  companyWithGroup(r.resolved_ship_manager_company_id, r.resolved_ship_manager_company_name, null, r.resolved_ship_manager_group_company_id, r.resolved_ship_manager_group_company_name, null) ??
  companyWithGroup(r.snapshot_ship_manager_company_id, r.snapshot_ship_manager_company_name, null, null, null, null);
const shipManagerCountry = (r: HullEventOverviewRow) => r.resolved_ship_manager_company_country ?? r.snapshot_ship_manager_company_country;

export const HullEventList = () => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  useListNotes();
  const listRowProps = useListRowProps<HullEventOverviewRow>(navigate, ENTITY_CONFIG.hull_events.listPath!, "hull_events");
  const [visibleColumns, setVisibleColumns] = useColumnVisibility(
    // Bumped from "npmeu-columns-hull-events" (v1) to reset everyone's saved
    // column picks after the column set changed (Type/Customer/Event Date
    // merged into one column, Antifoulings added) - a stale v1 selection
    // would otherwise keep showing removed keys or hiding new ones. Bumped
    // again to v3 when Offered Antifoulings/Opportunity/Location/Supplier/
    // Sales Contact all became default-visible, for the same reason. v4: the
    // card layout (Location now carries the associates, Event is optional).
    "npmeu-columns-hull-events-v4",
    ALL_OPTIONAL_KEYS,
    DEFAULT_VISIBLE_COLUMNS,
  );
  const select = useMemo(() => selectForColumns(visibleColumns), [visibleColumns]);
  const { tableProps, setFilters, filters } = useTable<HullEventOverviewRow>({
    resource: "hull_events_overview",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
    meta: { select },
    sorters: { initial: [{ field: "event_date", order: "desc" }] },
    // This page is DD/NB-only - Seastock "projects" live on the vessel's own
    // Seastock panel instead (seastockOffersPanel.tsx). Permanent, not a
    // togglable default, since there's no UI path here for viewing them.
    // The list starts on the chart's default period (an Event Date chip, see
    // chartRange below); a URL that brings its own filters (cross-navigation
    // links) replaces it, so those show every date.
    filters: {
      permanent: [{ field: "type_code", operator: "ne", value: "SS" }],
      initial: eventDateRangeFilters(DEFAULT_CHART_RANGE()),
    },
  });
  useListKeyNav(tableProps.dataSource, "hull_events");
  usePageBannerSubtitle(listCountSubtitle("hull events", tableProps.pagination));

  // Driven by clicking a series/month label in HullEventsStatusChart above -
  // both are multi-select (clicking a second status/month adds to the set,
  // clicking an already-selected one removes it), applied to the table as
  // an "in" filter so any number of them can be active together.
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // The chart's onEvent click handler is wired up once by @ant-design/plots
  // internals and never rebinds on later renders, so it only ever calls the
  // very first render's version of these two functions - anything read from
  // an outer closure (selectedStatuses/selectedMonths) would be permanently
  // stale. Using the functional setState form instead means React always
  // hands the updater the current value, sidestepping that staleness
  // entirely - setSelectedStatuses/setFilters are themselves stable
  // (identical) across renders, so calling even a "stale" toggleStatus still
  // does the right thing.
  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) => {
      const next = prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status];
      setFilters([{ field: "status", operator: "in", value: next.length ? next : undefined }]);
      return next;
    });
  };

  const toggleMonth = (month: string) => {
    setSelectedMonths((prev) => {
      const next = prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month];
      setFilters([{ field: "event_date", operator: "in", value: next.length ? next.map((m) => `${m}-01`) : undefined }]);
      return next;
    });
  };

  // Same as toggleMonth for a quarter/year axis label: if every month it covers is already selected they are all
  // removed, otherwise the missing ones are added.
  const toggleMonths = (months: string[]) => {
    setSelectedMonths((prev) => {
      const next = months.every((m) => prev.includes(m)) ? prev.filter((m) => !months.includes(m)) : [...new Set([...prev, ...months])];
      setFilters([{ field: "event_date", operator: "in", value: next.length ? next.map((m) => `${m}-01`) : undefined }]);
      return next;
    });
  };

  const [shipTypeOptions, setShipTypeOptions] = useState<CompanyOption[]>([]);
  const [typeFilterOptions, setTypeFilterOptions] = useState<{ value: string; label: string }[]>([]);
  const [makerFilterOptions, setMakerFilterOptions] = useState<CompanyOption[]>([]);
  const [dealerFilterOptions, setDealerFilterOptions] = useState<CompanyOption[]>([]);
  const [facilitatingPartnerFilterOptions, setFacilitatingPartnerFilterOptions] = useState<CompanyOption[]>([]);
  const [countryFilterOptions, setCountryFilterOptions] = useState<CompanyOption[]>([]);
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([]);
  const { data: identity } = useGetIdentity<{ id: string }>();

  useEffect(() => {
    loadDistinctShipTypeGroups().then(setShipTypeOptions);
    loadCompanyOptions("maker").then(setMakerFilterOptions);
    loadCompanyOptions("dealer").then(setDealerFilterOptions);
    loadCompanyOptions("facilitating_partner").then(setFacilitatingPartnerFilterOptions);
    // Keyed on type_code (a real, stable column on hull_events_overview),
    // not the resolved type_text label - matches the permanent filter above.
    loadNonSeastockHullEventTypePhrases().then((rows) => setTypeFilterOptions(rows.map((p) => ({ value: p.code, label: p.text_en }))));
    loadUserOptions().then(setUserOptions);
    supabaseClient
      .from("countries")
      .select("id, name_en")
      .order("name_en")
      .then(({ data }) => setCountryFilterOptions((data ?? []).map((c) => ({ value: c.id, label: c.name_en }))));
  }, []);

  // "My Hull Events" is derived straight from the active sales_account_user_id
  // filter (the same field the "Sales Rep" filter chip below already uses,
  // same "in" operator) rather than held as separate state - same approach as
  // the Companies list's "My Companies" switch - so it can never drift out of
  // sync with that chip.
  const myHullEventsFilterValue = filters.find((f) => "field" in f && f.field === "sales_account_user_id" && f.operator === "in")?.value;
  const isMyHullEvents =
    !!identity?.id && Array.isArray(myHullEventsFilterValue) && myHullEventsFilterValue.length === 1 && myHullEventsFilterValue[0] === identity.id;
  const toggleMyHullEvents = (checked: boolean) =>
    setFilters([{ field: "sales_account_user_id", operator: "in", value: checked && identity?.id ? [identity.id] : undefined }]);

  // Filters are added via the "Add filter" picker + modal (see
  // components/listFilterBar.tsx). The four ownership filters match on
  // snapshot_*_company_id (who it was at the time, frozen at this hull
  // event's own creation) - deliberately different from what the Ownership
  // cell renders, which prefers the vessel's live-resolved company (falling
  // back to the same snapshot only when nothing resolves live), same as the
  // hull event detail page. "Filter by who it was then" and "show who it is
  // now" are both useful and don't need to agree.
  // Owner/manager/operator and customer companies number in the tens of
  // thousands (every SeaWeb company, and each of them is a "customer"), so
  // these selects search on the server as the user types instead of
  // preloading a list the API would cap at 1000 rows anyway.
  const companySearch = {
    loadOptions: (term: string) => searchCompanyOptionsWithGroup(term),
    loadLabels: loadCompanyOptionsWithGroupByIds,
  };
  const customerSearch = {
    loadOptions: (term: string) => searchCompanyOptionsWithGroup(term, "customer"),
    loadLabels: loadCompanyOptionsWithGroupByIds,
  };
  const filterDefs: ListFilterDef[] = [
    { key: "vessel", label: "Vessel name / IMO", kind: "text", fields: ["vessel_name", "vessel_imo"] },
    { key: "vessel_ship_type", label: L("vessel_ship_type_group"), kind: "select", field: "vessel_ship_type_group", options: shipTypeOptions },
    { key: "type_text", label: "Event Type", kind: "select", field: "type_code", options: typeFilterOptions },
    { key: "status", label: L("status"), kind: "select", field: "status", options: HULL_EVENT_STATUS_OPTIONS },
    // Written by the Company page's "Show Hull Events" link (live-resolved
    // group company, not the snapshot columns the four filters below use).
    {
      // Written by the Company page's "Show Hull Events" link: the company in any role of the event.
      key: HULL_EVENT_COMPANY_ANY_KEY,
      label: "Company (any role)",
      kind: "select",
      field: HULL_EVENT_COMPANY_ANY_FIELDS[0],
      alsoFields: HULL_EVENT_COMPANY_ANY_FIELDS.slice(1),
      ...companySearch,
    },
    { key: "group_company", label: "Group Company", kind: "select", field: "resolved_group_company_id", multiple: false, ...companySearch },
    { key: "owner", label: "Owner", kind: "select", field: "snapshot_group_owner_company_id", ...companySearch },
    { key: "ship_manager", label: "Ship Mgr", kind: "select", field: "snapshot_ship_manager_company_id", ...companySearch },
    { key: "technical_manager", label: "Tech. Mgr", kind: "select", field: "snapshot_technical_manager_company_id", ...companySearch },
    { key: "operator", label: "Operator", kind: "select", field: "snapshot_operator_company_id", ...companySearch },
    { key: "customer", label: L("customer_name"), kind: "select", field: "customer_company_id", ...customerSearch },
    { key: "shipyard", label: L("shipyard_name"), kind: "select", field: "shipyard_company_id", ...companySearch },
    { key: "maker", label: L("maker_name"), kind: "select", field: "maker_company_id", options: makerFilterOptions },
    { key: "dealer", label: L("dealer_company_id"), kind: "select", field: "dealer_company_id", options: dealerFilterOptions },
    {
      key: "facilitating_partner",
      label: L("facilitating_partner_company_id"),
      kind: "select",
      field: "facilitating_partner_company_id",
      options: facilitatingPartnerFilterOptions,
    },
    { key: "invoicing_party_name", label: L("invoicing_party_name"), kind: "text", fields: ["invoicing_party_name"] },
    { key: "specification_count", label: L("specification_count"), kind: "numberRange", field: "specification_count" },
    { key: "vessel_deadweight_tonnage", label: L("vessel_deadweight_tonnage"), kind: "numberRange", field: "vessel_deadweight_tonnage", unit: "DWT" },
    { key: "service_period_months", label: L("service_period_months"), kind: "numberRange", field: "service_period_months" },
    { key: "sales_account_user_id", label: L("sales_account_user_id"), kind: "select", field: "sales_account_user_id", options: userOptions },
    { key: "opportunity_value", label: L("opportunity_value"), kind: "numberRange", field: "opportunity_value" },
    { key: "opportunity_litres", label: L("opportunity_litres"), kind: "numberRange", field: "opportunity_litres", unit: "L" },
    { key: "location_continent", label: L("location_continent"), kind: "select", field: "location_continent", options: CONTINENT_OPTIONS },
    { key: "location_country_id", label: L("location_country_id"), kind: "select", field: "location_country_id", options: countryFilterOptions },
    { key: "event_date", label: "Event Period", kind: "dateRange", field: "event_date" },
    // Driven by clicking a month label in HullEventsStatusChart (see
    // toggleMonth above), not by this filter bar's own "Add filter" flow -
    // options are built from whatever's currently selected so the chip shows
    // real month labels and lets the user deselect/cancel individual months,
    // same as any other filter chip. Targets the same event_date column as
    // the dateRange filter above via a different operator ("in" vs
    // gte/lte) - the two coexist independently, same as the chart already
    // treats them (see statusChart.tsx).
    {
      key: "event_month",
      label: "Event Month",
      kind: "select",
      field: "event_date",
      options: selectedMonths.map((m) => ({ value: `${m}-01`, label: dayjs(`${m}-01`).format("MMM YYYY") })),
    },
    { key: "created_at", label: L("created_at"), kind: "dateRange", field: "created_at" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);

  // The chart highlights statuses from local state (see toggleStatus above);
  // mirror the status filter back into it so removing/editing the Status tag
  // is reflected in the chart too.
  const statusFilterKey = JSON.stringify(
    [filters.find((f) => "field" in f && f.field === "status" && f.operator === "in")?.value ?? []].flat(),
  );
  useEffect(() => setSelectedStatuses(JSON.parse(statusFilterKey)), [statusFilterKey]);

  // Same idea for months: mirror the event_date "in" filter (written by
  // toggleMonth, or by editing/removing the Event Month chip) back into
  // selectedMonths, so the chart's bold axis label and dimmed bars stay in
  // sync however the filter changed.
  const monthFilterKey = JSON.stringify(
    [filters.find((f) => "field" in f && f.field === "event_date" && f.operator === "in")?.value ?? []].flat(),
  );
  useEffect(
    () => setSelectedMonths((JSON.parse(monthFilterKey) as string[]).map((d) => d.slice(0, 7))),
    [monthFilterKey],
  );

  // The chart's month range is the Event Date chip (gte/lte on event_date):
  // picking a range in the chart writes the chip, editing the chip moves the
  // chart. Without the chip the chart shows its default range and the list
  // every date.
  const eventDateFrom = filters.find((f) => "field" in f && f.field === "event_date" && f.operator === "gte")?.value as string | undefined;
  const eventDateTo = filters.find((f) => "field" in f && f.field === "event_date" && f.operator === "lte")?.value as string | undefined;
  const chartRange = useMemo((): [Dayjs, Dayjs] => {
    const [defaultFrom, defaultTo] = DEFAULT_CHART_RANGE();
    return [
      eventDateFrom ? dayjs(eventDateFrom).startOf("month") : defaultFrom,
      eventDateTo ? dayjs(eventDateTo).startOf("month") : defaultTo,
    ];
  }, [eventDateFrom, eventDateTo]);

  return (
    <List
      // The chips need antd PageHeader's own title slot, not headerButtons -
      // headerButtons renders as `extra`, which PageHeader always pins to
      // the row's flex-end, so anything placed there (including something
      // listed first) still ends up hugging the right edge next to the
      // other buttons. title is the row's only flex-start slot, which is
      // what lets the chips start at the true left edge of the page (see
      // components/crud.tsx). No entity-label span in here - PageBanner
      // already shows "Hull Events" as the page hero just above, so this
      // slot carries only the chips (title falls back to false via
      // `props.title ?? false` when there are none, so an empty filter bar
      // adds no visible row at all).
      toolbar={filterBar.chips}
      headerButtons={
        <Space wrap>
          {filterBar.picker}
          <Switch checked={isMyHullEvents} onChange={toggleMyHullEvents} disabled={!identity?.id} />
          <span>My Hull Events</span>
          <ManageColumnsButton options={OPTIONAL_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} />
          <NewButton label={`New ${ENTITY_CONFIG.hull_events.label}`} onClick={() => navigate("/hull-events/new")} />
        </Space>
      }
    >
      <HullEventsStatusChart
        filters={filters}
        selectedStatuses={selectedStatuses}
        onToggleStatus={toggleStatus}
        selectedMonths={selectedMonths}
        onToggleMonth={toggleMonth}
        onToggleMonths={toggleMonths}
        range={chartRange}
        onRangeChange={(range) => setFilters(eventDateRangeFilters(range))}
      />

      {filterBar.modal}

      <ListTable<HullEventOverviewRow>
        {...tableProps}
        rowKey="id"
        onRow={listRowProps}
      >
        <ListColumn<HullEventOverviewRow>
          title={L("vessel_name")}
          width={360}
          minWidth={240}
          dataIndex="vessel_name"
          sorter
          // The status color strip lives on this cell's own box-shadow rather
          // than the row's: a box-shadow set on the <tr> paints behind the
          // <td> elements, so antd's row-hover background (applied to each
          // <td>) covered it up. Setting it on the cell itself paints the
          // shadow above that cell's own background instead.
          onCell={(record) => ({
            style: { boxShadow: `inset 4px 0 0 0 ${HULL_EVENT_STATUS_HEX[record.status ?? "Not set"] ?? "#d9d9d9"}` },
          })}
          render={(v, record) => {
            const small = { fontSize: 11 };
            const built = record.vessel_built_date ? `built ${dayjs(record.vessel_built_date).year()}` : null;
            const buildLine = [built, record.vessel_nb_supplier_label ? `with ${record.vessel_nb_supplier_label}` : null].filter(Boolean).join(" ");
            const eventLabel = record.event_date
              ? `${record.type_code ?? record.type_text ?? ""} – ${dayjs(record.event_date).format("MM")} | ${dayjs(record.event_date).format("YYYY")}`
              : record.type_code ?? record.type_text;
            const capacityLine = joinBar([
              record.vessel_ship_type_group,
              record.vessel_deadweight_tonnage ? `${record.vessel_deadweight_tonnage.toLocaleString()} DWT` : null,
              record.vessel_gross_tonnage ? `${record.vessel_gross_tonnage.toLocaleString()} GT` : null,
            ]);
            return (
              <Tooltip title={record.status ?? "Not set"}>
                <div>
                  <div>
                    <strong>{v ?? <span style={{ color: "#aaa" }}>— (newbuilding)</span>}</strong>
                    {eventLabel && <strong style={{ marginLeft: 16 }}>{eventLabel}</strong>}
                  </div>
                  {[joinBar([record.vessel_imo, record.vessel_flag, record.vessel_status]), capacityLine, buildLine].map(
                    (line, i) =>
                      line && (
                        <div key={i}>
                          <Typography.Text type="secondary" style={small}>
                            {line}
                          </Typography.Text>
                        </div>
                      ),
                  )}
                  {record.status === "Lost" && record.lost_reason && (
                    <Typography.Text type="danger" style={small}>
                      Lost: {record.lost_reason}
                    </Typography.Text>
                  )}
                </div>
              </Tooltip>
            );
          }}
        />
        {visibleColumns.includes("location") && (
          <ListColumn<HullEventOverviewRow>
            title={L("location")}
            width={280}
            minWidth={180}
            key="location"
            render={(_, record) => {
              const small = { fontSize: 11 };
              // The port is the shipyard's city: a dry-dock happens at the yard.
              const where = joinBar([record.shipyard_city?.toUpperCase() ?? null, record.shipyard_name]);
              // Short code when the company has one, else its full name.
              const associates = [
                ["Associate", record.sales_account_user_tenant_name],
                ["Sales Contact", record.sales_account_user_name],
                ["Dealer", record.dealer_short_code ?? record.dealer_name],
                ["Facilitator", record.facilitating_partner_short_code ?? record.facilitating_partner_name],
              ].filter(([, value]) => value) as [string, string][];
              const region = joinBar([record.location_continent, record.location_country_name]);
              return region || where || associates.length ? (
                <div>
                  {region && (
                    <Typography.Text type="secondary" style={small}>
                      {region}
                    </Typography.Text>
                  )}
                  {where && <div>{where}</div>}
                  {associates.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <Typography.Text type="secondary" style={small}>
                        {associates.map(([label]) => label).join(" | ")}
                      </Typography.Text>
                      <div>{associates.map(([, value]) => value).join(" | ")}</div>
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ color: "#aaa" }}>—</span>
              );
            }}
          />
        )}
        {visibleColumns.includes("antifoulings") && (
          <ListColumn<HullEventOverviewRow>
            title={L("antifoulings")}
            width={200}
            minWidth={140}
            key="antifoulings"
            render={(_, record) => {
              // Product unknown: the event's maker at least, marked as such.
              const product = (name: string | null) =>
                name ??
                (record.maker_name ? (
                  <Typography.Text type="secondary" title="Product not known - the hull event's maker">
                    {record.maker_name}
                  </Typography.Text>
                ) : null);
              return stackedRoleCells(
                roleCell("Verticals", null, product(record.vertical_af_product_name)),
                roleCell("Flat Bottom", null, product(record.flat_bottom_af_product_name)),
              );
            }}
          />
        )}
        <ListColumn<HullEventOverviewRow>
          title={L("owner_operator")}
          width={250}
          minWidth={200}
          key="owner_operator"
          render={(_, record) =>
            stackedRoleCells(
              roleCell("Owner", ownerCountry(record), ownerCompany(record)),
              roleCell("Operator", operatorCountry(record), operatorCompany(record)),
            )
          }
        />
        <ListColumn<HullEventOverviewRow>
          title={L("technical_ship_manager")}
          width={250}
          minWidth={200}
          key="technical_ship_manager"
          render={(_, record) =>
            stackedRoleCells(
              roleCell("Technical Manager", technicalManagerCountry(record), technicalManagerCompany(record)),
              roleCell("Ship Manager", shipManagerCountry(record), shipManagerCompany(record)),
            )
          }
        />
        {visibleColumns.includes("opportunity") && (
          <ListColumn<HullEventOverviewRow>
            title={L("opportunity")}
            width={150}
            dataIndex="opportunity_value"
            sorter
            render={(_, record) => {
              if (record.opportunity_value == null && record.opportunity_litres == null) return "—";
              const amount =
                record.opportunity_value != null
                  ? `${record.opportunity_value.toLocaleString()}${record.opportunity_value_currency ? ` ${record.opportunity_value_currency}` : ""}`
                  : null;
              // Not applied to the amount above - exchange_rate has no
              // confirmed direction/target currency anywhere in this app yet
              // (see 20260925110000) - shown only as a hint for whoever
              // eventually defines that conversion.
              return (
                <div>
                  {record.opportunity_litres != null && <div>{record.opportunity_litres.toLocaleString()} Liter</div>}
                  {amount &&
                    (record.opportunity_exchange_rate != null ? (
                      <Tooltip title={`Exchange rate: ${record.opportunity_exchange_rate}`}>
                        <div>{amount}</div>
                      </Tooltip>
                    ) : (
                      <div>{amount}</div>
                    ))}
                </div>
              );
            }}
          />
        )}
        {visibleColumns.includes("event_summary") && (
          <ListColumn<HullEventOverviewRow>
            title={L("event_summary")}
            width={205}
            minWidth={140}
            dataIndex="event_date"
            sorter
            render={(v: string | null, record) => (
              <div>
                <div>
                  <strong>{v ? dayjs(v).format("MMM YYYY") : "—"}</strong> · {record.type_text}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {record.customer_name
                    ? record.customer_company_country
                      ? `${record.customer_name}, ${record.customer_company_country}`
                      : record.customer_name
                    : "—"}
                </Typography.Text>
              </div>
            )}
          />
        )}
        {visibleColumns.includes("specification_count") && (
          <ListColumn<HullEventOverviewRow>
            title={L("specification_count")}
            width={135}
            dataIndex="specification_count"
            render={(_, record) =>
              record.specification_count > 0 ? (
                <>
                  {record.specification_count} {record.specification_count === 1 ? "spec" : "specs"}
                  {record.has_accepted_specification && <Tag color="green" style={{ marginLeft: 6 }}>Accepted</Tag>}
                </>
              ) : (
                <span style={{ color: "#aaa" }}>None yet</span>
              )
            }
          />
        )}
        {visibleColumns.includes("offered_antifoulings") && (
          <ListColumn<HullEventOverviewRow>
            title={L("offered_antifoulings")}
            minWidth={140}
            key="offered_antifoulings"
            render={(_, record) =>
              record.vertical_offered_af_product_name || record.flat_bottom_offered_af_product_name ? (
                <>
                  {roleLine("Vertical", record.vertical_offered_af_product_name)}
                  {roleLine("Flat Bottom", record.flat_bottom_offered_af_product_name)}
                </>
              ) : (
                <span style={{ color: "#aaa" }}>—</span>
              )
            }
          />
        )}
        {visibleColumns.includes("vessel_ship_type") && (
          <ListColumn<HullEventOverviewRow>
            title={L("vessel_ship_type_group")}
            minWidth={120}
            dataIndex="vessel_ship_type_group"
          />
        )}
        {visibleColumns.includes("vessel_deadweight_tonnage") && (
          <ListColumn<HullEventOverviewRow>
            title={L("vessel_deadweight_tonnage")}
            dataIndex="vessel_deadweight_tonnage"
            align="right"
            sorter
            render={(v: number | null) => (v != null ? `${v.toLocaleString()} DWT` : "—")}
          />
        )}
        {visibleColumns.includes("supplier") && (
          <ListColumn<HullEventOverviewRow>
            title={L("supplier")}
            width={220}
            minWidth={130}
            key="supplier"
            render={(_, record) =>
              record.maker_name || record.service_period_months != null ? (
                <>
                  {record.maker_name && <div>{record.maker_name}</div>}
                  {roleLine("Service Period", record.service_period_months != null ? `${record.service_period_months} months` : null)}
                </>
              ) : (
                <span style={{ color: "#aaa" }}>—</span>
              )
            }
          />
        )}
        {visibleColumns.includes("newbuilding_project_title") && (
          <ListColumn<HullEventOverviewRow>
            title={L("newbuilding_project_title")}
            minWidth={140}
            dataIndex="newbuilding_project_title"
            sorter
            render={(v: string | null, record) =>
              v && record.newbuilding_project_id ? (
                <Link to={`/newbuildings/${record.newbuilding_project_id}`} onClick={(e) => e.stopPropagation()}>
                  {v}
                </Link>
              ) : (
                "—"
              )
            }
          />
        )}
        {visibleColumns.includes("sales_contact") && (
          <ListColumn<HullEventOverviewRow>
            title={L("sales_contact")}
            width={150}
            minWidth={120}
            key="sales_contact"
            render={(_, record) =>
              record.sales_account_user_name || record.invoicing_party_name || record.facilitating_partner_name || record.dealer_name ? (
                <>
                  {record.sales_account_user_name && <div>{record.sales_account_user_name}</div>}
                  {roleLine("Invoicing Party", record.invoicing_party_name)}
                  {roleLine("Facilitating Partner", record.facilitating_partner_name)}
                  {roleLine("Dealer/Distributor", record.dealer_name)}
                </>
              ) : (
                <span style={{ color: "#aaa" }}>—</span>
              )
            }
          />
        )}
        {visibleColumns.includes("newbuilding_code") && (
          <ListColumn<HullEventOverviewRow>
            title={L("newbuilding_code")}
            dataIndex="newbuilding_code"
            render={(v: string | null) => v ?? "—"}
          />
        )}
        {visibleColumns.includes("newbuilding_deadweight_tonnage") && (
          <ListColumn<HullEventOverviewRow>
            title={L("newbuilding_deadweight_tonnage")}
            dataIndex="newbuilding_deadweight_tonnage"
            align="right"
            sorter
            render={(v: number | null) => (v != null ? `${v.toLocaleString()} DWT` : "—")}
          />
        )}
        {visibleColumns.includes("newbuilding_teu") && (
          <ListColumn<HullEventOverviewRow>
            title={L("newbuilding_teu")}
            dataIndex="newbuilding_teu"
            align="right"
            sorter
            render={(v: number | null) => (v != null ? `${v.toLocaleString()} TEU` : "—")}
          />
        )}
        {visibleColumns.includes("newbuilding_contract_date") && (
          <ListColumn<HullEventOverviewRow>
            title={L("newbuilding_contract_date")}
            dataIndex="newbuilding_contract_date"
            sorter
            render={formatDate}
          />
        )}
        {visibleColumns.includes("newbuilding_steel_cut_date") && (
          <ListColumn<HullEventOverviewRow>
            title={L("newbuilding_steel_cut_date")}
            dataIndex="newbuilding_steel_cut_date"
            sorter
            render={formatDate}
          />
        )}
        {notesColumn<HullEventOverviewRow>((r) => openEntity({ type: "hull_events", id: r.id, label: rowLabel("hull_events", r) }))}
        {attachmentsColumn<HullEventOverviewRow>()}
        {visibleColumns.includes("created_at") && (
          <ListColumn<HullEventOverviewRow>
            dataIndex="created_at"
            title={L("created_at")}
            sorter
            render={formatDate}
          />
        )}
      </ListTable>

    </List>
  );
};
