// Ported 1:1 from the NPM tool (app/src/pages/vessels/edit.tsx).
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { buildVesselHullEventsUrl } from "@rbp/module-companies/src/utils/crossFilterNav.ts";
import { Show } from "@rbp/core";
import {
  Form,
  Input,
  InputNumber,
  DatePicker,
  Row,
  Col,
  Card,
  Button,
  Spin,
  Tag,
  Typography,
  Space,
  Modal,
  Alert,
  Tabs,
  App as AntdApp,
} from "antd";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { EntityDetailChrome } from "@rbp/module-messaging/src/notes/entityDetailChrome.tsx";
import { ViewModeFields } from "@rbp/ui";
import { ENTITY_CONFIG } from "@rbp/module-fleet/src/entityTypes.ts";
import { usePageBannerTitle, usePageBannerSubtitle } from "@rbp/core";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { VesselTimeline } from "./vesselTimeline";
import { useRecordSlot } from "@rbp/core";
import { VesselNewbuildingProjectsPanel, useVesselNewbuildingProjects } from "./vesselNewbuildingProjectsPanel";
import { AttachmentsPanel } from "@rbp/module-messaging/src/notes/attachmentsPanel.tsx";
import { SeawebAllocationModal } from "./seawebAllocationModal";
import { loadCompanyOptionsWithGroupByIds, searchCompanyOptionsWithGroup } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { RemoteSelect } from "@rbp/ui";
import { DATE_FORMAT } from "@rbp/ui";
import { clearedToNull } from "@rbp/ui";
import { errorText } from "@rbp/core";

// View-mode stand-in for a form input: Form.Item injects `value` into its
// child, so this renders the field's current value as plain text.
const PlainValue = ({ value, format }: { value?: unknown; format?: (v: any) => string }) => (
  <Typography.Text>{value === null || value === undefined || value === "" ? "—" : format ? format(value) : String(value)}</Typography.Text>
);

const L = (field: keyof typeof FIELD_LABELS.vessels) => fieldLabel("vessels", field);

// The three SeaWeb free-text ownership roles that resolve to a company via
// get_or_create_seaweb_company (see the vessels_resolve_company_links
// trigger, 20260917090000_company_seaweb_auto_resolution.sql) - group_owner,
// technical_manager and operator each get their own company_id + is_manual
// column pair.
//
// Picking a different company than the one currently auto-resolved offers a
// choice (see handleRoleCompanyChange below): a one-off override for just
// this vessel, or - when the auto-resolved company turned out to be a
// mistaken duplicate of a real company - repointing the company's OWN
// group_company_id (the same field companies/edit.tsx exposes as "Group
// Company") at the picked company. That's a deliberately different, lighter
// operation than a full merge: it never writes to any vessel row directly
// (not even this one - its own field keeps resolving to the "from" company,
// now shown with the "to" company in brackets via the same
// resolved_<role>_group_company_* columns vessels/list.tsx already renders
// through companyWithGroup), it's scoped to one company-level pointer, and
// it doesn't delete or flag the "from" company afterwards.
type OwnershipRole = "group_owner" | "ship_manager" | "technical_manager" | "operator";

const OWNERSHIP_ROLES: {
  role: OwnershipRole;
  label: string;
  companyIdField: string;
  isManualField: string;
}[] = [
  {
    role: "group_owner",
    label: fieldLabel("vessels", "group_owner_company_id"),
    companyIdField: "group_owner_company_id",
    isManualField: "group_owner_company_is_manual",
  },
  {
    role: "ship_manager",
    label: fieldLabel("vessels", "ship_manager_company_id"),
    companyIdField: "ship_manager_company_id",
    isManualField: "ship_manager_company_is_manual",
  },
  {
    role: "technical_manager",
    label: fieldLabel("vessels", "technical_manager_company_id"),
    companyIdField: "technical_manager_company_id",
    isManualField: "technical_manager_company_is_manual",
  },
  {
    role: "operator",
    label: fieldLabel("vessels", "operator_company_id"),
    companyIdField: "operator_company_id",
    isManualField: "operator_company_is_manual",
  },
];

