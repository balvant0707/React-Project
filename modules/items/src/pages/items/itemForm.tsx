// Ported 1:1 from COMPASS (app/src/pages/items/itemForm.tsx).
import { useEffect, useState } from "react";
import { Alert, Form, Input, InputNumber, Modal, Select, Switch } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { SupplierSelect } from "@rbp/module-task-family/src/components/supplierSelect.tsx";
import { usePhrases, usePhraseText } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { StockLocationSelect } from "../../components/stockLocationSelect";
import { useStockLocations } from "../../hooks/useStock";
import type { CatalogueItem } from "@rbp/module-task-family/src/lib/items.ts";
import { errorText } from "@rbp/core";

type Values = {
  item_number: string;
  name: string;
  category_phrase_id?: string | null;
  erp_item_number?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  manufacturer_item_number?: string | null;
  supplier_id?: string | null;
  unit_phrase_id?: string | null;
  lead_time_days?: number | null;
  is_critical: boolean;
  is_active: boolean;
  unit_price?: number | null;
  stock_managed?: boolean;
  minimum_stock?: number | null;
  reorder_quantity?: number | null;
  default_stock_location_id?: string | null;
};

const trimmed = (v?: string | null) => v?.trim() || null;

// Create or edit a catalogue item. The price is shown and saved only for holders of costs.view. `initial` pre-fills a
// new item (e.g. from a free-text line on a task).
export const ItemFormModal = ({
  open,
  part,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  part?: CatalogueItem | null;
  initial?: Partial<Pick<Values, "name" | "unit_phrase_id" | "supplier_id">>;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const { has } = usePermissions();
  const showPrice = has("costs.view");
  const showStock = has("stock.view");
  const stockManaged = Form.useWatch("stock_managed", form);
  const { nodes: stockLocations, isLoading: loadingLocations } = useStockLocations();
  const { data: units } = usePhrases("item_unit");
  const { data: categories } = usePhrases("item_category");
  const unitText = usePhraseText();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      part
        ? { ...part, unit_price: part.unit_price == null ? null : Number(part.unit_price), minimum_stock: part.minimum_stock == null ? null : Number(part.minimum_stock), reorder_quantity: part.reorder_quantity == null ? null : Number(part.reorder_quantity) }
        : { is_critical: false, is_active: true, unit_phrase_id: units?.find((u) => u.code === "piece")?.id ?? null, ...initial },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, part, form, units]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const payload = {
        item_number: v.item_number.trim(),
        name: v.name.trim(),
        category_phrase_id: v.category_phrase_id ?? null,
        erp_item_number: trimmed(v.erp_item_number),
        description: trimmed(v.description),
        manufacturer: trimmed(v.manufacturer),
        manufacturer_item_number: trimmed(v.manufacturer_item_number),
        supplier_id: v.supplier_id ?? null,
        unit_phrase_id: v.unit_phrase_id ?? null,
        lead_time_days: v.lead_time_days ?? null,
        is_critical: v.is_critical,
        is_active: v.is_active,
        ...(showStock
          ? {
              stock_managed: !!v.stock_managed,
              minimum_stock: v.stock_managed ? v.minimum_stock ?? null : null,
              reorder_quantity: v.stock_managed ? v.reorder_quantity ?? null : null,
              default_stock_location_id: v.stock_managed ? v.default_stock_location_id ?? null : null,
            }
          : {}),
      };
      const res = part
        ? await supabaseClient.from("items").update(payload).eq("id", part.id).select("id").single()
        : await supabaseClient.from("items").insert(payload).select("id").single();
      if (res.error) {
        const duplicate = res.error.code === "23505";
        form.setFields([{ name: "item_number", errors: [duplicate ? t("items.numberTaken") : res.error.message] }]);
        return;
      }
      const id = res.data.id as string;
      if (showPrice) {
        const price = v.unit_price;
        const { error } =
          price == null
            ? await supabaseClient.from("item_prices").delete().eq("item_id", id)
            : await supabaseClient.from("item_prices").upsert({ item_id: id, unit_price: price });
        if (error) {
          form.setFields([{ name: "unit_price", errors: [errorText(error)] }]);
          return;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["catalogue-item", id] });
      onSaved(id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} width={640} title={part ? t("items.edit") : t("items.new")} destroyOnClose>
      <Form form={form} layout="vertical">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="item_number" label={t("items.itemNumber")} rules={[{ required: true, whitespace: true, max: 60 }]} extra={t("items.itemNumberHint")} style={{ flex: "1 1 180px" }}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, whitespace: true, max: 200 }]} style={{ flex: "2 1 260px" }}>
            <Input />
          </Form.Item>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="category_phrase_id" label={t("items.category")} rules={[{ required: true }]} style={{ flex: "1 1 200px" }}>
            <Select options={(categories ?? []).map((c) => ({ value: c.id, label: unitText(c) }))} />
          </Form.Item>
          <Form.Item name="erp_item_number" label={t("items.erp.itemNumber")} tooltip={t("items.erp.itemNumberHint")} rules={[{ max: 60 }]} style={{ flex: "1 1 200px" }}>
            <Input />
          </Form.Item>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="manufacturer" label={t("items.manufacturer")} rules={[{ max: 120 }]} style={{ flex: "1 1 200px" }}>
            <Input />
          </Form.Item>
          <Form.Item name="manufacturer_item_number" label={t("items.manufacturerNumber")} rules={[{ max: 120 }]} style={{ flex: "1 1 200px" }}>
            <Input />
          </Form.Item>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="supplier_id" label={t("items.supplier")} extra={t("items.supplierHint")} style={{ flex: "2 1 240px" }}>
            <SupplierSelect />
          </Form.Item>
          <Form.Item name="unit_phrase_id" label={t("items.unit")} style={{ flex: "1 1 120px" }}>
            <Select allowClear options={(units ?? []).map((u) => ({ value: u.id, label: unitText(u) }))} />
          </Form.Item>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="lead_time_days" label={t("items.leadTime")} tooltip={t("items.leadTimeHint")} style={{ flex: "1 1 160px" }}>
            <InputNumber min={0} max={730} addonAfter={t("items.days")} style={{ width: "100%" }} />
          </Form.Item>
          {showPrice && (
            <Form.Item name="unit_price" label={t("items.unitPrice")} extra={t("costs.netHint")} style={{ flex: "1 1 160px" }}>
              <InputNumber min={0} step={1} precision={2} addonAfter="EUR" style={{ width: "100%" }} />
            </Form.Item>
          )}
        </div>
        <Form.Item name="description" label={t("fields.description")} rules={[{ max: 2000 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        {showStock && (
          <>
            <Form.Item name="stock_managed" label={t("stock.managed")} valuePropName="checked" tooltip={t("stock.managedHint")}>
              <Switch />
            </Form.Item>
            {stockManaged && !loadingLocations && stockLocations.length === 0 && (
              <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t("stock.noLocationsYet")} />
            )}
            {stockManaged && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Form.Item name="default_stock_location_id" label={t("stock.defaultLocation")} rules={[{ required: true }]} extra={t("stock.defaultLocationHint")} style={{ flex: "2 1 260px" }}>
                  <StockLocationSelect />
                </Form.Item>
                <Form.Item name="minimum_stock" label={t("stock.minimum")} tooltip={t("stock.minimumHint")} style={{ flex: "1 1 120px" }}>
                  <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="reorder_quantity" label={t("stock.reorderQuantity")} style={{ flex: "1 1 120px" }}>
                  <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
                </Form.Item>
              </div>
            )}
          </>
        )}
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <Form.Item name="is_critical" label={t("items.critical")} valuePropName="checked" tooltip={t("items.criticalHint")}>
            <Switch />
          </Form.Item>
          {part && (
            <Form.Item name="is_active" label={t("fields.active")} valuePropName="checked" tooltip={t("items.inactiveHint")}>
              <Switch />
            </Form.Item>
          )}
        </div>
      </Form>
    </Modal>
  );
};
