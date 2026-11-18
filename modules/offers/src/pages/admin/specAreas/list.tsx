// Ported 1:1 from the NPM tool (app/src/pages/admin/specAreas/list.tsx).
import { useEffect, useState } from "react";
import { List } from "@rbp/core";
import { Table, Button, Modal, Form, Input, Select, Popconfirm, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-offers/src/fieldLabels.ts";
import { errorText } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.spec_areas) => fieldLabel("spec_areas", field);

type SpecArea = {
  id: string;
  code: string | null;
  name_en: string;
  is_immersed: boolean;
  af_zone: "flat_bottom" | "boottop" | "vertical" | null;
  sequence: number;
};

const AF_ZONE_OPTIONS = [
  { value: "flat_bottom", label: "Flat bottom" },
  { value: "boottop", label: "Boottop" },
  { value: "vertical", label: "Vertical" },
];

export const SpecAreaList = () => {
  const { message } = AntdApp.useApp();
  const [areas, setAreas] = useState<SpecArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SpecArea | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const { data } = await supabaseClient.from("spec_areas").select("*").order("sequence");
    setAreas(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ is_immersed: false });
    setModalOpen(true);
  };

  const openEdit = (area: SpecArea) => {
    setEditing(area);
    form.setFieldsValue(area);
    setModalOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    try {
      const payload = { code: values.code, name_en: values.name_en, is_immersed: values.is_immersed, af_zone: values.af_zone ?? null };
      if (editing) {
        const { error } = await supabaseClient.from("spec_areas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: maxRow } = await supabaseClient
          .from("spec_areas")
          .select("sequence")
          .order("sequence", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSequence = (maxRow?.sequence ?? 0) + 1;
        const { error } = await supabaseClient.from("spec_areas").insert({ ...payload, sequence: nextSequence });
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not save area"));
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("spec_areas").delete().eq("id", id);
    if (error) {
      message.error(errorText(error));
      return;
    }
    load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= areas.length) return;
    const a = areas[index];
    const b = areas[targetIndex];
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabaseClient.from("spec_areas").update({ sequence: b.sequence }).eq("id", a.id),
      supabaseClient.from("spec_areas").update({ sequence: a.sequence }).eq("id", b.id),
    ]);
    if (e1 || e2) {
      message.error(e1?.message ?? e2?.message ?? "Could not reorder");
      return;
    }
    load();
  };

  return (
    <List
      title="Areas"
      headerButtons={
        <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>
          New area
        </Button>
      }
    >
      <Table dataSource={areas} rowKey="id" loading={loading} pagination={false}>
        <Table.Column dataIndex="code" title={L("code")} width={100} />
        <Table.Column dataIndex="name_en" title={L("name_en")} />
        <Table.Column dataIndex="is_immersed" title={L("is_immersed")} width={110} render={(v: boolean) => (v ? "Yes" : "No")} />
        <Table.Column
          dataIndex="af_zone"
          title={L("af_zone")}
          width={130}
          render={(v: string | null) => AF_ZONE_OPTIONS.find((o) => o.value === v)?.label ?? "—"}
        />
        <Table.Column
          title="Order"
          width={90}
          render={(_, __, index) => (
            <>
              <Button icon={<ArrowUpOutlined />} type="text" size="small" disabled={index === 0} onClick={() => move(index, -1)} />
              <Button
                icon={<ArrowDownOutlined />}
                type="text"
                size="small"
                disabled={index === areas.length - 1}
                onClick={() => move(index, 1)}
              />
            </>
          )}
        />
        <Table.Column
          title="Actions"
          width={100}
          render={(_, record: SpecArea) => (
            <>
              <Button icon={<EditOutlined />} type="text" onClick={() => openEdit(record)} />
              <Popconfirm title="Delete this area?" onConfirm={() => remove(record.id)}>
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </>
          )}
        />
      </Table>

      <Modal open={modalOpen} title={editing ? "Edit area" : "New area"} onCancel={() => setModalOpen(false)} onOk={save}>
        <Form form={form} layout="vertical">
          <Form.Item label={L("code")} name="code">
            <Input placeholder="short identifier, optional" />
          </Form.Item>
          <Form.Item label={L("name_en")} name="name_en" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={L("is_immersed")} name="is_immersed" rules={[{ required: true }]}>
            <Select
              options={[
                { value: true, label: "Yes" },
                { value: false, label: "No" },
              ]}
            />
          </Form.Item>
          <Form.Item label={L("af_zone")} name="af_zone">
            <Select options={AF_ZONE_OPTIONS} allowClear placeholder="Not antifouling-zone-specific" />
          </Form.Item>
        </Form>
      </Modal>
    </List>
  );
};
