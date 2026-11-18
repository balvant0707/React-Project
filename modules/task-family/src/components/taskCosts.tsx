// Ported 1:1 from COMPASS (app/src/components/taskCosts.tsx).
import { useState } from "react";
import { App as AntdApp, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Typography, Upload } from "antd";
import { DeleteOutlined, EditOutlined, PaperClipOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useHasModule } from "../lib/modules";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { INVOICE_BUCKET, uploadInvoiceFile } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import { FileLink } from "@rbp/module-messaging/src/fileLink.tsx";
import { formatDate } from "@rbp/ui";
import { formatMoney } from "../lib/money";
import { SupplierSelect } from "./supplierSelect";
import { errorText } from "@rbp/core";

type CostRow = {
  id: string;
  description: string;
  supplier_id: string | null;
  supplier: { name: string } | null;
  amount: number;
  cost_date: string;
  invoice_path: string | null;
  invoice_file_name: string | null;
};

type FormValues = { description: string; supplier_id?: string | null; amount: number; cost_date: dayjs.Dayjs };

// External cost items of a task (net, EUR) with an optional invoice. Only rendered for holders of costs.view.
// `hideWhenEmpty`: the task type hides costs; they show only once a line exists.
export const TaskCosts = ({ taskId, canEdit, hideWhenEmpty = false }: { taskId: string; canEdit: boolean; hideWhenEmpty?: boolean }) => {
  const hasItems = useHasModule("items");
  const { t, i18n } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<CostRow | "new" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removeInvoice, setRemoveInvoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = ["task-costs", taskId];

  const { data: rows } = useQuery({
    queryKey: key,
    queryFn: async () =>
      ((await supabaseClient.from("task_costs").select(`id, description, supplier_id, ${hasItems ? "supplier:suppliers(name), " : ""}amount, cost_date, invoice_path, invoice_file_name`).eq("task_id", taskId).order("cost_date")).data ?? []) as unknown as CostRow[],
  });
  const total = (rows ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

  const open = (row: CostRow | "new") => {
    setEditing(row);
    setFile(null);
    setRemoveInvoice(false);
    form.setFieldsValue(row === "new" ? { description: "", supplier_id: null, amount: undefined, cost_date: dayjs() } : { description: row.description, supplier_id: row.supplier_id, amount: Number(row.amount), cost_date: dayjs(row.cost_date) });
  };

  const save = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values || !editing) return;
    setSaving(true);
    try {
      const existing = editing === "new" ? null : editing;
      const patch: Record<string, unknown> = { description: values.description.trim(), supplier_id: values.supplier_id ?? null, amount: values.amount, cost_date: values.cost_date.format("YYYY-MM-DD") };
      if (file) {
        patch.invoice_path = await uploadInvoiceFile(taskId, file);
        patch.invoice_file_name = file.name;
      } else if (removeInvoice) {
        patch.invoice_path = null;
        patch.invoice_file_name = null;
      }
      const { error } = existing
        ? await supabaseClient.from("task_costs").update(patch).eq("id", existing.id)
        : await supabaseClient.from("task_costs").insert({ ...patch, task_id: taskId });
      if (error) throw error;
      // The replaced or removed invoice file is no longer referenced.
      if (existing?.invoice_path && (file || removeInvoice)) await supabaseClient.storage.from(INVOICE_BUCKET).remove([existing.invoice_path]);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["maintenance-stats"] });
    } catch (e: any) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: CostRow) => {
    const { error } = await supabaseClient.from("task_costs").delete().eq("id", row.id);
    if (error) return message.error(errorText(error));
    if (row.invoice_path) await supabaseClient.storage.from(INVOICE_BUCKET).remove([row.invoice_path]);
    await queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["maintenance-stats"] });
  };

  if ((!canEdit || hideWhenEmpty) && (rows ?? []).length === 0) return null;
  const current = editing && editing !== "new" ? editing : null;

  return (
    <div style={{ marginTop: 16 }}>
      <Space style={{ marginBottom: 8 }} align="center">
        <Typography.Text strong>{t("costs.title")}</Typography.Text>
        {(rows ?? []).length > 0 && <Typography.Text type="secondary">{t("costs.total", { amount: formatMoney(total, i18n.language) })}</Typography.Text>}
        {canEdit && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => open("new")}>
            {t("costs.add")}
          </Button>
        )}
      </Space>
      {(rows ?? []).length > 0 && (
        <Table<CostRow>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={rows}
          scroll={{ x: "max-content" }}
          columns={[
            { title: t("fields.description"), dataIndex: "description" },
            ...(hasItems ? [{ title: t("costs.supplier"), render: (_: unknown, r: CostRow) => r.supplier?.name ?? "—" }] : []),
            { title: t("costs.date"), dataIndex: "cost_date", render: (v: string) => formatDate(v) },
            { title: t("costs.amountNet"), dataIndex: "amount", align: "right", render: (v: number) => formatMoney(v, i18n.language) },
            {
              title: t("costs.invoice"),
              render: (_: unknown, r: CostRow) => (r.invoice_path ? <FileLink path={r.invoice_path} name={r.invoice_file_name ?? ""} bucket={INVOICE_BUCKET} asButton={false} /> : "—"),
            },
            ...(canEdit
              ? [
                  {
                    title: "",
                    render: (_: unknown, r: CostRow) => (
                      <Space size={4}>
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => open(r)} />
                        <Popconfirm title={t("common.deleteConfirm")} onConfirm={() => remove(r)}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
      <Modal open={!!editing} title={editing === "new" ? t("costs.add") : t("costs.edit")} onCancel={() => setEditing(null)} onOk={save} confirmLoading={saving} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="description" label={t("fields.description")} rules={[{ required: true, max: 200 }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item hidden={!hasItems} name="supplier_id" label={t("costs.supplier")}>
            <SupplierSelect />
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item name="amount" label={t("costs.amountNet")} extra={t("costs.netHint")} rules={[{ required: true }]}>
              <InputNumber min={0} step={10} precision={2} addonAfter="EUR" style={{ width: 170 }} />
            </Form.Item>
            <Form.Item name="cost_date" label={t("costs.date")} rules={[{ required: true }]}>
              <DatePicker allowClear={false} />
            </Form.Item>
          </Space>
          <Form.Item label={t("costs.invoice")}>
            {current?.invoice_path && !removeInvoice && !file && (
              <Space style={{ marginBottom: 8 }}>
                <FileLink path={current.invoice_path} name={current.invoice_file_name ?? ""} bucket={INVOICE_BUCKET} asButton={false} />
                <Button size="small" type="link" danger onClick={() => setRemoveInvoice(true)}>
                  {t("costs.removeInvoice")}
                </Button>
              </Space>
            )}
            <Upload
              maxCount={1}
              beforeUpload={(f) => {
                setFile(f);
                return false;
              }}
              onRemove={() => setFile(null)}
              fileList={file ? [{ uid: "1", name: file.name, status: "done" }] : []}
            >
              <Button icon={<PaperClipOutlined />}>{current?.invoice_path ? t("costs.replaceInvoice") : t("costs.attachInvoice")}</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
