// Ported 1:1 from the NPM tool (app/src/pages/admin/defaultSuppliers/list.tsx).
import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Select, Popconfirm, Input, Space, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { loadTenantOptions } from "@rbp/module-companies/src/modules/tenants/tenants.ts";
import { loadCompanyOptions } from "@rbp/module-companies/src/modules/companies/companies.ts";
import type { PhraseOption as Option } from "@rbp/core";
import { errorText } from "@rbp/core";

type Row = {
  id: string;
  // null = all Owner Associates (a tenant's own row for the country wins)
  team_id: string | null;
  country_id: string;
  supplier_company_id: string;
  team_name: string | null;
  country_name: string | null;
  supplier_name: string | null;
};

// The supplier an offer gets by default when its delivery country is picked, per tenant or for all tenants (table
// country_default_suppliers, migration 20261105100000; a tenant's own row wins over the all-tenants one). The offer
// page sets it and the user can still change it.
const ALL_TENANTS = "All Owner Associates";
export const DefaultSupplierList = () => {
  const { message } = AntdApp.useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tenantOptions, setTenantOptions] = useState<Option[]>([]);
  const [countryOptions, setCountryOptions] = useState<Option[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const formTenantId = Form.useWatch("team_id", form);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabaseClient
      .from("country_default_suppliers")
      .select("id, team_id, country_id, supplier_company_id, tenants:teams(name), countries(name_en), companies(name)")
      .order("id");
    if (error) message.error(errorText(error));
    setRows(
      ((data ?? []) as any[])
        .map((r) => ({
          id: r.id,
          team_id: r.team_id,
          country_id: r.country_id,
          supplier_company_id: r.supplier_company_id,
          team_name: r.team_id ? (r.tenants?.name ?? null) : ALL_TENANTS,
          country_name: r.countries?.name_en ?? null,
          supplier_name: r.companies?.name ?? null,
        }))
        .sort((a, b) => (a.team_name ?? "").localeCompare(b.team_name ?? "") || (a.country_name ?? "").localeCompare(b.country_name ?? "")),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    loadTenantOptions().then(setTenantOptions);
    supabaseClient
      .from("countries")
      .select("id, name_en")
      .order("name_en")
      .then(({ data }) => setCountryOptions((data ?? []).map((c: any) => ({ value: c.id, label: c.name_en }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suppliers are companies with the supplier role at the chosen tenant (the same list the offer page offers); for all
  // tenants, a supplier at any of them (an offer only takes it if it is a supplier at the offer's tenant).
  useEffect(() => {
    if (editing === null) return;
    loadCompanyOptions("supplier", formTenantId ?? null).then(setSupplierOptions);
  }, [formTenantId, editing]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => [r.team_name, r.country_name, r.supplier_name].some((v) => (v ?? "").toLowerCase().includes(term)));
  }, [rows, search]);

  const open = (row: Row | "new") => {
    form.resetFields();
    if (row !== "new") form.setFieldsValue({ team_id: row.team_id, country_ids: row.country_id, supplier_company_id: row.supplier_company_id });
    setEditing(row);
  };

  // Several countries at once: one row each; an existing row of a tenant + country is replaced.
  const save = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    // Multiple select when adding, a single country when editing.
    const countryIds: string[] = Array.isArray(values.country_ids) ? values.country_ids : [values.country_ids];
    setSaving(true);
    try {
      if (editing && editing !== "new") {
        const { error } = await supabaseClient
          .from("country_default_suppliers")
          .update({ team_id: values.team_id ?? null, country_id: countryIds[0], supplier_company_id: values.supplier_company_id })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from("country_default_suppliers").upsert(
          countryIds.map((countryId) => ({ team_id: values.team_id ?? null, country_id: countryId, supplier_company_id: values.supplier_company_id })),
          { onConflict: "team_id,country_id" },
        );
        if (error) throw error;
      }
      message.success("Saved");
      setEditing(null);
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not save", { "23505": "There is already a default supplier for that Owner Associate and country." }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("country_default_suppliers").delete().eq("id", id);
    if (error) message.error(errorText(error, "Could not delete"));
    else load();
  };

  return (
    <List
      headerButtons={
        <Space wrap>
          <Input.Search placeholder="Search" allowClear onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open("new")}>
            Add
          </Button>
        </Space>
      }
    >
      <Table<Row> dataSource={visible} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 50 }}>
        <Table.Column<Row> title="Owner Associate" dataIndex="team_name" sorter={(a, b) => (a.team_name ?? "").localeCompare(b.team_name ?? "")} />
        <Table.Column<Row> title="Country" dataIndex="country_name" sorter={(a, b) => (a.country_name ?? "").localeCompare(b.country_name ?? "")} />
        <Table.Column<Row> title="Default supplier" dataIndex="supplier_name" sorter={(a, b) => (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "")} />
        <Table.Column<Row>
          width={100}
          render={(_, r) => (
            <Space>
              <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} />
              <Popconfirm title="Remove this default?" onConfirm={() => remove(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )}
        />
      </Table>
      <Modal
        open={editing !== null}
        title={editing === "new" ? "Add default supplier" : "Edit default supplier"}
        onCancel={() => setEditing(null)}
        onOk={save}
        okButtonProps={{ loading: saving }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Owner Associate" name="team_id" tooltip="Empty = all Owner Associates. One with a row of its own for the country uses that one.">
            <Select
              options={tenantOptions}
              showSearch
              optionFilterProp="label"
              allowClear
              placeholder={ALL_TENANTS}
              onChange={() => form.setFieldValue("supplier_company_id", undefined)}
            />
          </Form.Item>
          <Form.Item label={editing === "new" ? "Countries" : "Country"} name="country_ids" rules={[{ required: true }]}>
            <Select options={countryOptions} showSearch optionFilterProp="label" mode={editing === "new" ? "multiple" : undefined} />
          </Form.Item>
          <Form.Item label="Default supplier" name="supplier_company_id" rules={[{ required: true }]}>
            <Select options={supplierOptions} showSearch optionFilterProp="label" />
          </Form.Item>
        </Form>
      </Modal>
    </List>
  );
};
