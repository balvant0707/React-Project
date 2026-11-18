// Ported 1:1 from COMPASS (app/src/components/stockDialogs.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Form, Input, InputNumber, Modal, Radio, Typography } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { StockItemSelect } from "./stockItemSelect";
import { StockLocationSelect } from "./stockLocationSelect";
import { useMe } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useStockLocations } from "../hooks/useStock";
import { STOCK_ERRORS, mayBook } from "../lib/stock";
import { errorText } from "@rbp/core";

// The three manual bookings on the stock: first stock / goods in / correction, count, move. They call the RPCs
// stock_adjust, stock_count and stock_transfer, which check the right again (stock.edit.all, or stock.edit.team at the
// locations of the user's teams).

const useBookable = () => {
  const { has } = usePermissions();
  const { teamIds } = useMe();
  return (location: { team_id: string | null }) => mayBook(has, teamIds, location);
};

const useAfterBooking = () => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(["stock-balances", "item-stock", "stock-movements", "stock-list", "location-contents"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
};


type Common = { open: boolean; onClose: () => void; onDone?: () => void };

export const StockBookModal = ({ open, itemId, locationId, kind: initialKind, onClose, onDone }: Common & { itemId?: string; locationId?: string; kind?: "opening" | "receipt" | "correction" }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<{ kind: "opening" | "receipt" | "correction"; item_id?: string; location_id?: string; quantity: number; note?: string }>();
  const [saving, setSaving] = useState(false);
  const bookable = useBookable();
  const after = useAfterBooking();
  useEffect(() => {
    if (open) form.setFieldsValue({ kind: initialKind ?? "receipt", item_id: itemId, location_id: locationId, quantity: undefined, note: undefined });
  }, [open, itemId, locationId, initialKind, form]);
  const kind = Form.useWatch("kind", form);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    const { error } = await supabaseClient.rpc("stock_adjust", { p_item_id: v.item_id, p_location_id: v.location_id, p_quantity: v.quantity, p_kind: v.kind, p_note: v.note?.trim() || null });
    setSaving(false);
    if (error) return message.error(errorText(error, { known: STOCK_ERRORS }));
    message.success(t("stock.booked"));
    await after();
    onDone?.();
    onClose();
  };

  return (
    <Modal open={open} title={t("stock.bookTitle")} okText={t("stock.book")} confirmLoading={saving} onOk={() => void submit()} onCancel={onClose} destroyOnClose>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="kind" label={t("stock.kindLabel")}>
          <Radio.Group optionType="button" options={(["opening", "receipt", "correction"] as const).map((k) => ({ value: k, label: t(`stock.kinds.${k}`) }))} />
        </Form.Item>
        <Typography.Paragraph type="secondary">{t(`stock.kindHint.${kind ?? "receipt"}`)}</Typography.Paragraph>
        <Form.Item name="item_id" label={t("items.title")} rules={[{ required: true }]}>
          <StockItemSelect style={{ width: "100%" }} autoFocus={!itemId} />
        </Form.Item>
        <Form.Item name="location_id" label={t("stock.location")} rules={[{ required: true }]}>
          <StockLocationSelect filter={bookable} />
        </Form.Item>
        <Form.Item name="quantity" label={t("items.quantity")} rules={[{ required: true }]} extra={kind === "correction" ? t("stock.correctionHint") : undefined}>
          <InputNumber min={kind === "correction" ? undefined : 0.01} step={1} precision={2} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="note" label={t("stock.note")}>
          <Input maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export const StockCountModal = ({ open, itemId, itemLabel, locationId, current, onClose, onDone }: Common & { itemId: string; itemLabel: string; locationId: string; current: number }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { byId } = useStockLocations();
  const [form] = Form.useForm<{ counted: number; note?: string }>();
  const [saving, setSaving] = useState(false);
  const after = useAfterBooking();
  useEffect(() => {
    if (open) form.setFieldsValue({ counted: current, note: undefined });
  }, [open, current, form]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    const { data, error } = await supabaseClient.rpc("stock_count", { p_item_id: itemId, p_location_id: locationId, p_counted: v.counted, p_note: v.note?.trim() || null });
    setSaving(false);
    if (error) return message.error(errorText(error, { known: STOCK_ERRORS }));
    const diff = Number(data ?? 0);
    message.success(diff === 0 ? t("stock.countNoDifference") : t("stock.countDifference", { count: diff > 0 ? `+${diff}` : String(diff) }));
    await after();
    onDone?.();
    onClose();
  };

  return (
    <Modal open={open} title={t("stock.countTitle")} okText={t("stock.countSave")} confirmLoading={saving} onOk={() => void submit()} onCancel={onClose} destroyOnClose>
      <Typography.Paragraph>
        {itemLabel} · {byId.get(locationId)?.path}
        <br />
        <Typography.Text type="secondary">{t("stock.bookedQuantity", { count: current })}</Typography.Text>
      </Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="counted" label={t("stock.counted")} rules={[{ required: true }]}>
          <InputNumber min={0} step={1} precision={2} autoFocus style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="note" label={t("stock.note")}>
          <Input maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export const StockTransferModal = ({ open, itemId, itemLabel, fromId, available, onClose, onDone }: Common & { itemId: string; itemLabel: string; fromId: string; available: number }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { byId } = useStockLocations();
  const [form] = Form.useForm<{ to?: string; quantity: number; note?: string }>();
  const [saving, setSaving] = useState(false);
  const after = useAfterBooking();
  useEffect(() => {
    if (open) form.setFieldsValue({ to: undefined, quantity: Math.min(1, available) || undefined, note: undefined });
  }, [open, available, form]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    const { error } = await supabaseClient.rpc("stock_transfer", { p_item_id: itemId, p_from: fromId, p_to: v.to, p_quantity: v.quantity, p_note: v.note?.trim() || null });
    setSaving(false);
    if (error) return message.error(errorText(error, { known: STOCK_ERRORS }));
    message.success(t("stock.booked"));
    await after();
    onDone?.();
    onClose();
  };

  return (
    <Modal open={open} title={t("stock.transferTitle")} okText={t("stock.transfer")} confirmLoading={saving} onOk={() => void submit()} onCancel={onClose} destroyOnClose>
      <Typography.Paragraph>
        {itemLabel}
        <br />
        <Typography.Text type="secondary">{t("stock.transferFrom", { location: byId.get(fromId)?.path ?? "", count: available })}</Typography.Text>
      </Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="to" label={t("stock.transferTo")} rules={[{ required: true }]}>
          <StockLocationSelect exclude={fromId} autoFocus />
        </Form.Item>
        <Form.Item name="quantity" label={t("items.quantity")} rules={[{ required: true }]}>
          <InputNumber min={0.01} max={available} step={1} precision={2} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="note" label={t("stock.note")}>
          <Input maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
