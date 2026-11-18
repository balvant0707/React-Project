// Ported 1:1 from the NPM tool (app/src/pages/newbuildings/projectFormModal.tsx).
import { useEffect, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { Modal, Form, Select, Input, InputNumber, DatePicker, Row, Col, App as AntdApp } from "antd";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-fleet/src/fieldLabels.ts";
import { RemoteSelect } from "@rbp/ui";
import type { PhraseOption as Option } from "@rbp/core";
import { loadDistinctShipTypeGroups } from "../../modules/vessels/vessels";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { loadCompanyOptions, loadCompanyOptionsWithGroupByIds, searchCompanyOptionsWithGroup } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { NEWBUILDING_PROJECT_STATUS_OPTIONS } from "./statusOptions";
import { CURRENCY_OPTIONS } from "@rbp/ui";
import { errorText } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.newbuilding_projects) => fieldLabel("newbuilding_projects", field);

// A row of public.newbuilding_projects (~/npm_tool/docs/domain-model.md, "Newbuilding projects").
export type NewbuildingProject = {
  id: string;
  title: string;
  status: string;
  lost_reason: string | null;
  shipyard_company_id: string | null;
  customer_company_id: string;
  owner_associate_company_id: string | null;
  bidding_date: string | null;
  maker_company_ids: string[];
  estimated_contract_value: number | null;
  estimated_contract_value_currency: string | null;
  cash_rebate: number | null;
  ship_type: string | null;
  sales_account_user_id: string | null;
  assigned_team_id: string | null;
};

// Customers and owner associates are searched on the server (every SeaWeb company is a candidate); the owner associate has
// no company role of its own - owners come from the vessel data - so that search is not restricted to a role.
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

type Props = {
  open: boolean;
  // null = create a new project.
  project: NewbuildingProject | null;
  onClose: () => void;
  // Called with the id of the saved project.
  onSaved: (id: string) => void;
};

export const ProjectFormModal = ({ open, project, onClose, onSaved }: Props) => {
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [makerOptions, setMakerOptions] = useState<Option[]>([]);
  const [userOptions, setUserOptions] = useState<Option[]>([]);
  const [teamOptions, setTeamOptions] = useState<Option[]>([]);
  const [shipTypeOptions, setShipTypeOptions] = useState<Option[]>([]);
  const statusValue = Form.useWatch("status", form);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      loadCompanyOptions("maker"),
      loadUserOptions(),
      loadDistinctShipTypeGroups(),
      supabaseClient.from("teams").select("id, name, oa:team_uses!left(use)").eq("oa.use", "owner_associate").is("oa", null).order("name"),
    ]).then(([makers, users, shipTypes, { data: teams }]) => {
      setShipTypeOptions(shipTypes);
      setMakerOptions(makers);
      setUserOptions(users);
      setTeamOptions((teams ?? []).map((t) => ({ value: t.id, label: t.name })));
    });
    form.resetFields();
    if (project) {
      form.setFieldsValue({
        ...project,
        bidding_date: project.bidding_date ? dayjs(project.bidding_date) : null,
      });
    } else {
      form.setFieldsValue({ status: "Open", maker_company_ids: [], sales_account_user_id: identity?.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  const submit = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      // A cleared Select / InputNumber yields undefined, which an update would silently skip.
      const row = {
        title: values.title.trim(),
        status: values.status ?? "Open",
        lost_reason: values.status === "Lost" ? values.lost_reason : null,
        bidding_date: values.bidding_date ? values.bidding_date.format("YYYY-MM-DD") : null,
        shipyard_company_id: values.shipyard_company_id ?? null,
        customer_company_id: values.customer_company_id,
        owner_associate_company_id: values.owner_associate_company_id ?? null,
        maker_company_ids: values.maker_company_ids ?? [],
        estimated_contract_value: values.estimated_contract_value ?? null,
        estimated_contract_value_currency: values.estimated_contract_value_currency || null,
        cash_rebate: values.cash_rebate ?? null,
        ship_type: values.ship_type ?? null,
        sales_account_user_id: values.sales_account_user_id ?? null,
        assigned_team_id: values.assigned_team_id ?? null,
      };
      if (project) {
        const { data, error } = await supabaseClient.from("newbuilding_projects").update(row).eq("id", project.id).select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("Could not save - this project may have been deleted, or you no longer have permission to edit it.");
        }
        message.success("Saved");
        onSaved(project.id);
      } else {
        const { data, error } = await supabaseClient.from("newbuilding_projects").insert(row).select("id").single();
        if (error) throw error;
        onSaved(data.id);
      }
    } catch (e: any) {
      if (e?.errorFields) {
        message.error("Please fix the highlighted fields before saving");
      } else {
        message.error(errorText(e, "Could not save the newbuilding project"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={project ? "Edit Newbuilding Project" : "New Newbuilding Project"}
      onCancel={onClose}
      onOk={submit}
      okText={project ? "Save" : "Create"}
      confirmLoading={saving}
      width={640}
      // Renders the form while closed, so the form instance is connected when the effect above fills it on open.
      forceRender
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label={L("title")}
          name="title"
          rules={[{ required: true, whitespace: true, message: "A short description is required" }]}
          tooltip='A short description of the project, e.g. "4x 55.000 DWT Bulk Carrier".'
        >
          <Input autoFocus placeholder="4x 55.000 DWT Bulk Carrier" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={L("status")} name="status">
              <Select options={NEWBUILDING_PROJECT_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={L("bidding_date")} name="bidding_date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        {statusValue === "Lost" && (
          <Form.Item label={L("lost_reason")} name="lost_reason" rules={[{ required: true, message: "A reason is required when marking a project as Lost" }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        )}
        <Form.Item label={L("ship_type")} name="ship_type" tooltip="The ship type group of the series (Admin > Configuration > Ship type groups).">
          <Select options={shipTypeOptions} showSearch optionFilterProp="label" allowClear />
        </Form.Item>
        <Form.Item label={L("customer_company_id")} name="customer_company_id" rules={[{ required: true, message: "A customer is required" }]}>
          <RemoteSelect {...customerSearch} />
        </Form.Item>
        <Form.Item label={L("shipyard_company_id")} name="shipyard_company_id">
          <RemoteSelect {...shipyardSearch} />
        </Form.Item>
        <Form.Item
          label={L("owner_associate_company_id")}
          name="owner_associate_company_id"
          tooltip="Any company: owners come from the vessel data, they have no company role of their own."
        >
          <RemoteSelect {...anyCompanySearch} />
        </Form.Item>
        <Form.Item label={L("maker_company_ids")} name="maker_company_ids" tooltip="The paint makers bidding for this project.">
          <Select mode="multiple" options={makerOptions} showSearch optionFilterProp="label" allowClear />
        </Form.Item>
        <Row gutter={16}>
          <Col span={10}>
            <Form.Item label={L("estimated_contract_value")} name="estimated_contract_value">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item label="Currency" name="estimated_contract_value_currency" tooltip="Also the currency of the cash rebate.">
              <Select options={CURRENCY_OPTIONS} allowClear placeholder="EUR" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item label={L("cash_rebate")} name="cash_rebate">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={L("sales_account_user_id")} name="sales_account_user_id">
              <Select options={userOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={L("assigned_team_id")} name="assigned_team_id">
              <Select options={teamOptions} showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};
