// Ported 1:1 from the NPM tool (app/src/pages/admin/tenants/list.tsx).
import { useEffect, useState } from "react";
import { List } from "@rbp/core";
import { Table, Button, Modal, Form, Input, Popconfirm, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { RemoteSelect } from "@rbp/ui";
import { searchCompanyOptions, loadCompanyOptionsByIds } from "../../../modules/companies/companies";
import { errorText } from "@rbp/core";

type Tenant = {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
};

export const TenantList = () => {
  const { message } = AntdApp.useApp();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    // platform: a tenant (owner associate) is a team with its extension row owner_associate_teams (company link)
    const { data } = await supabaseClient.from("teams").select("id, name, owner_associate_teams!inner(company_id, companies(name))").order("name");
    setTenants((data ?? []).map((t: any) => ({ id: t.id, name: t.name, company_id: t.owner_associate_teams?.company_id ?? null, company_name: t.owner_associate_teams?.companies?.name ?? null })));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant);
    form.setFieldsValue({ name: tenant.name });
    setModalOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    const name = String(values.name).trim();
    try {
      if (editing) {
        const { error } = await supabaseClient.from("teams").update({ name }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.rpc("create_tenant", { p_name: name, p_company_id: values.company_id ?? null });
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not save tenant"));
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("teams").delete().eq("id", id);
    if (error) {
      message.error(
        error.code === "23503"
          ? "This tenant is still used by specifications or orders and cannot be deleted."
          : error.message,
      );
      return;
    }
    load();
  };

  return (
    <List
      title="Tenants"
      headerButtons={
        <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>
          New tenant
        </Button>
      }
    >
      <Table dataSource={tenants} rowKey="id" loading={loading} pagination={false}>
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="company_name" title="Company" render={(v: string | null) => v ?? "—"} />
        <Table.Column
          title="Actions"
          width={100}
          render={(_, record: Tenant) => (
            <>
              <Button icon={<EditOutlined />} type="text" onClick={() => openEdit(record)} />
              <Popconfirm title="Delete this tenant?" onConfirm={() => remove(record.id)}>
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </>
          )}
        />
      </Table>

      <Modal open={modalOpen} title={editing ? "Edit tenant" : "New tenant"} onCancel={() => setModalOpen(false)} onOk={save}>
        <Form form={form} layout="vertical">
          <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="e.g. NPMEU" />
          </Form.Item>
          {!editing && (
            <Form.Item
              label="Company"
              name="company_id"
              tooltip="Leave empty to create a new company named like the tenant (short code = name)."
            >
              <RemoteSelect
                loadOptions={searchCompanyOptions}
                loadLabels={loadCompanyOptionsByIds}
                placeholder="— (create a new company) - type to search"
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </List>
  );
};