// Maps each role to the vessels_overview column prefixes that carry its
// directly-resolved company (name/country) and that company's OWN group
// company (name/country) - the same "primary company (Group, Country)"
// shape companyWithGroup renders for vessels/list.tsx, just read here from
// the row already loaded for this one vessel instead of a table's worth of
// rows. group_owner is the odd one out: its group column is
// resolved_group_company_* (no "_owner_" infix), a naming leftover from
// before technical_manager/operator got the same rollup.
const ROLE_RESOLVED_COLUMNS: Record<OwnershipRole, { company: string; group: string }> = {
  group_owner: {
    company: "resolved_group_owner_company",
    group: "resolved_group_company",
  },
  ship_manager: {
    company: "resolved_ship_manager_company",
    group: "resolved_ship_manager_group_company",
  },
  technical_manager: {
    company: "resolved_technical_manager_company",
    group: "resolved_technical_manager_group_company",
  },
  operator: {
    company: "resolved_operator_company",
    group: "resolved_operator_group_company",
  },
};

type RoleResolvedInfo = {
  companyId: string | null;
  companyName: string | null;
  companyCountry: string | null;
  groupCompanyId: string | null;
  groupCompanyName: string | null;
  groupCompanyCountry: string | null;
};

// Fields that already sit in the banner (name + the subtitle line: IMO, ship
// type, DWT, build date/yard/country, flag, sanction). They are edited on the
// "General" tab, which only exists while editing; every other field lives on
// the Overview tab next to the ownership companies.
const GENERAL_FIELDS = [
  "name",
  "imo",
  "ship_type",
  "flag",
  "deadweight_tonnage",
  "built_date",
  "shipbuilder",
  "shipbuilder_country",
  "vessel_sanction",
];

// Hero subtitle: IMO / ship type / capacity (TEU for container ships - the only ones with a
// TEU figure at all, since it's sourced from the NB hull event's
// newbuilding details, not a general vessels column; GT for cruise vessels;
// DWT for everything else) / build year, yard, country and NB coating supplier / age / flag / SANCTIONED (only when flagged) - the
// vessel's most identifying facts at a glance. Mirrors vessels/list.tsx's
// capacityLine/buildLine, folded into one line for the detail page's banner.
const vesselSubtitle = (row: Record<string, unknown> | null): string | undefined => {
  if (!row) return undefined;
  const teu = row.nb_teu as number | null;
  const gt = row.gross_tonnage as number | null;
  const dwt = row.deadweight_tonnage as number | null;
  const isCruise = /cruise/i.test((row.ship_type as string | null) ?? "");
  const capacity =
    teu != null
      ? `${teu.toLocaleString()} TEU`
      : isCruise && gt != null
        ? `${gt.toLocaleString()} GT`
        : dwt != null
          ? `${dwt.toLocaleString()} DWT`
          : null;

  const builtDate = row.built_date as string | null;
  const year = builtDate ? new Date(builtDate).getFullYear() : null;
  const shipbuilder = row.shipbuilder as string | null;
  const shipbuilderCountry = row.shipbuilder_country as string | null;
  const yard = shipbuilder ?? (row.nb_shipyard_name as string | null);
  const supplier = (row.nb_supplier_short_code ?? row.nb_supplier_name) as string | null;
  const built = year
    ? `built ${year}${yard ? ` at ${yard}` : ""}${shipbuilderCountry ? ` in ${shipbuilderCountry}` : ""}${supplier ? ` with ${supplier}` : ""}`
    : null;
  const age = year ? `${new Date().getFullYear() - year} years old` : null;

  const imo = row.imo as string | null;
  const flag = row.flag as string | null;
  // vessel_sanction is SeaWeb's free-text screening flag: blank or an explicit
  // "no" means clear, anything else is called out.
  const sanction = ((row.vessel_sanction as string | null) ?? "").trim();
  const sanctioned = sanction !== "" && !/^(no|none|false|n\/a|clear|not sanctioned)$/i.test(sanction);

  return (
    [
      imo ? `IMO ${imo}` : null,
      row.ship_type_group as string | null,
      capacity,
      built,
      age,
      flag ? `Flag: ${flag}` : null,
      sanctioned ? "SANCTIONED" : null,
    ]
      .filter(Boolean)
      .join(" / ") || undefined
  );
};

