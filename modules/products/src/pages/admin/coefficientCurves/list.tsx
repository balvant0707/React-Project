// Ported 1:1 from the NPM tool (app/src/pages/admin/coefficientCurves/list.tsx).
import { useEffect, useState } from "react";
import { List } from "@rbp/core";
import { Table, Button, Modal, Form, Input, Select, InputNumber, Popconfirm, Typography, App as AntdApp } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { loadCompanyOptionsByIds, searchCompanyOptions } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { RemoteSelect } from "@rbp/ui";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-products/src/fieldLabels.ts";
import { newRowKey } from "@rbp/ui";
import { errorText } from "@rbp/core";

const L = (field: keyof typeof FIELD_LABELS.coefficient_curves) => fieldLabel("coefficient_curves", field);

type Curve = {
  id: string;
  kind: string;
  name: string;
  company_id: string | null;
  companies: { name: string } | null;
  coefficient_points: { id: string }[];
};

type PointRow = { key: string; x_value: number | null; coefficient: number | null };

// Curve kinds are free text in the database (extensible, not a hard enum);
// these are the two the DFT proposal reads. What a curve's x axis means
// depends on the kind - see the x-axis label below.
const KIND_OPTIONS = [
  { value: "speed", label: "Speed" },
  { value: "temperature", label: "Sea temperature" },
];
const X_LABEL: Record<string, string> = { speed: "Speed (kn)", temperature: "Sea temperature (°C)" };

export const CoefficientCurveList = () => {
  const { message } = AntdApp.useApp();
  const [curves, setCurves] = useState<Curve[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Curve | null>(null);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const kind = Form.useWatch("kind", form);

  const load = async () => {
    setLoading(true);
    const { data } = await supabaseClient
      .from("coefficient_curves")
      .select("id, kind, name, company_id, companies(name), coefficient_points(id)")
      .order("kind")
      .order("name");
    setCurves((data ?? []) as unknown as Curve[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ kind: "speed" });
    setPoints([]);
    setModalOpen(true);
  };

  const openEdit = async (curve: Curve) => {
    const { data, error } = await supabaseClient.from("coefficient_points").select("id, x_value, coefficient").eq("curve_id", curve.id).order("x_value");
    // Save always replaces every point (delete-then-insert) with whatever is
    // in `points` at that time - if this fetch fails, opening the modal
    // anyway would show an empty-but-editable curve, and a plain rename would
    // silently wipe every real point. Bail out instead of risking that.
    if (error) {
      message.error(`Could not load this curve's points: ${error.message}`);
      return;
    }
    setEditing(curve);
    form.setFieldsValue({ kind: curve.kind, name: curve.name, company_id: curve.company_id });
    setPoints((data ?? []).map((p) => ({ key: p.id, x_value: Number(p.x_value), coefficient: Number(p.coefficient) })));
    setModalOpen(true);
  };

  const updatePoint = (key: string, patch: Partial<PointRow>) => setPoints((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    const values = await form.validateFields();
    const filled = points.filter((p) => p.x_value != null || p.coefficient != null);
    if (filled.some((p) => p.x_value == null || p.coefficient == null)) {
      message.error("Every point needs both an x value and a coefficient");
      return;
    }
    // Checked before anything is written, since the point rows are replaced
    // by delete-then-insert below - a duplicate discovered only at insert
    // time (unique (curve_id, x_value)) would already have deleted them.
    if (new Set(filled.map((p) => p.x_value)).size !== filled.length) {
      message.error("Two points have the same x value");
      return;
    }
    setSaving(true);
    try {
      let curveId = editing?.id;
      const payload = { kind: values.kind, name: values.name, company_id: values.company_id ?? null };
      if (editing) {
        const { error } = await supabaseClient.from("coefficient_curves").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from("coefficient_curves").insert(payload).select("id").single();
        if (error) throw error;
        curveId = data.id;
      }
      const { error: deleteError } = await supabaseClient.from("coefficient_points").delete().eq("curve_id", curveId);
      if (deleteError) throw deleteError;
      if (filled.length > 0) {
        const { error } = await supabaseClient
          .from("coefficient_points")
          .insert(filled.map((p) => ({ curve_id: curveId, x_value: p.x_value, coefficient: p.coefficient })));
        if (error) throw error;
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not save curve"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (curve: Curve) => {
    const { error } = await supabaseClient.from("coefficient_curves").delete().eq("id", curve.id);
    if (error) {
      // product_coefficients references curves with ON DELETE RESTRICT.
      message.error(error.code === "23503" ? "This curve is still used by one or more products - repoint them first." : error.message);
      return;
    }
    load();
  };

  return (
    <List
      title="Coefficient curves"
      headerButtons={
        <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>
          New curve
        </Button>
      }
    >
      <Table dataSource={curves} rowKey="id" loading={loading} pagination={false}>
        <Table.Column dataIndex="name" title={L("name")} />
        <Table.Column dataIndex="kind" title={L("kind")} width={160} render={(v) => KIND_OPTIONS.find((o) => o.value === v)?.label ?? v} />
        <Table.Column title={L("company_id")} width={220} render={(_, record: Curve) => record.companies?.name ?? ""} />
        <Table.Column title="Points" width={90} align="right" render={(_, record: Curve) => record.coefficient_points.length} />
        <Table.Column
          title="Actions"
          width={100}
          render={(_, record: Curve) => (
            <>
              <Button icon={<EditOutlined />} type="text" onClick={() => openEdit(record)} />
              <Popconfirm title="Delete this curve and its points?" onConfirm={() => remove(record)}>
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </>
          )}
        />
      </Table>

      <Modal
        open={modalOpen}
        title={editing ? "Edit curve" : "New curve"}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        confirmLoading={saving}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label={L("name")} name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={L("kind")} name="kind" rules={[{ required: true }]}>
            <Select options={KIND_OPTIONS} />
          </Form.Item>
          <Form.Item label={L("company_id")} name="company_id">
            <RemoteSelect loadOptions={searchCompanyOptions} loadLabels={loadCompanyOptionsByIds} />
          </Form.Item>
        </Form>
        <Table
          dataSource={points}
          rowKey="key"
          pagination={false}
          size="small"
          scroll={{ y: 320 }}
          footer={() => (
            <Button
              icon={<PlusOutlined />}
              size="small"
              onClick={() => setPoints((rows) => [...rows, { key: newRowKey("curve-point"), x_value: null, coefficient: null }])}
            >
              Add point
            </Button>
          )}
        >
          <Table.Column
            title={X_LABEL[kind] ?? "x value"}
            render={(_, record: PointRow) => (
              <InputNumber value={record.x_value} onChange={(v) => updatePoint(record.key, { x_value: v })} style={{ width: "100%" }} />
            )}
          />
          <Table.Column
            title="Coefficient"
            render={(_, record: PointRow) => (
              <InputNumber value={record.coefficient} onChange={(v) => updatePoint(record.key, { coefficient: v })} style={{ width: "100%" }} step={0.01} />
            )}
          />
          <Table.Column
            title=""
            width={40}
            render={(_, record: PointRow) => (
              <Button icon={<DeleteOutlined />} danger size="small" onClick={() => setPoints((rows) => rows.filter((r) => r.key !== record.key))} />
            )}
          />
        </Table>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
          A value between two points is linearly interpolated; a value outside the curve's range uses the nearest end point and shows a warning on the
          specification.
        </Typography.Text>
      </Modal>
    </List>
  );
};
