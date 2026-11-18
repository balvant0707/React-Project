// Ported 1:1 from the NPM tool (app/src/pages/companies/edit.tsx).
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useRecordSlot } from "@rbp/core";
import { useCanAccess as useCan} from "@rbp/core";
import { Show } from "@rbp/core";
import { Form, Input, Select, ColorPicker, Radio, Row, Col, Card, Button, Spin, Table, Space, Typography, Tag, Tabs, Descriptions, Tooltip, App as AntdApp } from "antd";
import { companyView } from "@rbp/module-companies/src/modules/companies/companyView.ts";
import { RocketOutlined, CompassOutlined, ShoppingCartOutlined, EditOutlined, CrownOutlined, SearchOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { EntityDetailChrome } from "@rbp/module-messaging/src/notes/entityDetailChrome.tsx";
import { ViewModeFields } from "@rbp/ui";
import { AttachmentsPanel } from "@rbp/module-messaging/src/notes/attachmentsPanel.tsx";
import { ENTITY_CONFIG } from "@rbp/module-fleet/src/entityTypes.ts";
import { usePageBannerTitle, usePageBannerSubtitle } from "@rbp/core";
import { loadPhraseOptions, optionLabel, type PhraseOption as Option } from "@rbp/core";
import { COMPANY_TYPE_OPTIONS, loadCompanyOptionsByIds, searchCompanyOptions, type CompanyRole } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { RemoteSelect } from "@rbp/ui";
import { fetchAllPages, selectInChunks } from "@rbp/ui";
import { companyRelatedFilter } from "@rbp/module-companies/src/modules/companies/companyVesselRelation.ts";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { buildCompanyHullEventsUrl, buildCompanyRolesFilterUrl, buildInFiltersUrl, buildVesselCompanyRolesUrl, type ListFilterTriple, type VesselCompanyRole } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { CompanyVesselRoleStats } from "../../components/companyVesselRoleStats";
import { CompanySupplierTreemap } from "../../components/companySupplierTreemap";
// Platform: deleting a company (new, modules/fleet/src/components/companyDeleteButton.tsx).
import { CompanyDeleteButton } from "@rbp/module-fleet/src/components/companyDeleteButton.tsx";
import { SUPPLIER_CONNECTION_OPTIONS, SUPPLIER_API_ADAPTER_OPTIONS } from "@rbp/module-companies/src/modules/companies/supplierConnection.ts";
import { HullEventsStatusChart } from "../hullEvents/statusChart";
import { invalidateCompanyChartColors } from "@rbp/module-companies/src/modules/companies/chartColors.ts";
import { clickableRow } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { errorText } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.companies) => fieldLabel("companies", field);

// Same color as the "Group company" marker in components/globalSearch.tsx.
const GROUP_ICON_COLOR = "#d48806";

const ROLE_OPTIONS: { label: string; value: CompanyRole }[] = [
  { label: "Customer", value: "customer" },
  { label: "Supplier", value: "supplier" },
];

// The detail page is read-only by default; each of these tabs has its own
// Edit button and saves only its own fields (plus, on the Address tab, the
// per-tenant roles table). A brand-new company has no view mode to start
// from, so it renders every field at once instead (see isNew below).
type EditableTab = "overview" | "address";
const TAB_FIELDS: Record<EditableTab, string[]> = {
  overview: [
    "name",
    "short_code",
    "company_types",
    "sales_account_user_id",
    "account_status_phrase_id",
    "group_company_id",
    "country_id",
  ],
  address: ["address_line", "city", "postal_code", "country_id", "telephone", "email"],
};
// Written only by admins (see isAdmin in CompanyEdit): saving them for anyone else would blank them.
const ADMIN_ADDRESS_FIELDS = ["chart_color", "chart_text_color"];
// Same for how a supplier is reached: changing it re-routes the availability requests and orders sent to the supplier
// (an API adapter makes the app call the supplier's system with the acting user's email).
const ADMIN_OVERVIEW_FIELDS = ["supplier_connection_method", "supplier_api_adapter"];
const isEditableTab = (key: string): key is EditableTab => key === "overview" || key === "address";

type TenantRoleRow = {
  team_id: string;
  team_name: string;
  roles: CompanyRole[];
  our_number_at_company: string | null;
};

// One row per company whose own group_company_id points directly at this
// company (a single-hop lookup, same as the group_company_id column itself
// - see resolved_group_company_id's own comment in crossFilterNav.ts for
// why the group rollup elsewhere only ever walks up one hop, never
// recursively). Read from companies_overview since that's where country is
// already resolved to text; the roles at all tenants are added by a separate company_teams read.
type GroupCompanyRow = {
  id: string;
  name: string;
  country: string | null;
  all_roles: string[];
};

