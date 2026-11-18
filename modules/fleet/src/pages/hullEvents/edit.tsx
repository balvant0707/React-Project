// Ported 1:1 from the NPM tool (app/src/pages/hullEvents/edit.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useGetIdentity } from "@rbp/core";
import { Show } from "@rbp/core";
import { Alert, Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, Spin, Typography, App as AntdApp } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { usePageBannerTitle, usePageBannerCrumbExtra } from "@rbp/core";
import type { PhraseOption as Option } from "@rbp/core";
import { loadCompanyOptions, loadCompanyOptionsWithGroupByIds, searchCompanyOptionsWithGroup } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { loadVesselOptionsByIds, searchVesselOptions } from "../../modules/vessels/vessels";
import { RemoteSelect } from "@rbp/ui";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { HULL_EVENT_STATUS_OPTIONS } from "./statusOptions";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { AntifoulingProductSelect, useAntifoulingProducts, AF_PRODUCT_FIELDS, SUPPLIER_FIELD } from "@rbp/module-products/src/components/antifoulingProductSelect.tsx";
import { CURRENCY_OPTIONS } from "@rbp/ui";
import { hasAppliedProduct, isLightEventType } from "./eventTypes";
import { CONTINENT_OPTIONS } from "@rbp/module-companies/src/modules/countries/continents.ts";
import { errorText } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.hull_events) => fieldLabel("hull_events", field);

// Create (/hull-events/new) and edit (/hull-events/:id/edit) page of a hull event - one full-page form for both, replacing
// the former "New Hull Event" modal and the Edit modal of the detail page. /hull-events/new?newbuilding_project_id=<id>
// starts a newbuilding (NB) hull event inside that project, with the project's customer, shipyard, sales rep and team
// copied in (a copy, not a live link: the hull event is its own record and may diverge).

// The four ownership roles snapshotted onto a hull event from its vessel at creation (copy_vessel_snapshot_to_hull_event,
// before insert only). The snapshot is the hull event's own record - editable here when the vessel's data was wrong or out
// of date at the time of creation.
const SNAPSHOT_ROLES = ["group_owner", "ship_manager", "technical_manager", "operator"] as const;
const snapshotField = (role: (typeof SNAPSHOT_ROLES)[number]) => `snapshot_${role}_company_id` as const;

type TypeOption = Option & { code: string | null };

// What we offer (normally written by a specification save, apply_specification_offered_af_products); unlike the
// applied products these are not tied to the event's supplier.
const OFFERED_AF_PRODUCT_FIELDS = ["vertical_offered_af_product_id", "flat_bottom_offered_af_product_id"] as const;

const sectionTitle = (text: string) => (
  <Typography.Title level={5} style={{ marginTop: 8 }}>
    {text}
  </Typography.Title>
);

