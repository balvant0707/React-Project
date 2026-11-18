// Ported 1:1 from the NPM tool (app/src/pages/admin/ports/list.tsx).
import { useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Form, Input, Select, Switch, Popconfirm, Typography, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { CONTINENT_OPTIONS } from "@rbp/module-companies/src/modules/countries/continents.ts";
import { errorText } from "@rbp/core";

type PortRow = {
  id: string;
  name: string;
  country_id: string | null;
  country_name: string | null;
  continent: string | null;
};

type CountryRow = { id: string; name_en: string; continent: string | null };

const PAGE = 1000;

// Ports are self-learning (anyone can add one while typing a spec's Port), so this page is where they get their
// country and continent completed, renamed or removed. Picking a port on a specification fills its country and
// continent from here. Changing the country of a port refills its continent (trigger, migration 20261027110000).
export const PortList = () => {
  const { message } = AntdApp.useApp();
  const [ports, setPorts] = useState<PortRow[]>([]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PortRow | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const rows: PortRow[] = [];
    // PostgREST caps a response at max_rows (1000), so page through.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseClient
        .from("ports")
        .select("id, name, country_id, continent, countries(name_en)")
        .order("name")
        .range(from, from + PAGE - 1);
      if (error) {
        message.error(errorText(error));
        break;
      }
      rows.push(...(data ?? []).map((p: any) => ({ id: p.id, name: p.name, country_id: p.country_id, continent: p.continent, country_name: p.countries?.name_en ?? null })));
      if ((data ?? []).length < PAGE) break;
    }
    setPorts(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabaseClient
      .from("countries")
      .select("id, name_en, continent")
      .order("name_en")
      .then(({ data }) => setCountries((data ?? []) as CountryRow[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continentByCountry = useMemo(() => new Map(countries.map((c) => [c.id, c.continent])), [countries]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ports.filter(
      (p) =>
        (!incompleteOnly || p.country_id == null || p.continent == null) &&
        (term === "" || p.name.toLowerCase().includes(term) || (p.country_name ?? "").toLowerCase().includes(term)),
    );
  }, [ports, search, incompleteOnly]);
  const incompleteCount = ports.filter((p) => p.country_id == null || p.continent == null).length;

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (port: PortRow) => {
    setEditing(port);
    form.setFieldsValue({ name: port.name, country_id: port.country_id ?? undefined, continent: port.continent ?? undefined });
    setModalOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    const payload = { name: String(values.name).trim(), country_id: values.country_id ?? null, continent: values.continent ?? null };
    const { error } = editing
      ? await supabaseClient.from("ports").update(payload).eq("id", editing.id)
      : await supabaseClient.from("ports").insert(payload);
    if (error) {
      message.error(errorText(error, undefined, { "23505": "A port with this name already exists." }));
      return;
    }
    setModalOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("ports").delete().eq("id", id);
    if (error) {
      message.error(errorText(error));
      return;
    }
    load();
  };

  return (
    <List
      title="Ports"
      headerButtons={
        <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>
          New port
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        The port list behind the Port field of offers and orders. Picking a port fills its country and continent; a port
        added on the fly while typing has neither until it is completed here. Deleting a port clears it from the offers
        that used it.
      </Typography.Paragraph>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input.Search allowClear placeholder="Search ports or countries" style={{ width: 280 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span>
          <Switch checked={incompleteOnly} onChange={setIncompleteOnly} size="small" /> Missing country or continent ({incompleteCount.toLocaleString()})
        </span>
      </div>
      <Table<PortRow> size="small" rowKey="id" loading={loading} dataSource={visible} pagination={{ pageSize: 50, showSizeChanger: false }}>
        <Table.Column<PortRow> dataIndex="name" title="Port" sorter={(a, b) => a.name.localeCompare(b.name)} defaultSortOrder="ascend" />
        <Table.Column<PortRow> dataIndex="country_name" title="Country" render={(v: string | null) => v ?? "-"} sorter={(a, b) => (a.country_name ?? "").localeCompare(b.country_name ?? "")} />
        <Table.Column<PortRow> dataIndex="continent" title="Continent" render={(v: string | null) => v ?? "-"} sorter={(a, b) => (a.continent ?? "").localeCompare(b.continent ?? "")} />
        <Table.Column<PortRow>
          title="Actions"
          width={100}
          render={(_, record) => (
            <>
              <Button icon={<EditOutlined />} type="text" onClick={() => openEdit(record)} />
              <Popconfirm title="Delete this port?" onConfirm={() => remove(record.id)}>
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </>
          )}
        />
      </Table>

      <Modal open={modalOpen} title={editing ? "Edit port" : "New port"} onCancel={() => setModalOpen(false)} onOk={save} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item label="Port" name="name" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="e.g. Rotterdam" />
          </Form.Item>
          <Form.Item label="Country" name="country_id">
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={countries.map((c) => ({ value: c.id, label: c.name_en }))}
              onChange={(id?: string) => {
                const continent = id ? continentByCountry.get(id) : null;
                if (continent) form.setFieldValue("continent", continent);
              }}
            />
          </Form.Item>
          <Form.Item label="Continent" name="continent">
            <Select allowClear options={CONTINENT_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </List>
  );
};