// One row per distinct (owner, technical manager, operator) combination
// found among this company's associated vessels (the same base set the old
// per-vessel table used - see the .or() query in load() below), with a
// count instead of listing every vessel individually.
//
// Two levels, same split as the stat cards above (companyVesselRoleStats.tsx),
// for WHICH vessels are listed:
// - a group parent (other companies point at it) sees the whole GROUP's
//   vessels (resolved_group_company_id and its technical manager/operator
//   equivalents - see 20260917120000_role_group_company_rollups.sql);
// - a standalone company or a subsidiary sees only vessels it is directly
//   assigned to.
// Rows are always grouped on the DIRECT companies and each name is shown as
// "Company (Parent)" (see withParent).
// Falls back to the raw SeaWeb text only when a role never resolved to any
// company at all (rare - get_or_create_seaweb_company auto-resolves anything
// with non-empty text).
type VesselGroupRow = {
  key: string;
  vessel_count: number;
  owner_id: string | null;
  owner_name: string | null;
  technical_manager_id: string | null;
  technical_manager_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
};

// Country, sales rep (companies.sales_account_user_id) and the rep's default tenant,
// looked up per company id for the Business Partner table.
type PartnerRep = { country: string | null; rep: string | null; tenant: string | null };

// "Company (Parent)": the direct company, followed by its group parent when
// that is a different company.
const withParent = (name: string | null, parentName: string | null) =>
  name && parentName && parentName !== name ? `${name} (${parentName})` : name;

// Which vessels_overview columns the Vessels tab reads/filters by, per level
// (see VesselGroupRow): the group rollup for a group parent, the direct
// company columns otherwise.
type VesselRoleColumns = Record<"owner" | "technicalManager" | "operator", { id: string; name: string }>;
const VESSEL_ROLE_COLUMNS_GROUP: VesselRoleColumns = {
  owner: { id: "resolved_group_company_id", name: "resolved_group_company_name" },
  technicalManager: { id: "resolved_technical_manager_group_company_id", name: "resolved_technical_manager_group_company_name" },
  operator: { id: "resolved_operator_group_company_id", name: "resolved_operator_group_company_name" },
};
const VESSEL_ROLE_COLUMNS_OWN: VesselRoleColumns = {
  owner: { id: "group_owner_company_id", name: "resolved_group_owner_company_name" },
  technicalManager: { id: "technical_manager_company_id", name: "resolved_technical_manager_company_name" },
  operator: { id: "operator_company_id", name: "resolved_operator_company_name" },
};