export const HullEventEdit = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const [searchParams] = useSearchParams();
  const projectIdParam = searchParams.get("newbuilding_project_id");
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  // Read after the option lists have loaded (the load effect below closes over the first render's, empty, identity).
  const identityIdRef = useRef<string | undefined>(undefined);
  identityIdRef.current = identity?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hullEvent, setHullEvent] = useState<any>(null);
  const [typeOptions, setTypeOptions] = useState<TypeOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<Option[]>([]);
  // Copied from the project onto a new NB event; not shown in the form (there is no team field), but RLS uses it.
  const [projectTeamId, setProjectTeamId] = useState<string | null>(null);
  const [makerOptions, setMakerOptions] = useState<Option[]>([]);
  const [dealerOptions, setDealerOptions] = useState<Option[]>([]);
  const [facilitatingPartnerOptions, setFacilitatingPartnerOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [countryContinentById, setCountryContinentById] = useState<Record<string, string | null>>({});
  const [userOptions, setUserOptions] = useState<Option[]>([]);
  const [form] = Form.useForm();
  const { products: afProducts, reload: reloadAfProducts } = useAntifoulingProducts();
  const offeredAfOptions = useMemo(() => afProducts.map((p) => ({ value: p.id, label: `${p.name} (${p.supplier_name})` })), [afProducts]);
  // The supplier value the form last settled on - restored when the user cancels a supplier change.
  const lastSupplierRef = useRef<string | undefined>(undefined);
  const statusValue = Form.useWatch("status", form);
  const typePhraseId = Form.useWatch("type_phrase_id", form);
  const typeCodeForm = typeOptions.find((t) => t.value === typePhraseId)?.code;
  const isNewbuildingForm = typeCodeForm === "NB";
  const isLightForm = isLightEventType(typeCodeForm);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Vessels and customers are far too many to preload (~175k vessels, every SeaWeb company is a customer) - those
      // fields search on the server.
      const [{ data: typePhrases }, makers, dealers, facilitatingPartners, { data: countries }, users, { data: projects }, hullEventResult, projectResult] =
        await Promise.all([
          supabaseClient.from("phrases").select("id, text_en, code").eq("category", "hull_event_type").order("sequence"),
          loadCompanyOptions("maker"),
          loadCompanyOptions("dealer"),
          loadCompanyOptions("facilitating_partner"),
          supabaseClient.from("countries").select("id, name_en, continent").order("name_en"),
          loadUserOptions(),
          supabaseClient.from("newbuilding_projects").select("id, title").order("title"),
          id
            ? supabaseClient.from("hull_events").select("*, vessels(name), phrases(text_en, code), hull_event_newbuilding_details(*), can_edit:hull_events_can_edit").eq("id", id).maybeSingle()
            : Promise.resolve({ data: null }),
          projectIdParam
            ? supabaseClient
                .from("newbuilding_projects")
                .select("id, customer_company_id, shipyard_company_id, sales_account_user_id, assigned_team_id")
                .eq("id", projectIdParam)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
      if (cancelled) return;

      // Seastock ("SS") projects are created from the vessel's own Seastock panel, never here; an existing SS event can still be edited.
      const types: TypeOption[] = (typePhrases ?? [])
        .filter((t) => !isNew || t.code !== "SS")
        .map((t) => ({ value: t.id, label: t.text_en, code: t.code }));
      setTypeOptions(types);
      setProjectOptions((projects ?? []).map((p) => ({ value: p.id, label: p.title })));
      setMakerOptions(makers);
      setDealerOptions(dealers);
      setFacilitatingPartnerOptions(facilitatingPartners);
      setCountryOptions((countries ?? []).map((c) => ({ value: c.id, label: c.name_en })));
      setCountryContinentById(Object.fromEntries((countries ?? []).map((c) => [c.id, c.continent ?? null])));
      setUserOptions(users);

      form.resetFields();
      if (isNew) {
        const project: any = projectResult.data;
        form.setFieldsValue({
          status: "Open",
          event_date: dayjs(),
          reported_by_user_id: identityIdRef.current,
          sales_account_user_id: project?.sales_account_user_id ?? identityIdRef.current,
          ...(project
            ? {
                type_phrase_id: types.find((t) => t.code === "NB")?.value,
                newbuilding_project_id: project.id,
                customer_company_id: project.customer_company_id,
                shipyard_company_id: project.shipyard_company_id,
              }
            : {}),
        });
        setProjectTeamId(project?.assigned_team_id ?? null);
        lastSupplierRef.current = undefined;
      } else {
        const he: any = hullEventResult.data;
        setHullEvent(he);
        if (he) {
          const nb = Array.isArray(he.hull_event_newbuilding_details) ? he.hull_event_newbuilding_details[0] : he.hull_event_newbuilding_details;
          form.setFieldsValue({
            vessel_id: he.vessel_id,
            snapshot_vessel_name: he.snapshot_vessel_name,
            type_phrase_id: he.type_phrase_id,
            newbuilding_project_id: he.newbuilding_project_id,
            status: he.status,
            lost_reason: he.lost_reason,
            event_date: he.event_date ? dayjs(he.event_date) : null,
            ...Object.fromEntries(SNAPSHOT_ROLES.map((r) => [snapshotField(r), he[snapshotField(r)]])),
            customer_company_id: he.customer_company_id,
            supplier_last_hullevent_id: he.supplier_last_hullevent_id,
            supplier_this_hullevent_id: he.supplier_this_hullevent_id,
            vertical_af_product_id: he.vertical_af_product_id,
            flat_bottom_af_product_id: he.flat_bottom_af_product_id,
            vertical_offered_af_product_id: he.vertical_offered_af_product_id,
            flat_bottom_offered_af_product_id: he.flat_bottom_offered_af_product_id,
            dealer_company_id: he.dealer_company_id,
            shipyard_company_id: he.shipyard_company_id,
            facilitating_partner_company_id: he.facilitating_partner_company_id,
            service_period_months: he.service_period_months,
            opportunity_value: he.opportunity_value,
            opportunity_value_currency: he.opportunity_value_currency,
            opportunity_litres: he.opportunity_litres,
            location_continent: he.location_continent,
            location_country_id: he.location_country_id,
            reported_by_user_id: he.reported_by_user_id,
            sales_account_user_id: he.sales_account_user_id,
            technical_service_rep_user_id: he.technical_service_rep_user_id,
            second_technical_service_rep_user_id: he.second_technical_service_rep_user_id,
            dock_in_date: he.dock_in_date ? dayjs(he.dock_in_date) : null,
            dock_out_date: he.dock_out_date ? dayjs(he.dock_out_date) : null,
            performance_guarantee: he.performance_guarantee,
            newbuilding_code: nb?.newbuilding_code,
            newbuilding_deadweight_tonnage: nb?.newbuilding_deadweight_tonnage,
            newbuilding_teu: nb?.newbuilding_teu,
            contract_date: nb?.contract_date ? dayjs(nb.contract_date) : null,
            steel_cut_date: nb?.steel_cut_date ? dayjs(nb.steel_cut_date) : null,
          });
          lastSupplierRef.current = he.supplier_this_hullevent_id ?? undefined;
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, projectIdParam]);

  // Changing the supplier must not leave an antifouling product of another supplier behind
  // (the DB rejects that pair); ask, then clear - cancel restores the previous supplier.
  const handleSupplierChange = (newSupplier?: string) => {
    const conflicting = AF_PRODUCT_FIELDS.filter((f) => {
      const product = afProducts.find((p) => p.id === form.getFieldValue(f));
      return product && product.supplier_id !== newSupplier;
    });
    if (conflicting.length === 0) {
      lastSupplierRef.current = newSupplier;
      return;
    }
    const names = conflicting.map((f) => afProducts.find((p) => p.id === form.getFieldValue(f))!.name).join(", ");
    modal.confirm({
      title: "Clear antifouling products?",
      content: `${names} belong${conflicting.length === 1 ? "s" : ""} to a different supplier and will be cleared.`,
      okText: "Change supplier",
      onOk: () => {
        form.setFieldsValue(Object.fromEntries(conflicting.map((f) => [f, undefined])));
        lastSupplierRef.current = newSupplier;
      },
      onCancel: () => form.setFieldsValue({ [SUPPLIER_FIELD]: lastSupplierRef.current }),
    });
  };

  const cancelTarget = isNew ? (projectIdParam ? `/newbuildings/${projectIdParam}` : "/hull-events") : `/hull-events/${id}`;

  const save = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const { newbuilding_code, newbuilding_deadweight_tonnage, newbuilding_teu, contract_date, steel_cut_date, ...hullEventValues } = values;
      const typeCode = typeOptions.find((t) => t.value === hullEventValues.type_phrase_id)?.code ?? null;
      const isNewbuilding = typeCode === "NB";
      // A cleared Select / InputNumber yields undefined, which an update would silently skip.
      const row: Record<string, any> = {
        ...hullEventValues,
        // hull_events.type_code is set by a trigger on insert only; keep it in step when the type is changed on an edit.
        type_code: typeCode,
        status: hullEventValues.status ?? "Open",
        lost_reason: hullEventValues.status === "Lost" ? (hullEventValues.lost_reason ?? null) : null,
        event_date: hullEventValues.event_date.startOf("month").format("YYYY-MM-DD"),
        dock_in_date: hullEventValues.dock_in_date ? hullEventValues.dock_in_date.format("YYYY-MM-DD") : null,
        dock_out_date: hullEventValues.dock_out_date ? hullEventValues.dock_out_date.format("YYYY-MM-DD") : null,
        // Only a newbuilding event belongs to a newbuilding project.
        newbuilding_project_id: isNewbuilding ? (hullEventValues.newbuilding_project_id ?? null) : null,
        // A newbuilding is the vessel's first event, so there is no previous supplier.
        ...(isNewbuilding ? { supplier_last_hullevent_id: null } : {}),
      };
      for (const f of [
        "vessel_id",
        "snapshot_vessel_name",
        "customer_company_id",
        "supplier_last_hullevent_id",
        "dealer_company_id",
        "shipyard_company_id",
        "facilitating_partner_company_id",
        "service_period_months",
        "opportunity_value",
        "opportunity_value_currency",
        "opportunity_litres",
        "location_continent",
        "location_country_id",
        "reported_by_user_id",
        "sales_account_user_id",
        "technical_service_rep_user_id",
        "second_technical_service_rep_user_id",
        "performance_guarantee",
        SUPPLIER_FIELD,
        ...AF_PRODUCT_FIELDS,
        ...OFFERED_AF_PRODUCT_FIELDS,
        ...SNAPSHOT_ROLES.map(snapshotField),
      ]) {
        row[f] = row[f] ?? null;
      }
      if (isNew && projectTeamId && isNewbuilding && row.newbuilding_project_id === projectIdParam) row.assigned_team_id = projectTeamId;

      let hullEventId = id;
      if (isNew) {
        const { data, error } = await supabaseClient.from("hull_events").insert(row).select("id").single();
        if (error) throw error;
        hullEventId = data.id;
      } else {
        const { data, error } = await supabaseClient.from("hull_events").update(row).eq("id", id).select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("Could not save - this Hull Event may have been deleted, or you no longer have permission to edit it.");
        }
      }

      if (isNewbuilding) {
        const { data: nbRow, error: nbError } = await supabaseClient
          .from("hull_event_newbuilding_details")
          .upsert({
            hull_event_id: hullEventId,
            newbuilding_code: newbuilding_code || null,
            newbuilding_deadweight_tonnage: newbuilding_deadweight_tonnage ?? null,
            newbuilding_teu: newbuilding_teu ?? null,
            contract_date: contract_date ? contract_date.format("YYYY-MM-DD") : null,
            steel_cut_date: steel_cut_date ? steel_cut_date.format("YYYY-MM-DD") : null,
          })
          .select("hull_event_id");
        if (nbError || !nbRow || nbRow.length === 0) {
          // The hull event itself is saved; stay on a page where the details can be retried.
          if (isNew) navigate(`/hull-events/${hullEventId}/edit`, { replace: true });
          throw new Error(nbError?.message ?? "The hull event was saved, but its newbuilding details were not - you may not have permission to edit them.");
        }
      }

      message.success(isNew ? "Hull event created" : "Saved");
      navigate(`/hull-events/${hullEventId}`);
    } catch (e: any) {
      if (e?.errorFields) {
        message.error("Please fix the highlighted fields before saving");
      } else {
        // RLS: with an own/team scope the saved row must stay in that scope, and an event without a Sales Rep
        // is nobody's own - only an admin can save it (~/npm_tool/docs/permissions.md).
        const noSalesRep = e?.code === "42501" && !form.getFieldValue("sales_account_user_id");
        message.error(noSalesRep ? "Only an admin can save a hull event without a Sales Rep - please pick one." : errorText(e, "Could not save"));
      }
    } finally {
      setSaving(false);
    }
  };

  // A newbuilding can exist before its vessel does: fall back to its code.
  const savedNb = Array.isArray(hullEvent?.hull_event_newbuilding_details)
    ? hullEvent.hull_event_newbuilding_details[0]
    : hullEvent?.hull_event_newbuilding_details;
  const heName = hullEvent?.snapshot_vessel_name ?? hullEvent?.vessels?.name ?? savedNb?.newbuilding_code;
  usePageBannerTitle(isNew ? "New Hull Event" : heName ? `Edit ${heName}` : undefined);
  usePageBannerCrumbExtra(hullEvent?.phrases?.text_en);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }
  if (!isNew && !hullEvent) {
    return <Alert type="error" showIcon message="Hull event not found" description="It may have been deleted, or you may not have access to it." />;
  }

  const readOnly = !isNew && !hullEvent?.can_edit;

  return (
    <Show
      title={isNew ? "New Hull Event" : "Edit Hull Event"}
      isLoading={saving}
      headerButtons={
        <>
          <Button onClick={() => navigate(cancelTarget)}>Cancel</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} disabled={readOnly}>
            Save
          </Button>
        </>
      }
    >
      {readOnly && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="You do not have permission to edit this hull event." />
      )}
      <Form form={form} layout="vertical" disabled={readOnly}>
        {sectionTitle("Event")}
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item
              label={L("vessel_id")}
              name="vessel_id"
              dependencies={["type_phrase_id"]}
              rules={[
                {
                  validator: (_, value) =>
                    value || isNewbuildingForm || !form.getFieldValue("type_phrase_id")
                      ? Promise.resolve()
                      : Promise.reject(new Error("A vessel is required - only a newbuilding can exist without one")),
                },
              ]}
              tooltip="Not required for a newbuilding: the vessel can be linked once it is in SeaWeb."
            >
              <RemoteSelect
                loadOptions={searchVesselOptions}
                loadLabels={loadVesselOptionsByIds}
                placeholder={isNewbuildingForm ? "No vessel yet (newbuilding) - type a name or IMO to link one" : "Type a vessel name or IMO"}
                onChange={async (vesselId: string | null | undefined) => {
                  // Fills in the name the first time a vessel gets linked (e.g. a Newbuilding picking up its real SeaWeb
                  // record) - never overwrites a name already present, whether that's from the insert-time snapshot or a
                  // deliberate manual edit.
                  form.setFieldValue("vessel_id", vesselId ?? undefined);
                  if (!vesselId || form.getFieldValue("snapshot_vessel_name")) return;
                  const { data } = await supabaseClient.from("vessels").select("name").eq("id", vesselId).single();
                  if (data?.name && !form.getFieldValue("snapshot_vessel_name")) form.setFieldValue("snapshot_vessel_name", data.name);
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={L("snapshot_vessel_name")}
              name="snapshot_vessel_name"
              tooltip="Frozen at the time of this Hull Event - a vessel can be renamed later, but this record should keep the name it had then. Filled in automatically from the vessel (using vessel history where available) if left empty; editable if it's wrong."
            >
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={L("type_phrase_id")} name="type_phrase_id" rules={[{ required: true }]}>
              <Select options={typeOptions} />
            </Form.Item>
          </Col>
          {isNewbuildingForm && (
            <Col xs={24} md={12}>
              <Form.Item
                label={L("newbuilding_project_id")}
                name="newbuilding_project_id"
                tooltip="The newbuilding project this vessel belongs to. Optional."
              >
                <Select options={projectOptions} showSearch optionFilterProp="label" allowClear />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} md={12}>
            <Form.Item label={L("status")} name="status">
              <Select options={HULL_EVENT_STATUS_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={L("event_date")}
              name="event_date"
              rules={[{ required: true }]}
              tooltip="Month-grain only, matching the legacy year/month reporting - no exact day is tracked."
            >
              <DatePicker picker="month" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          {statusValue === "Lost" && (
            <Col xs={24} md={12}>
              <Form.Item
                label={L("lost_reason")}
                name="lost_reason"
                rules={[{ required: true, message: "A reason is required when marking a Hull Event as Lost" }]}
              >
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} md={12}>
            <Form.Item label={L("reported_by_user_id")} name="reported_by_user_id">
              <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
        </Row>

        {sectionTitle("Ownership")}
        <Row gutter={24}>
          {SNAPSHOT_ROLES.map((role) => (
            <Col xs={24} md={12} key={role}>
              <Form.Item
                label={L(snapshotField(role))}
                name={snapshotField(role)}
                tooltip="Copied from the vessel when this Hull Event is created (if left empty) - still editable here if the vessel's data was missing or out of date at that time. Changing it does not touch the vessel."
              >
                <RemoteSelect loadOptions={(term) => searchCompanyOptionsWithGroup(term)} loadLabels={loadCompanyOptionsWithGroupByIds} />
              </Form.Item>
            </Col>
          ))}
        </Row>

        {sectionTitle("Commercial")}
        <Row gutter={24}>
          {!isLightForm && (
          <Col xs={24} md={12}>
            <Form.Item
              label={L("customer_company_id")}
              name="customer_company_id"
              tooltip="The commercial customer for this job - not the same as the vessel's ownership roles. New specifications on this hull event default to it."
            >
              <RemoteSelect
                loadOptions={(term) => searchCompanyOptionsWithGroup(term, "customer")}
                loadLabels={loadCompanyOptionsWithGroupByIds}
              />
            </Form.Item>
          </Col>
          )}
          <Col xs={24} md={12}>
            <Form.Item
              label={L("shipyard_company_id")}
              name="shipyard_company_id"
              tooltip="Which yard is doing this hull event - not the vessel's original shipbuilder. Not pre-filled from anything; pick it directly."
            >
              <RemoteSelect
                loadOptions={(term) => searchCompanyOptionsWithGroup(term, "shipyard")}
                loadLabels={loadCompanyOptionsWithGroupByIds}
              />
            </Form.Item>
          </Col>
          {!isLightForm && (
          <Col xs={24} md={12}>
            <Form.Item label={L("dealer_company_id")} name="dealer_company_id">
              <Select options={dealerOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          )}
          {!isLightForm && (
          <Col xs={24} md={12}>
            <Form.Item label={L("facilitating_partner_company_id")} name="facilitating_partner_company_id">
              <Select options={facilitatingPartnerOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          )}
          <Col xs={24} md={12}>
            <Form.Item label={L("sales_account_user_id")} name="sales_account_user_id">
              <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={L("technical_service_rep_user_id")} name="technical_service_rep_user_id">
              <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={L("second_technical_service_rep_user_id")} name="second_technical_service_rep_user_id">
              <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={L("dock_in_date")} name="dock_in_date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label={L("dock_out_date")} name="dock_out_date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={L("location_continent")}
              name="location_continent"
              tooltip="Auto-filled from the latest specification's Continent, once known - never overwrites a more precise value already set here. Still directly editable."
            >
              <Select options={CONTINENT_OPTIONS} allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label={L("location_country_id")}
              name="location_country_id"
              tooltip="Auto-filled from the latest specification's Country, once known - never overwrites a value already set here. Still directly editable."
            >
              <Select
                options={countryOptions}
                showSearch
                optionFilterProp="label"
                allowClear
                onChange={(countryId?: string) => {
                  const continent = countryId ? countryContinentById[countryId] : null;
                  if (continent) form.setFieldValue("location_continent", continent);
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        {sectionTitle("Supplier and antifouling")}
        <Row gutter={24}>
          {!isNewbuildingForm && (
          <Col xs={24} md={12}>
            <Form.Item label={L("supplier_last_hullevent_id")} name="supplier_last_hullevent_id">
              <Select options={makerOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          )}
          <Col xs={24} md={12}>
            <Form.Item
              label={L("supplier_this_hullevent_id")}
              name="supplier_this_hullevent_id"
              tooltip="Auto-set to our own company once a specification on this hull event is accepted - still editable."
            >
              <Select options={makerOptions} showSearch optionFilterProp="label" allowClear onChange={handleSupplierChange} />
            </Form.Item>
          </Col>
          {hasAppliedProduct(typeCodeForm) && AF_PRODUCT_FIELDS.map((f) => (
            <Col xs={24} md={12} key={f}>
              <Form.Item
                label={L(f)}
                name={f}
                tooltip="Searches the products of all suppliers. Picking one fills or changes the supplier; type a new name to add a product."
              >
                <AntifoulingProductSelect
                  form={form}
                  fieldName={f}
                  products={afProducts}
                  reloadProducts={reloadAfProducts}
                  supplierOptions={makerOptions}
                  onSupplierSet={(supplierId) => (lastSupplierRef.current = supplierId)}
                />
              </Form.Item>
            </Col>
          ))}
          {!isLightForm && OFFERED_AF_PRODUCT_FIELDS.map((f) => (
            <Col xs={24} md={12} key={f}>
              <Form.Item
                label={L(f)}
                name={f}
                tooltip="What we offer. Free to edit; replaced by the antifouling of the latest specification of this event whenever that specification is saved."
              >
                <Select options={offeredAfOptions} showSearch optionFilterProp="label" allowClear placeholder="Search antifouling products" />
              </Form.Item>
            </Col>
          ))}
          {!isLightForm && (
          <Col xs={24} md={12}>
            <Form.Item
              label={L("service_period_months")}
              name="service_period_months"
              tooltip="Auto-set from the accepted specification's Service Period - still editable."
            >
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          )}
          {!isLightForm && (
            <>
              <Col xs={24} md={8}>
                <Form.Item
                  label={L("opportunity_value")}
                  name="opportunity_value"
                  tooltip="Free to edit. Replaced by the net sales of a specification of this event when that specification is approved."
                >
                  <InputNumber style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label={L("opportunity_value_currency")} name="opportunity_value_currency">
                  <Select options={CURRENCY_OPTIONS} allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label={L("opportunity_litres")}
                  name="opportunity_litres"
                  tooltip="Free to edit. Replaced by the offered litres of a specification of this event when that specification is approved."
                >
                  <InputNumber style={{ width: "100%" }} min={0} addonAfter="L" />
                </Form.Item>
              </Col>
            </>
          )}
          <Col xs={24} md={12}>
            <Form.Item label={L("performance_guarantee")} name="performance_guarantee">
              <Select
                options={[
                  { value: true, label: "Yes" },
                  { value: false, label: "No" },
                ]}
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>

        {isNewbuildingForm && (
          <>
            {sectionTitle("Newbuilding details")}
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Form.Item label={L("newbuilding_code")} name="newbuilding_code" tooltip="The code of this vessel within its project.">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={L("newbuilding_contract_date")} name="contract_date">
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={L("newbuilding_deadweight_tonnage")} name="newbuilding_deadweight_tonnage">
                  <InputNumber style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={L("newbuilding_teu")} name="newbuilding_teu">
                  <InputNumber style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label={L("newbuilding_steel_cut_date")} name="steel_cut_date">
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}
      </Form>
    </Show>
  );
};