export const VesselEdit = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  // Existing vessels open read-only; a new vessel has nothing to view yet.
  const [editing, setEditing] = useState(id === "new");
  // A new vessel starts on General: IMO (required) and name live there.
  const [activeTab, setActiveTab] = useState(id === "new" ? "general" : "overview");
  // Set when loadVessel's fetch fails - blocks entering edit mode (save()
  // spreads every current form value into a full-row `update`, so a blank
  // form from a failed load would overwrite a real vessel with nulls).
  const [loadError, setLoadError] = useState<string | null>(null);
  // Labels for this vessel's own role companies (loaded with the vessel) -
  // also what the timeline uses to name companies. The company pickers search
  // the server as you type (there are tens of thousands of companies), so
  // labels of companies picked or seen in searches are kept separately.
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([]);
  const [seenCompanies, setSeenCompanies] = useState<Record<string, string>>({});
  const rememberCompanies = (opts: { value: string; label: string }[]) =>
    setSeenCompanies((prev) => {
      const next = { ...prev };
      for (const o of opts) next[o.value] = o.label;
      return next;
    });
  const companyLabel = (companyId: string) =>
    seenCompanies[companyId] ?? companyOptions.find((c) => c.value === companyId)?.label ?? "(unknown)";
  const [vesselRow, setVesselRow] = useState<Record<string, unknown> | null>(null);
  const [seawebModalOpen, setSeawebModalOpen] = useState(false);
  const [roleCompanyIds, setRoleCompanyIds] = useState<Record<OwnershipRole, string | null>>({
    group_owner: null,
    ship_manager: null,
    technical_manager: null,
    operator: null,
  });
  const [roleManual, setRoleManual] = useState<Record<OwnershipRole, boolean>>({
    group_owner: false,
    ship_manager: false,
    technical_manager: false,
    operator: false,
  });
  const [mergeConfirm, setMergeConfirm] = useState<{
    role: OwnershipRole;
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
  } | null>(null);
  const [groupCompanyConfirm, setGroupCompanyConfirm] = useState<{
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    currentGroupId: string | null;
    currentGroupName: string | null;
  } | null>(null);
  const [applyingMerge, setApplyingMerge] = useState(false);

  const loadVessel = async () => {
    if (isNew) return;
    setLoading(true);
    const { data, error } = await supabaseClient.from("vessels_overview").select("*").eq("id", id).single();
    if (error) {
      // Leave form/vesselRow/roles untouched rather than populating them from
      // `data` (undefined here) - that would blank every field, and Save
      // would then happily write those blanks over the real row.
      setLoadError(error.message);
      message.error(`Could not load this vessel: ${error.message}`);
      setLoading(false);
      return;
    }
    setLoadError(null);
    const roleIds = [
      data?.group_owner_company_id,
      data?.ship_manager_company_id,
      data?.technical_manager_company_id,
      data?.operator_company_id,
    ].filter((v): v is string => !!v);
    const companies = await loadCompanyOptionsWithGroupByIds([...new Set(roleIds)]);
    form.setFieldsValue({
      ...data,
      built_date: data?.built_date ? dayjs(data.built_date) : null,
      docking_survey_date: data?.docking_survey_date ? dayjs(data.docking_survey_date) : null,
    });
    setRoleCompanyIds({
      group_owner: data?.group_owner_company_id ?? null,
      ship_manager: data?.ship_manager_company_id ?? null,
      technical_manager: data?.technical_manager_company_id ?? null,
      operator: data?.operator_company_id ?? null,
    });
    setRoleManual({
      group_owner: !!data?.group_owner_company_is_manual,
      ship_manager: !!data?.ship_manager_company_is_manual,
      technical_manager: !!data?.technical_manager_company_is_manual,
      operator: !!data?.operator_company_is_manual,
    });
    setCompanyOptions(companies);
    setVesselRow(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadVessel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Reads one role's directly-resolved company and that company's own group
  // company off the currently loaded vessels_overview row - see
  // ROLE_RESOLVED_COLUMNS above. Used to know whether the "from" company
  // already has a different group company set before offering to add vs.
  // change it (openGroupCompanyConfirm below) - the Select itself shows its
  // options' own group company directly in their labels (see
  // searchCompanyOptionsWithGroup), so it doesn't need this.
  const getRoleResolvedInfo = (role: OwnershipRole): RoleResolvedInfo => {
    const cols = ROLE_RESOLVED_COLUMNS[role];
    const row = (vesselRow ?? {}) as Record<string, unknown>;
    return {
      companyId: (row[`${cols.company}_id`] as string | undefined) ?? null,
      companyName: (row[`${cols.company}_name`] as string | undefined) ?? null,
      companyCountry: (row[`${cols.company}_country`] as string | undefined) ?? null,
      groupCompanyId: (row[`${cols.group}_id`] as string | undefined) ?? null,
      groupCompanyName: (row[`${cols.group}_name`] as string | undefined) ?? null,
      groupCompanyCountry: (row[`${cols.group}_country`] as string | undefined) ?? null,
    };
  };

  // Picking a company here is always a manual override for this one vessel
  // - auto-resolution (get_or_create_seaweb_company) keeps driving it
  // otherwise. "Reset" clears the override so the next save re-resolves it
  // from the SeaWeb text again.
  const setRoleCompany = (role: OwnershipRole, companyId: string | null) => {
    setRoleCompanyIds((r) => ({ ...r, [role]: companyId }));
    setRoleManual((r) => ({ ...r, [role]: true }));
  };

  // Writes the cleared flag straight away: the vessels_resolve_company_links
  // trigger re-resolves the company from the SeaWeb text on that update, and
  // the resolved id comes back so the Select shows the SeaWeb default
  // immediately instead of the stale manual pick. Touches nothing else on
  // the row, so other unsaved form edits are left alone.
  const resetRoleToAuto = async (role: OwnershipRole) => {
    const cfg = OWNERSHIP_ROLES.find((r) => r.role === role)!;
    const { data, error } = await supabaseClient
      .from("vessels")
      .update({ [cfg.isManualField]: false })
      .eq("id", id)
      .select(cfg.companyIdField)
      .single();
    if (error) {
      message.error(errorText(error, "Could not reset to SeaWeb company"));
      return;
    }
    setRoleCompanyIds((r) => ({
      ...r,
      [role]: ((data as any)?.[cfg.companyIdField] as string | null) ?? null,
    }));
    setRoleManual((r) => ({ ...r, [role]: false }));
    const resolvedId = (data as any)?.[cfg.companyIdField] as string | null | undefined;
    if (resolvedId) loadCompanyOptionsWithGroupByIds([resolvedId]).then(rememberCompanies);
    const { data: row } = await supabaseClient.from("vessels_overview").select("*").eq("id", id).single();
    if (row) setVesselRow(row);
  };

  // Only offer the choice when replacing an auto-resolved value (there's
  // nothing shared to fix once this vessel already has its own manual
  // override, or when clearing the field to blank) - otherwise just apply
  // the override directly, same as before.
  const handleRoleCompanyChange = (role: OwnershipRole, newId: string | null) => {
    const currentId = roleCompanyIds[role];
    if (!roleManual[role] && newId && currentId && newId !== currentId) {
      setMergeConfirm({
        role,
        fromId: currentId,
        fromName: companyLabel(currentId),
        toId: newId,
        toName: companyLabel(newId),
      });
      return;
    }
    setRoleCompany(role, newId);
  };

  const applyJustThisVessel = () => {
    if (!mergeConfirm) return;
    setRoleCompany(mergeConfirm.role, mergeConfirm.toId);
    setMergeConfirm(null);
  };

  // "Fix everywhere" doesn't touch any vessel row (not even this one) - it
  // hands off to a second confirmation that repoints the "from" company's
  // OWN group_company_id at the "to" company, asking to add or change it
  // depending on whether one is already set (see applyGroupCompany below).
  const openGroupCompanyConfirm = () => {
    if (!mergeConfirm) return;
    const info = getRoleResolvedInfo(mergeConfirm.role);
    const hasGroup = !!(info.groupCompanyId && info.groupCompanyId !== info.companyId);
    setGroupCompanyConfirm({
      fromId: mergeConfirm.fromId,
      fromName: mergeConfirm.fromName,
      toId: mergeConfirm.toId,
      toName: mergeConfirm.toName,
      currentGroupId: hasGroup ? info.groupCompanyId : null,
      currentGroupName: hasGroup ? info.groupCompanyName : null,
    });
    setMergeConfirm(null);
  };

  // The actual write: a single companies.group_company_id update on the
  // "from" company, same field/mechanism as the Group Company select on
  // companies/edit.tsx - not a bulk rewrite of vessels' own *_company_id
  // columns. Every vessel resolving to the "from" company (in any of the
  // three roles) picks this up automatically through the
  // resolved_<role>_group_company_* rollup vessels/list.tsx already renders.
  const applyGroupCompany = async () => {
    if (!groupCompanyConfirm) return;
    setApplyingMerge(true);
    try {
      const { fromId, toId, fromName, toName } = groupCompanyConfirm;
      const { error } = await supabaseClient.from("companies").update({ group_company_id: toId }).eq("id", fromId);
      if (error) throw error;
      message.success(`${fromName} now belongs to ${toName}'s group`);
      setGroupCompanyConfirm(null);
      await loadVessel();
    } catch (e: any) {
      message.error(errorText(e, "Could not set group company"));
    } finally {
      setApplyingMerge(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        built_date: values.built_date ? values.built_date.format("YYYY-MM-DD") : null,
        docking_survey_date: values.docking_survey_date ? values.docking_survey_date.format("YYYY-MM-DD") : null,
        group_owner_company_id: roleCompanyIds.group_owner,
        group_owner_company_is_manual: roleManual.group_owner,
        ship_manager_company_id: roleCompanyIds.ship_manager,
        ship_manager_company_is_manual: roleManual.ship_manager,
        technical_manager_company_id: roleCompanyIds.technical_manager,
        technical_manager_company_is_manual: roleManual.technical_manager,
        operator_company_id: roleCompanyIds.operator,
        operator_company_is_manual: roleManual.operator,
      };
      if (isNew) {
        const { data, error } = await supabaseClient.from("vessels").insert(payload).select().single();
        if (error) throw error;
        message.success("Vessel created");
        navigate(`/vessels/${data.id}`);
      } else {
        const { error } = await supabaseClient.from("vessels").update(clearedToNull(payload)).eq("id", id);
        if (error) throw error;
        message.success("Vessel saved");
        await loadVessel();
        setEditing(false);
        if (activeTab === "general") setActiveTab("overview");
      }
    } catch (e: any) {
      if (e?.errorFields) {
        message.error("Please fix the highlighted fields before saving");
        const firstInvalid = e.errorFields[0]?.name?.[0];
        setActiveTab(GENERAL_FIELDS.includes(firstInvalid) ? "general" : "overview");
        return;
      }
      message.error(errorText(e, "Could not save vessel"));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = async () => {
    await loadVessel();
    setEditing(false);
    if (activeTab === "general") setActiveTab("overview");
  };

  const newbuildingProjects = useVesselNewbuildingProjects(id);
  const slotTabs = useRecordSlot("vessels.tabs");

  usePageBannerTitle(
    isNew ? `New ${ENTITY_CONFIG.vessels.label}` : vesselRow?.name ? `${ENTITY_CONFIG.vessels.label}: ${vesselRow.name as string}` : undefined,
  );
  usePageBannerSubtitle(isNew ? undefined : vesselSubtitle(vesselRow));

  const overviewTab = (
    <>
      <Card
        title="Details & Ownership"
        size="small"
        style={{ marginBottom: 16 }}
        extra={!isNew && <Button onClick={() => setSeawebModalOpen(true)}>Seaweb allocation</Button>}
      >
        <Row gutter={32}>
          <Col xs={24} lg={isNew ? 24 : 12}>
            <ViewModeFields active={!editing}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label={L("status")} name="status">
                    <Input placeholder="In service / laid up / scrapped" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={L("class_society")} name="class_society">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={L("gross_tonnage")} name="gross_tonnage">
                    <InputNumber style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={L("net_tonnage")} name="net_tonnage">
                    <InputNumber style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={L("overall_risk_rating")} name="overall_risk_rating">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={L("docking_survey_date")} name="docking_survey_date">
                    <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
                  </Form.Item>
                </Col>
              </Row>
            </ViewModeFields>
          </Col>
          {!isNew && (
            <Col xs={24} lg={12}>
              {OWNERSHIP_ROLES.map(({ role, label }) => (
                <div key={role} style={{ marginBottom: 12 }}>
                  <Space size={4} style={{ marginBottom: 4 }}>
                    <Typography.Text type="secondary">{label}</Typography.Text>
                    {roleManual[role] && <Tag color="orange">Manual</Tag>}
                  </Space>
                  {editing ? (
                    <Space.Compact style={{ width: "100%" }}>
                      <RemoteSelect
                        loadOptions={(term) => searchCompanyOptionsWithGroup(term)}
                        loadLabels={loadCompanyOptionsWithGroupByIds}
                        onOptions={rememberCompanies}
                        knownLabels={{ ...Object.fromEntries(companyOptions.map((c) => [c.value, c.label])), ...seenCompanies }}
                        value={roleCompanyIds[role] ?? undefined}
                        onChange={(v) => handleRoleCompanyChange(role, v ?? null)}
                        placeholder="Auto-resolved from SeaWeb text - type to search"
                      />
                      {roleManual[role] && <Button onClick={() => resetRoleToAuto(role)}>Reset</Button>}
                    </Space.Compact>
                  ) : roleCompanyIds[role] ? (
                    <div>
                      <Link to={`/companies/${roleCompanyIds[role]}`}>{companyLabel(roleCompanyIds[role] as string)}</Link>
                    </div>
                  ) : (
                    <div>
                      <PlainValue value={null} />
                    </div>
                  )}
                </div>
              ))}
            </Col>
          )}
        </Row>
      </Card>
      {!isNew && (
        <VesselTimeline vesselId={id as string} imo={form.getFieldValue("imo")} vessel={vesselRow} companyOptions={companyOptions} />
      )}
      {!isNew && <AttachmentsPanel entityType="vessels" entityId={id as string} />}
    </>
  );

  const generalTab = (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item label={L("name")} name="name">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("imo")} name="imo" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("ship_type")} name="ship_type">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("flag")} name="flag">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("deadweight_tonnage")} name="deadweight_tonnage">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("built_date")} name="built_date">
            <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("shipbuilder")} name="shipbuilder">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("shipbuilder_country")} name="shipbuilder_country">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label={L("vessel_sanction")} name="vessel_sanction">
            <Input />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );

  // forceRender on the form tabs: the fields must be registered even if their
  // tab was never opened, otherwise validateFields() skips them (IMO is
  // required) and a new vessel could be saved without ever visiting General.
  const tabItems = [
    { key: "overview", label: "Overview", children: overviewTab, forceRender: true },
    ...(isNew
      ? []
      : [
          ...slotTabs.map((t) => ({ key: t.key, label: t.label, children: t.Component ? <t.Component vesselId={id as string} /> : null })),
          ...(newbuildingProjects.length > 0
            ? [{ key: "newbuildings", label: "Newbuilding Projects", children: <VesselNewbuildingProjectsPanel projects={newbuildingProjects} /> }]
            : []),
        ]),
    ...(editing ? [{ key: "general", label: "General", children: generalTab, forceRender: true }] : []),
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <Show
      title={
        isNew
          ? `New ${ENTITY_CONFIG.vessels.label}`
          : editing
            ? `Edit ${ENTITY_CONFIG.vessels.label}`
            : (vesselRow?.name as string) || ENTITY_CONFIG.vessels.label
      }
      headerButtons={
        editing ? (
          <Space>
            {!isNew && <Button onClick={cancelEdit}>Cancel</Button>}
            <Button type="primary" onClick={save} loading={saving}>
              Save
            </Button>
          </Space>
        ) : (
          <Space>
            {!isNew && (
              <Button
                onClick={() => {
                  const term = (vesselRow?.imo as string | null) || (vesselRow?.name as string | null);
                  if (term) navigate(buildVesselHullEventsUrl(term));
                }}
                disabled={!vesselRow}
              >
                Show Hullevents
              </Button>
            )}
            <Button type="primary" onClick={() => setEditing(true)} disabled={!isNew && !!loadError}>
              Edit
            </Button>
          </Space>
        )
      }
    >
      <EntityDetailChrome entityType="vessels" entityId={id} isNew={isNew} renderAttachments={false}>
        {loadError && (
          <Alert
            type="error"
            showIcon
            message="Could not load this vessel"
            description={`${loadError} - the fields below may be stale or blank. Editing is disabled until this loads successfully; reload the page to retry.`}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={form} layout="vertical">
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
        </Form>
      </EntityDetailChrome>

      <SeawebAllocationModal
        open={seawebModalOpen}
        onClose={() => setSeawebModalOpen(false)}
        vesselRow={vesselRow}
        roleCompanyIds={roleCompanyIds}
        roleManual={roleManual}
        companyLabel={companyLabel}
      />

      <Modal
        open={!!mergeConfirm}
        title="Is this a correction, or just this vessel?"
        onCancel={() => setMergeConfirm(null)}
        footer={[
          <Button key="one" onClick={applyJustThisVessel}>
            Just this vessel
          </Button>,
          <Button key="all" type="primary" onClick={openGroupCompanyConfirm}>
            Fix everywhere
          </Button>,
        ]}
      >
        <Typography.Paragraph>
          This vessel's {OWNERSHIP_ROLES.find((r) => r.role === mergeConfirm?.role)?.label.toLowerCase()} currently resolves to{" "}
          <Typography.Text strong>{mergeConfirm?.fromName}</Typography.Text>. You picked{" "}
          <Typography.Text strong>{mergeConfirm?.toName}</Typography.Text> instead.
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          <strong>Just this vessel</strong> overrides only this one vessel - {mergeConfirm?.fromName} stays as-is for every other vessel
          using that text, as owner, ship manager, technical manager, or operator.
          <br />
          <strong>Fix everywhere</strong> asks whether to add or change {mergeConfirm?.fromName}'s own group company, pointing it at{" "}
          {mergeConfirm?.toName} - so every vessel currently resolving to {mergeConfirm?.fromName} (in any of the three roles) shows{" "}
          {mergeConfirm?.toName} alongside it, without changing any vessel's data directly. Use this when {mergeConfirm?.fromName} turned
          out to be a mistaken duplicate of the same real company.
        </Typography.Paragraph>
      </Modal>

      <Modal
        open={!!groupCompanyConfirm}
        title={groupCompanyConfirm?.currentGroupId ? "Change group company?" : "Add group company?"}
        onCancel={() => setGroupCompanyConfirm(null)}
        footer={[
          <Button key="cancel" onClick={() => setGroupCompanyConfirm(null)}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" loading={applyingMerge} onClick={applyGroupCompany}>
            {groupCompanyConfirm?.currentGroupId ? "Change group company" : "Add group company"}
          </Button>,
        ]}
      >
        <Typography.Paragraph>
          {groupCompanyConfirm?.currentGroupId ? (
            <>
              <Typography.Text strong>{groupCompanyConfirm?.fromName}</Typography.Text> currently has{" "}
              <Typography.Text strong>{groupCompanyConfirm?.currentGroupName}</Typography.Text> set as its group company. Change it to{" "}
              <Typography.Text strong>{groupCompanyConfirm?.toName}</Typography.Text>?
            </>
          ) : (
            <>
              Set <Typography.Text strong>{groupCompanyConfirm?.toName}</Typography.Text> as{" "}
              <Typography.Text strong>{groupCompanyConfirm?.fromName}</Typography.Text>
              's group company?
            </>
          )}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          Every vessel currently showing {groupCompanyConfirm?.fromName} as owner, ship manager, technical manager, or operator keeps that
          value, but will now display {groupCompanyConfirm?.toName} alongside it in brackets - no vessel's own data is changed.{" "}
          {groupCompanyConfirm?.fromName} itself is left as-is otherwise; nothing deletes it automatically.
        </Typography.Paragraph>
      </Modal>
    </Show>
  );
};