export const CompanyEdit = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  // Tabs other modules add to a company (tasks, ...).
  const slotTabs = useRecordSlot("companies.tabs");
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const connectionMethod = Form.useWatch("supplier_connection_method", form);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const { data: adminCan } = useCan({ resource: "configuration", action: "list" });
  const isAdmin = adminCan?.can === true;
  const [editingTab, setEditingTab] = useState<EditableTab | null>(null);
  const [userOptions, setUserOptions] = useState<Option[]>([]);
  const [statusOptions, setStatusOptions] = useState<Option[]>([]);
  const [groupCompanyOptions, setGroupCompanyOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [company, setCompany] = useState<Record<string, any> | null>(null);
  const [tenantRows, setTenantRows] = useState<TenantRoleRow[]>([]);
  const [savedTenantRows, setSavedTenantRows] = useState<TenantRoleRow[]>([]);
  const [groupCompanies, setGroupCompanies] = useState<GroupCompanyRow[]>([]);
  const [vesselGroupRows, setVesselGroupRows] = useState<VesselGroupRow[]>([]);
  const [uniqueVesselCount, setUniqueVesselCount] = useState<number | null>(null);
  // Rows currently passing the Business Partner table's column filters (all
  // pages); null = unfiltered. Its vessel_count sum is shown in the footer.
  const [partnerReps, setPartnerReps] = useState<Record<string, PartnerRep>>({});
  const [partnersState, setPartnersState] = useState<"idle" | "loading" | "done">("idle");
  const [filteredPartnerRows, setFilteredPartnerRows] = useState<VesselGroupRow[] | null>(null);

  const load = async () => {
    // Only the very first load blanks the page with a spinner; a reload after
    // saving one tab refreshes in place instead of unmounting everything.
    if (!company) setLoading(true);
    const [users, status, { data: tenants }, { data: countries }] = await Promise.all([
      loadUserOptions(),
      loadPhraseOptions("company_account_status"),
      supabaseClient.from("teams").select("id, name, team_uses!inner(use)").eq("team_uses.use", "owner_associate").order("name"),
      supabaseClient.from("countries").select("id, name_en").order("name_en"),
    ]);
    setUserOptions(users);
    setStatusOptions(status);
    setCountryOptions((countries ?? []).map((c) => ({ value: c.id, label: c.name_en })));

    let loadedCompany: any = null;
    let existingRoles: any[] = [];
    let existingGroupCompanies: GroupCompanyRow[] = [];
    if (!isNew) {
      // Needed up front: whether this company is a group parent decides which
      // vessels the Vessels tab lists (see VesselGroupRow).
      const { data: groupCompanyRows } = await supabaseClient
        .from("companies_overview")
        .select("id, name, country, company_types")
        .eq("group_company_id", id)
        .neq("id", id)
        .order("name");
      const [{ data: companyRow }, { data: roleRows }] = await Promise.all([
        supabaseClient.from("companies").select("*").eq("id", id).single(),
        supabaseClient.from("company_teams").select("team_id, roles, our_number_at_company").eq("company_id", id),
      ]);
      loadedCompany = companyRow;
      existingRoles = roleRows ?? [];
      // roles at every tenant plus the company's own types (companies_overview only carries the user's tenant)
      const subsidiaryIds = (groupCompanyRows ?? []).map((row) => row.id as string);
      const subsidiaryTenantRows = await selectInChunks<{ company_id: string; roles: string[] }>(subsidiaryIds, (chunk) =>
        supabaseClient.from("company_teams").select("company_id, roles").in("company_id", chunk),
      );
      const tenantRolesByCompany = new Map<string, Set<string>>();
      for (const row of subsidiaryTenantRows) {
        const set = tenantRolesByCompany.get(row.company_id) ?? new Set<string>();
        row.roles.forEach((role) => set.add(role));
        tenantRolesByCompany.set(row.company_id, set);
      }
      existingGroupCompanies = (groupCompanyRows ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        country: (row.country as string | null) ?? null,
        all_roles: [...new Set([...(tenantRolesByCompany.get(row.id as string) ?? []), ...((row.company_types as string[]) ?? [])])].sort(),
      }));
    }

    // A company that is its own group is stored with group_company_id = its own
    // id; the form and the view both treat that as "no group" (null).
    const normalizedCompany = loadedCompany
      ? { ...loadedCompany, group_company_id: loadedCompany.group_company_id !== loadedCompany.id ? loadedCompany.group_company_id : null }
      : null;
    // The group-company picker searches the server as you type (tens of
    // thousands of companies), so only this company's current group needs
    // its label loaded up front.
    setGroupCompanyOptions(
      normalizedCompany?.group_company_id ? await loadCompanyOptionsByIds([normalizedCompany.group_company_id]) : [],
    );
    setCompany(normalizedCompany);
    form.setFieldsValue(normalizedCompany ?? {});

    const rolesByTenant = new Map(existingRoles.map((r) => [r.team_id, r]));
    const rows = (tenants ?? []).map((t) => ({
      team_id: t.id,
      team_name: t.name,
      roles: (rolesByTenant.get(t.id)?.roles ?? []) as CompanyRole[],
      our_number_at_company: (rolesByTenant.get(t.id)?.our_number_at_company ?? null) as string | null,
    }));
    setTenantRows(rows);
    setSavedTenantRows(rows);
    setGroupCompanies(existingGroupCompanies);
    setFilteredPartnerRows(null);
    setLoading(false);
    // The Business Partner tab loads its own data when it is opened (loadPartners).
    setPartnersState("idle");

  };

  // The Business Partner tab: one row per owner / technical manager / operator combination of the company's vessels
  // (company_vessel_groups, tallied on the server). Loaded when the tab is first opened, not with the page.
  const loadPartners = async () => {
    setPartnersState("loading");
    const vesselRows = await fetchAllPages<any>((from, to) =>
      supabaseClient
        .rpc("company_vessel_groups", { p_company_id: id })
        // a total order over the grouped columns keeps the pages consistent
        .order("group_owner").order("group_owner_company_id").order("resolved_group_owner_company_name").order("resolved_group_company_name")
        .order("technical_manager").order("technical_manager_company_id").order("resolved_technical_manager_company_name").order("resolved_technical_manager_group_company_name")
        .order("operator").order("operator_company_id").order("resolved_operator_company_name").order("resolved_operator_group_company_name")
        .range(from, to),
    );
    const groupsByKey = new Map<string, VesselGroupRow>();
    for (const v of vesselRows) {
      const ownerId = v[VESSEL_ROLE_COLUMNS_OWN.owner.id];
      const ownerName = withParent(v[VESSEL_ROLE_COLUMNS_OWN.owner.name] ?? v.group_owner, v[VESSEL_ROLE_COLUMNS_GROUP.owner.name]);
      const technicalManagerId = v[VESSEL_ROLE_COLUMNS_OWN.technicalManager.id];
      const technicalManagerName = withParent(
        v[VESSEL_ROLE_COLUMNS_OWN.technicalManager.name] ?? v.technical_manager,
        v[VESSEL_ROLE_COLUMNS_GROUP.technicalManager.name],
      );
      const operatorId = v[VESSEL_ROLE_COLUMNS_OWN.operator.id];
      const operatorName = withParent(v[VESSEL_ROLE_COLUMNS_OWN.operator.name] ?? v.operator, v[VESSEL_ROLE_COLUMNS_GROUP.operator.name]);
      const key = `${ownerId ?? ownerName ?? ""}|${technicalManagerId ?? technicalManagerName ?? ""}|${operatorId ?? operatorName ?? ""}`;
      const count = Number(v.count ?? 1);
      const existing = groupsByKey.get(key);
      if (existing) existing.vessel_count += count;
      else
        groupsByKey.set(key, {
          key,
          vessel_count: count,
          owner_id: ownerId,
          owner_name: ownerName,
          technical_manager_id: technicalManagerId,
          technical_manager_name: technicalManagerName,
          operator_id: operatorId,
          operator_name: operatorName,
        });
    }
    const groupRows = Array.from(groupsByKey.values()).sort((a, b) => b.vessel_count - a.vessel_count);
    setVesselGroupRows(groupRows);
    setFilteredPartnerRows(null);
    setPartnersState("done");

    const { data: tenants } = await supabaseClient.from("teams").select("id, name, team_uses!inner(use)").eq("team_uses.use", "owner_associate").order("name");
    const partnerIds = Array.from(
      new Set(groupRows.flatMap((r) => [r.owner_id, r.technical_manager_id, r.operator_id]).filter((x): x is string => !!x)),
    );
    const companyReps = await selectInChunks<any>(partnerIds, (chunk) =>
      supabaseClient.from("companies").select("id, sales_account_user_id, countries(name_en)").in("id", chunk),
    );
    const repIds = Array.from(new Set(companyReps.map((c) => c.sales_account_user_id).filter((x): x is string => !!x)));
    const repUsers = await selectInChunks<{ id: string; name: string | null; default_team_id: string | null }>(repIds, (chunk) =>
      supabaseClient.from("users").select("id, name, default_team_id").in("id", chunk),
    );
    const tenantNames = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const usersById = new Map(repUsers.map((u) => [u.id, u]));
    const reps: Record<string, PartnerRep> = {};
    for (const c of companyReps) {
      const u = c.sales_account_user_id ? usersById.get(c.sales_account_user_id) : undefined;
      reps[c.id] = {
        country: c.countries?.name_en ?? null,
        rep: u?.name ?? null,
        tenant: u?.default_team_id ? (tenantNames.get(u.default_team_id) ?? null) : null,
      };
    }
    setPartnerReps(reps);
  };

  useEffect(() => {
    if (!isNew && company && activeTab === "vessels" && partnersState === "idle") loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, company, partnersState]);

  useEffect(() => {
    setCompany(null);
    setVesselGroupRows([]);
    setPartnerReps({});
    setEditingTab(null);
    setActiveTab("overview");
    setUniqueVesselCount(null);
    setFilteredPartnerRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const updateTenantRow = (tenantId: string, patch: Partial<TenantRoleRow>) => {
    setTenantRows((rows) => rows.map((r) => (r.team_id === tenantId ? { ...r, ...patch } : r)));
  };

  const startEditing = (tab: EditableTab) => {
    form.setFieldsValue(company ?? {});
    setTenantRows(savedTenantRows);
    setEditingTab(tab);
  };

  const cancelEditing = () => {
    form.resetFields();
    form.setFieldsValue(company ?? {});
    setTenantRows(savedTenantRows);
    setEditingTab(null);
  };

  // Saves only the fields belonging to the tab being edited (or every field
  // for a new company). The per-tenant roles table lives on the Address tab,
  // so it is synced along with that tab's save (and with a new company's).
  const save = async () => {
    setSaving(true);
    try {
      const fields = [
        ...(isNew ? [...TAB_FIELDS.overview, ...TAB_FIELDS.address] : TAB_FIELDS[editingTab!]),
        ...(isAdmin && (isNew || editingTab === "address") ? ADMIN_ADDRESS_FIELDS : []),
        ...(isAdmin && (isNew || editingTab === "overview") ? ADMIN_OVERVIEW_FIELDS : []),
      ];
      const values = await form.validateFields(fields);
      const payload: Record<string, unknown> = {};
      // A cleared select yields undefined, which JSON drops from the update, so
      // the old value would silently stay; send an explicit null instead.
      for (const field of fields) payload[field] = field === "company_types" ? (values[field] ?? []) : (values[field] ?? null);
      // The adapter only means something for an API connection.
      if ("supplier_api_adapter" in payload && payload.supplier_connection_method !== "api") payload.supplier_api_adapter = null;
      let companyId = id as string;
      if (isNew) {
        const { data, error } = await supabaseClient.from("companies").insert(payload).select().single();
        if (error) throw error;
        companyId = data.id;
      } else {
        const { error } = await supabaseClient.from("companies").update(payload).eq("id", id);
        if (error) throw error;
      }

      if (isNew || editingTab === "address") {
        // Simplest correct way to sync the per-tenant roles table: replace
        // wholesale rather than diff row-by-row - company_teams rows aren't
        // referenced elsewhere by their own id, so this is safe.
        const { error: deleteTenantsError } = await supabaseClient.from("company_teams").delete().eq("company_id", companyId);
        if (deleteTenantsError) throw deleteTenantsError;
        const rowsToInsert = tenantRows
          .filter((r) => r.roles.length > 0 || r.our_number_at_company)
          .map((r) => ({
            company_id: companyId,
            team_id: r.team_id,
            roles: r.roles,
            our_number_at_company: r.our_number_at_company || null,
          }));
        if (rowsToInsert.length > 0) {
          const { error } = await supabaseClient.from("company_teams").insert(rowsToInsert);
          if (error) throw error;
        }
      }

      invalidateCompanyChartColors();
      message.success(isNew ? "Company created" : "Company saved");
      if (isNew) navigate(`/companies/${companyId}`);
      else {
        setEditingTab(null);
        await load();
      }
    } catch (e: any) {
      if (e?.errorFields) {
        message.error("Please fix the highlighted fields before saving");
        return;
      }
      message.error(errorText(e, "Could not save company"));
    } finally {
      setSaving(false);
    }
  };

  const companyType = useMemo(() => {
    if (groupCompanies.length > 0) return "Parent";
    if (company?.group_company_id) return "Subsidiary";
    return "Standalone";
  }, [groupCompanies, company]);

  // Memoized: usePageBannerTitle's effect keys off this by reference, and a
  // freshly-built JSX node on every render (this component re-renders often,
  // e.g. on every tab switch) would otherwise retrigger that effect every
  // time, feeding back into a state update loop.
  const bannerTitle = useMemo(() => {
    if (isNew) return `New ${ENTITY_CONFIG.companies.label}`;
    if (!company?.name) return undefined;
    return (
      <>
        {ENTITY_CONFIG.companies.label}: {company.name}
        {companyType === "Parent" && (
          <Tooltip title="Group company (has subsidiaries)">
            <CrownOutlined style={{ marginLeft: 10, color: GROUP_ICON_COLOR, fontSize: "0.7em", verticalAlign: "middle" }} />
          </Tooltip>
        )}
      </>
    );
  }, [isNew, company?.name, companyType]);

  usePageBannerTitle(bannerTitle);

  // Hero subtitle: SeaWeb-sourced companies show that as the first segment
  // (their name/address were pulled in automatically, unlike a manually
  // created company); otherwise the group-hierarchy Type (Parent/Subsidiary/
  // Standalone) shown here instead is the more relevant fact. Then country,
  // then the two fields sales runs their territory by.
  const companySubtitle = useMemo(() => {
    if (isNew || !company) return undefined;
    const sourceOrType = company.source === "seaweb" ? "SeaWeb" : companyType;
    const countryLabel = optionLabel(countryOptions, company.country_id);
    const salespersonLabel = optionLabel(userOptions, company.sales_account_user_id);
    const statusLabel = optionLabel(statusOptions, company.account_status_phrase_id);
    return (
      [
        sourceOrType,
        countryLabel,
        salespersonLabel ? `Salesperson: ${salespersonLabel}` : null,
        statusLabel ? `Status: ${statusLabel}` : null,
      ]
        .filter(Boolean)
        .join(" / ") || undefined
    );
  }, [isNew, company, companyType, countryOptions, userOptions, statusOptions]);

  usePageBannerSubtitle(companySubtitle);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  const editingHere = isNew || editingTab === activeTab;

  // ColorPicker hands back a Color object; the form (and the column) holds '#rrggbb' or null.
  const colorPickerProps = {
    getValueFromEvent: (color: { toHexString: () => string } | null) => color?.toHexString() ?? null,
  };
  const chartColorFields = (
    <Row gutter={16}>
      <Col span={6}>
        <Form.Item label="Chart color" name="chart_color" tooltip="Fill color in charts that color by company, e.g. the maker treemaps." {...colorPickerProps}>
          <ColorPicker showText allowClear />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label="Chart text color" name="chart_text_color" tooltip="Label color on the chart color. Automatic leaves the chart default.">
          <Radio.Group
            optionType="button"
            options={[
              { label: "Automatic", value: null },
              { label: "Black", value: "#000000" },
              { label: "White", value: "#ffffff" },
            ]}
          />
        </Form.Item>
      </Col>
    </Row>
  );

  const detailsFields = (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item label={L("name")} name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
      </Col>
      <Col span={4}>
        <Form.Item label={L("short_code")} name="short_code">
          <Input placeholder="e.g. NPMEU" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item
          label={L("company_types")}
          name="company_types"
          tooltip="What the company is, for every tenant. Owner, ship manager, technical manager, operator and shipyard are added automatically as soon as a vessel uses the company in that role; they are only removed here."
        >
          <Select mode="multiple" options={COMPANY_TYPE_OPTIONS} placeholder="None" optionFilterProp="label" />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={L("sales_account_user_id")} name="sales_account_user_id">
          <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={L("account_status_phrase_id")} name="account_status_phrase_id">
          <Select options={statusOptions} allowClear />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item
          label={L("supplier_connection_method")}
          name="supplier_connection_method"
          tooltip="For suppliers: how availability requests reach them. In app = the offer is handed over to a colleague (e.g. an own warehouse); email; or an API. Set by an administrator."
        >
          <Select options={SUPPLIER_CONNECTION_OPTIONS} allowClear placeholder="Not set" disabled={!isAdmin} />
        </Form.Item>
      </Col>
      {connectionMethod === "api" && (
        <Col span={6}>
          <Form.Item label={L("supplier_api_adapter")} name="supplier_api_adapter" rules={[{ required: true, message: "Choose the API" }]}>
            <Select options={SUPPLIER_API_ADAPTER_OPTIONS} disabled={!isAdmin} />
          </Form.Item>
        </Col>
      )}
      <Col span={6}>
        {/* In view mode the group company is a link to that company's own page
            (company is the saved record, so it can't lag a pending edit). */}
        {!isNew && editingTab !== "overview" ? (
          <Form.Item label={L("group_company_id")}>
            {company?.group_company_id ? (
              <a style={{ lineHeight: "32px" }} onClick={() => navigate(`/companies/${company.group_company_id}`)}>
                {groupCompanyOptions.find((o) => o.value === company.group_company_id)?.label ?? company.group_company_id}
              </a>
            ) : (
              <span style={{ lineHeight: "32px" }}>—</span>
            )}
          </Form.Item>
        ) : (
          <Form.Item label={L("group_company_id")} name="group_company_id" tooltip="Left empty, this company is its own group.">
            <RemoteSelect
              loadOptions={async (term) => (await searchCompanyOptions(term)).filter((o) => o.value !== id)}
              loadLabels={loadCompanyOptionsByIds}
              knownLabels={Object.fromEntries(groupCompanyOptions.map((o) => [o.value, o.label]))}
              placeholder="— (own group) - type to search"
            />
          </Form.Item>
        )}
      </Col>
    </Row>
  );

  const addressFields = (
    <Row gutter={16}>
      <Col span={8}>
        <Form.Item label={L("address_line")} name="address_line">
          <Input />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={L("city")} name="city">
          <Input />
        </Form.Item>
      </Col>
      <Col span={4}>
        <Form.Item label={L("postal_code")} name="postal_code">
          <Input />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={L("country_id")} name="country_id">
          <Select options={countryOptions} showSearch optionFilterProp="label" allowClear />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={L("telephone")} name="telephone">
          <Input />
        </Form.Item>
      </Col>
      <Col span={6}>
        <Form.Item label={L("email")} name="email" rules={[{ type: "email" }]}>
          <Input />
        </Form.Item>
      </Col>
    </Row>
  );

  const tenantRolesCard = (editable: boolean) => (
    <Card title="Roles & account number by tenant" size="small" style={{ marginTop: 16 }}>
      <Table dataSource={tenantRows} rowKey="team_id" pagination={false} size="small">
        <Table.Column dataIndex="team_name" title={L("team_id")} width={120} />
        <Table.Column
          title={L("all_roles")}
          render={(_, record: TenantRoleRow) =>
            editable ? (
              <Select
                mode="multiple"
                options={ROLE_OPTIONS}
                value={record.roles}
                onChange={(v) => updateTenantRow(record.team_id, { roles: v as CompanyRole[] })}
                style={{ minWidth: 240 }}
                placeholder="No roles"
              />
            ) : record.roles.length > 0 ? (
              record.roles.map((role) => <Tag key={role}>{optionLabel(ROLE_OPTIONS, role) ?? role}</Tag>)
            ) : (
              "—"
            )
          }
        />
        <Table.Column
          title="Our number at this company"
          render={(_, record: TenantRoleRow) =>
            editable ? (
              <Input
                value={record.our_number_at_company ?? ""}
                onChange={(e) => updateTenantRow(record.team_id, { our_number_at_company: e.target.value })}
                style={{ maxWidth: 220 }}
              />
            ) : (
              (record.our_number_at_company ?? "—")
            )
          }
        />
      </Table>
    </Card>
  );

  if (isNew) {
    return (
      <Show
        title={`New ${ENTITY_CONFIG.companies.label}`}
        headerButtons={
          <Button type="primary" onClick={save} loading={saving}>
            Save
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Card title="Details" size="small">
            {detailsFields}
            {addressFields}
          </Card>
          {isAdmin && (
            <Card title="Chart colors (admin only)" size="small" style={{ marginTop: 16 }}>
              {chartColorFields}
            </Card>
          )}
          {tenantRolesCard(true)}
        </Form>
      </Show>
    );
  }

  const countryName = optionLabel(countryOptions, company?.country_id);
  const view = companyView(company?.company_types, tenantRows.flatMap((r) => r.roles));

  const overviewTab = (
    <>
      <Card title="Details" size="small">
        {/* Type is always-visible context with no edit form anywhere (it's
            derived from group_companies). Country is editable here while the
            Overview tab is in edit mode (same country_id field as on the
            Address tab); otherwise it's plain text. */}
        <Descriptions size="small" colon={false} column={{ xs: 1, sm: 2 }} style={{ marginBottom: 12 }}>
          <Descriptions.Item label="Type">{companyType}</Descriptions.Item>
          {editingTab === "overview" ? null : (
            <Descriptions.Item label={L("country_id")}>{countryName ?? "—"}</Descriptions.Item>
          )}
        </Descriptions>
        {editingTab === "overview" && (
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={L("country_id")} name="country_id">
                <Select options={countryOptions} showSearch optionFilterProp="label" allowClear />
              </Form.Item>
            </Col>
          </Row>
        )}
        <ViewModeFields active={editingTab !== "overview"}>{detailsFields}</ViewModeFields>
      </Card>
      {view.fleet && (
        <div style={{ marginTop: 16 }}>
          <CompanyVesselRoleStats companyId={id as string} onUniqueCount={setUniqueVesselCount} />
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <HullEventsStatusChart filters={[companyRelatedFilter(id as string)]} />
      </div>
      {view.fleet && <CompanySupplierTreemap companyId={id as string} totalVessels={uniqueVesselCount} />}
    </>
  );

  const addressTab = (
    <>
      <Card title="Address" size="small">
        <ViewModeFields active={editingTab !== "address"}>{addressFields}</ViewModeFields>
      </Card>
      {isAdmin && (
        <Card title="Chart colors (admin only)" size="small" style={{ marginTop: 16 }}>
          <ViewModeFields active={editingTab !== "address"}>{chartColorFields}</ViewModeFields>
        </Card>
      )}
      {tenantRolesCard(editingTab === "address")}
    </>
  );

  const groupCompaniesTab = (
    <Card size="small">
      <Table<GroupCompanyRow>
        dataSource={groupCompanies}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10 }}
        onRow={clickableRow<GroupCompanyRow>(navigate, "/companies")}
      >
        <Table.Column<GroupCompanyRow> title={L("name")} dataIndex="name" />
        <Table.Column<GroupCompanyRow> title={L("country")} dataIndex="country" render={(v) => v ?? "—"} />
        <Table.Column<GroupCompanyRow>
          title={L("all_roles")}
          dataIndex="all_roles"
          render={(roles: string[]) => (roles ?? []).map((role) => <Tag key={role}>{role}</Tag>)}
        />
      </Table>
    </Card>
  );

  const partnerColumn = (
    title: string,
    field: "owner_name" | "technical_manager_name" | "operator_name",
    idField: "owner_id" | "technical_manager_id" | "operator_id",
  ) => ({
    title,
    dataIndex: field,
    sorter: (a: VesselGroupRow, b: VesselGroupRow) => (a[field] ?? "").localeCompare(b[field] ?? ""),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    filterDropdown: ({ selectedKeys, setSelectedKeys, confirm, clearFilters }: any) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          allowClear
          placeholder={`Filter ${title}`}
          value={selectedKeys[0]}
          onChange={(e) => {
            setSelectedKeys(e.target.value ? [e.target.value] : []);
            confirm({ closeDropdown: false });
          }}
          onPressEnter={() => confirm()}
          style={{ width: 220 }}
        />
        <div style={{ marginTop: 8, textAlign: "right" }}>
          <Button size="small" onClick={() => clearFilters?.({ confirm: true })}>
            Reset
          </Button>
        </div>
      </div>
    ),
    onFilter: (value: any, r: VesselGroupRow) => (r[field] ?? "").toLowerCase().includes(String(value).toLowerCase()),
    render: (v: string | null, r: VesselGroupRow) => (
      <div>
        {/* A known company links to its page; a SeaWeb name without a company stays text. */}
        <div>{v && r[idField] ? <Link to={`/companies/${r[idField]}`}>{v}</Link> : (v ?? "—")}</div>
        {repSubline(r[idField])}
      </div>
    ),
  });

  // Muted second line under a company name: "{country} | {sales rep} | {rep's tenant}".
  const repSubline = (companyId: string | null) => {
    const info = companyId ? partnerReps[companyId] : undefined;
    const text = [info?.country, info?.rep, info?.tenant].filter(Boolean).join(" | ");
    return text ? (
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {text}
        </Typography.Text>
      </div>
    ) : null;
  };

  const partnerRows = filteredPartnerRows ?? vesselGroupRows;
  const partnerVesselSum = partnerRows.reduce((sum, r) => sum + r.vessel_count, 0);

  const vesselsTab = (
    <Card size="small">
      {partnersState !== "done" && vesselGroupRows.length === 0 ? (
        <Spin />
      ) : vesselGroupRows.length === 0 ? (
        <Typography.Text type="secondary">No vessels are associated with this company</Typography.Text>
      ) : (
        <Table<VesselGroupRow>
          dataSource={vesselGroupRows}
          rowKey="key"
          size="small"
          pagination={{ pageSize: 10 }}
          onChange={(_p, _f, _s, extra) => setFilteredPartnerRows(extra.currentDataSource)}
          columns={[
            partnerColumn("Group Owner", "owner_name", "owner_id"),
            partnerColumn("Technical Manager", "technical_manager_name", "technical_manager_id"),
            partnerColumn("Operator", "operator_name", "operator_id"),
            {
              title: "Vessel Count",
              dataIndex: "vessel_count",
              align: "right",
              sorter: (a, b) => a.vessel_count - b.vessel_count,
              render: (v: number, r) => {
                const filters: ListFilterTriple[] = [];
                const roleEntries: { role: VesselCompanyRole; companyId: string }[] = [];
                if (r.owner_id) roleEntries.push({ role: "owner", companyId: r.owner_id });
                else if (r.owner_name) filters.push({ field: "group_owner", operator: "eq", value: r.owner_name });
                if (r.technical_manager_id) roleEntries.push({ role: "technicalManager", companyId: r.technical_manager_id });
                else if (r.technical_manager_name) filters.push({ field: "technical_manager", operator: "eq", value: r.technical_manager_name });
                if (r.operator_id) roleEntries.push({ role: "operator", companyId: r.operator_id });
                else if (r.operator_name) filters.push({ field: "operator", operator: "eq", value: r.operator_name });
                return <a onClick={() => navigate(buildVesselCompanyRolesUrl(roleEntries, filters))}>{v}</a>;
              },
            },
          ]}
          footer={() => (
            <div style={{ textAlign: "right" }}>
              <strong>
                {filteredPartnerRows ? "Filtered total" : "Total"}: {partnerVesselSum.toLocaleString()} vessels
              </strong>
              {filteredPartnerRows && <Typography.Text type="secondary"> (of {vesselGroupRows.reduce((s, r) => s + r.vessel_count, 0).toLocaleString()})</Typography.Text>}
            </div>
          )}
        />
      )}
    </Card>
  );

  const tabItems = [
    { key: "overview", label: "Overview", children: overviewTab },
    { key: "address", label: "Address", children: addressTab },
    ...(groupCompanies.length > 0 ? [{ key: "groupCompanies", label: "Group Companies", children: groupCompaniesTab }] : []),
    ...(view.fleet ? [{ key: "vessels", label: "Business Partner", children: vesselsTab }] : []),
    { key: "attachments", label: "Attachments", children: <AttachmentsPanel entityType="companies" entityId={id as string} /> },
    ...(!isNew && id ? slotTabs.map((t) => ({ key: t.key, label: t.label, children: t.Component ? <t.Component entityId={id} /> : null })) : []),
  ];

  const editButtons = isEditableTab(activeTab) ? (
    editingHere ? (
      <>
        <Button onClick={cancelEditing} disabled={saving}>
          Cancel
        </Button>
        <Button type="primary" onClick={save} loading={saving}>
          Save
        </Button>
      </>
    ) : (
      <Button type="primary" icon={<EditOutlined />} onClick={() => startEditing(activeTab)} disabled={editingTab !== null}>
        Edit
      </Button>
    )
  ) : null;

  return (
    <Show
      title={
        <Space>
          {company?.name ?? ENTITY_CONFIG.companies.label}
          {company?.source === "seaweb" && <Tag color="blue">SeaWeb</Tag>}
        </Space>
      }
      headerButtons={
        <Space wrap>
          {view.fleet && (
            <Button icon={<RocketOutlined />} onClick={() => navigate(buildCompanyRolesFilterUrl(id!))}>
              Show Vessels
            </Button>
          )}
          <Button
            icon={<CompassOutlined />}
            onClick={() => navigate(buildCompanyHullEventsUrl(id!))}
          >
            Show Hull Events
          </Button>
          {view.shipyard && (
            <Button icon={<RocketOutlined />} onClick={() => navigate(buildInFiltersUrl("/newbuildings", [{ field: "shipyard_company_id", values: [id!] }]))}>
              Show Newbuildings
            </Button>
          )}
          {view.shipyard && (
            <Button
              icon={<CompassOutlined />}
              onClick={() => navigate(buildInFiltersUrl("/hull-events", [{ field: "type_code", values: ["NB"] }, { field: "shipyard_company_id", values: [id!] }]))}
            >
              Show Vessels Built
            </Button>
          )}
          {view.customer && (
            <Button icon={<ShoppingCartOutlined />} onClick={() => navigate(buildInFiltersUrl("/orders", [{ field: "customer_company_id", values: [id!] }]))}>
              Show Offers & Orders
            </Button>
          )}
          {editButtons}
          {company && editingTab === null && <CompanyDeleteButton company={{ id: company.id, name: company.name, source: company.source, seaweb_match_name: company.seaweb_match_name, created_by_user_id: company.created_by_user_id }} onDeleted={() => navigate("/companies")} />}
        </Space>
      }
    >
      <EntityDetailChrome entityType="companies" entityId={id} renderAttachments={false}>
        <Form form={form} layout="vertical">
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
        </Form>
      </EntityDetailChrome>
    </Show>
  );
};
