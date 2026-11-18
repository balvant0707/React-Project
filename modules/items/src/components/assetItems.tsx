// Ported 1:1 from COMPASS (app/src/components/assetItems.tsx).
import { useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Card, Empty, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Space, Spin, Switch, Table, Tooltip, Typography } from "antd";
import { AppstoreOutlined, BarsOutlined, CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { AssetSelect } from "@rbp/module-task-family/src/components/assetSelect.tsx";
import { ItemSelect } from "@rbp/module-task-family/src/components/itemSelect.tsx";
import { ItemThumb } from "@rbp/module-task-family/src/components/itemPhoto.tsx";
import { useIsMobile } from "@rbp/ui";
import { usePermissions } from "@rbp/core";
import { useQuantityText } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { fetchAssetItems, type AssetItem } from "@rbp/module-task-family/src/lib/items.ts";
import { errorText } from "@rbp/core";

type Values = { item_id: string; quantity_installed: number; position_note?: string };

// List or cards: remembered per browser; without a choice cards on phones (people pick parts by their photo), the
// list on a PC.
type ViewMode = "list" | "cards";
const VIEW_KEY = "compass.asset-items-view";
const readView = (): ViewMode | null => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "list" || v === "cards" ? v : null;
  } catch {
    return null;
  }
};
const writeView = (v: ViewMode) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* storage may be blocked */
  }
};

// The parts list of an asset (tab "Spare parts" on the asset page), optionally with everything below it.
export const AssetItemsTab = ({ assetId }: { assetId: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const quantity = useQuantityText();
  const canEdit = has("items.edit");
  const isMobile = useIsMobile();
  const [chosenView, setChosenView] = useState<ViewMode | null>(readView);
  const view: ViewMode = chosenView ?? (isMobile ? "cards" : "list");
  const [subtree, setSubtree] = useState(false);
  const [editing, setEditing] = useState<AssetItem | "new" | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string | undefined>();
  const [form] = Form.useForm<Values>();
  const { data: rows, isLoading } = useQuery({ queryKey: ["asset-items", assetId, subtree], queryFn: () => fetchAssetItems(assetId, subtree) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["asset-items"] });

  const open = (row: AssetItem | "new") => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(row === "new" ? { quantity_installed: 1 } : { item_id: row.item_id, quantity_installed: row.quantity_installed, position_note: row.position_note ?? undefined });
  };

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !editing) return;
    const patch = { quantity_installed: v.quantity_installed, position_note: v.position_note?.trim() || null };
    const { error } =
      editing === "new"
        ? await supabaseClient.from("asset_items").insert({ ...patch, asset_id: assetId, item_id: v.item_id })
        : await supabaseClient.from("asset_items").update(patch).eq("asset_id", editing.asset_id).eq("item_id", editing.item_id);
    if (error) {
      form.setFields([{ name: "item_id", errors: [error.code === "23505" ? t("items.alreadyListed") : error.message] }]);
      return;
    }
    setEditing(null);
    await refresh();
  };

  const remove = async (row: AssetItem) => {
    const { error } = await supabaseClient.from("asset_items").delete().eq("asset_id", row.asset_id).eq("item_id", row.item_id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  // Copies the list of another asset (e.g. a machine of the same type); parts already listed here are kept as they are.
  const copy = async () => {
    if (!copyFrom) return;
    const source = await fetchAssetItems(copyFrom, false);
    if (source.length) {
      const { error } = await supabaseClient
        .from("asset_items")
        .upsert(source.map((s) => ({ asset_id: assetId, item_id: s.item_id, quantity_installed: s.quantity_installed, position_note: s.position_note })), { onConflict: "asset_id,item_id", ignoreDuplicates: true });
      if (error) return message.error(errorText(error));
    }
    message.success(t("items.copied", { count: source.length }));
    setCopying(false);
    setCopyFrom(undefined);
    await refresh();
  };

  const actions = (r: AssetItem) =>
    canEdit && r.asset_id === assetId ? (
      <Space size={4}>
        <Button size="small" type="text" icon={<EditOutlined />} aria-label={t("common.edit")} onClick={() => open(r)} />
        <Popconfirm title={t("items.removeFromAsset")} onConfirm={() => remove(r)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t("common.delete")} />
        </Popconfirm>
      </Space>
    ) : null;

  const cards = isLoading ? (
    <Spin />
  ) : !rows?.length ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("items.noAssetItems")} />
  ) : (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 150 : 200}px, 1fr))`, gap: 12 }}>
      {rows.map((r) => (
        <Card
          key={`${r.asset_id}:${r.item_id}`}
          size="small"
          styles={{ body: { padding: 10 } }}
          cover={
            <Link to={`/items/${r.item_id}`} aria-label={r.item_name} style={{ display: "block", aspectRatio: "4 / 3" }}>
              <ItemThumb path={r.photo_thumbnail_path} size="100%" radius={0} />
            </Link>
          }
        >
          <Space size={4} align="start" style={{ width: "100%", justifyContent: "space-between" }}>
            <Link to={`/items/${r.item_id}`}>
              <Typography.Text strong type={r.is_active ? undefined : "secondary"} delete={!r.is_active}>{r.item_name}</Typography.Text>
            </Link>
            {r.is_critical && <Tooltip title={t("items.criticalHint")}><WarningOutlined style={{ color: "#cf1322" }} /></Tooltip>}
          </Space>
          <div><Typography.Text type="secondary">{r.item_number}</Typography.Text></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginTop: 4 }}>
            <Typography.Text>{quantity(r.quantity_installed, r.unit_phrase_id)}</Typography.Text>
            {actions(r)}
          </div>
          {r.position_note && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.position_note}</Typography.Text>}
          {subtree && r.asset_id !== assetId && (
            <div><Link to={`/assets/${r.asset_id}?tab=parts`} style={{ fontSize: 12 }}>{r.asset_name}</Link></div>
          )}
        </Card>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Space wrap size={12}>
          <Segmented<ViewMode>
            value={view}
            onChange={(v) => {
              setChosenView(v);
              writeView(v);
            }}
            options={[
              { value: "list", icon: <BarsOutlined />, label: t("items.viewList") },
              { value: "cards", icon: <AppstoreOutlined />, label: t("items.viewCards") },
            ]}
          />
          <span><Switch checked={subtree} onChange={setSubtree} /> {t("items.includeSubtree")}</span>
        </Space>
        {canEdit && (
          <Space wrap>
            <Button icon={<CopyOutlined />} onClick={() => setCopying(true)}>{t("items.copyFrom")}</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open("new")}>{t("items.addToAsset")}</Button>
          </Space>
        )}
      </div>
      {view === "cards" ? cards : (
      <Table<AssetItem>
        size="small"
        rowKey={(r) => `${r.asset_id}:${r.item_id}`}
        loading={isLoading}
        dataSource={rows}
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("items.noAssetItems")} /> }}
        columns={[
          { title: "", width: 48, render: (_: unknown, r) => <ItemThumb path={r.photo_thumbnail_path} previewPath={r.photo_path} size={36} preview /> },
          { title: t("items.itemNumber"), render: (_: unknown, r) => <Link to={`/items/${r.item_id}`}>{r.item_number}</Link> },
          {
            title: t("fields.name"),
            render: (_: unknown, r) => (
              <Space size={4}>
                <Typography.Text type={r.is_active ? undefined : "secondary"} delete={!r.is_active}>{r.item_name}</Typography.Text>
                {r.is_critical && <Tooltip title={t("items.criticalHint")}><WarningOutlined style={{ color: "#cf1322" }} /></Tooltip>}
              </Space>
            ),
          },
          { title: t("items.manufacturer"), render: (_: unknown, r) => [r.manufacturer, r.manufacturer_item_number].filter(Boolean).join(" · ") || "—", responsive: ["md"] },
          { title: t("items.quantity"), render: (_: unknown, r) => quantity(r.quantity_installed, r.unit_phrase_id) },
          { title: t("items.position"), dataIndex: "position_note", render: (v: string | null) => v ?? "—" },
          { title: t("items.supplier"), dataIndex: "supplier_name", render: (v: string | null) => v ?? "—", responsive: ["lg"] },
          ...(subtree ? [{ title: t("fields.asset"), render: (_: unknown, r: AssetItem) => (r.asset_id === assetId ? r.asset_name : <Link to={`/assets/${r.asset_id}?tab=parts`}>{r.asset_name}</Link>) }] : []),
          ...(canEdit
            ? [{
                title: "",
                render: (_: unknown, r: AssetItem) => actions(r),
              }]
            : []),
        ]}
      />
      )}
      <Modal open={!!editing} title={editing === "new" ? t("items.addToAsset") : t("items.editAssetItem")} onCancel={() => setEditing(null)} onOk={save} destroyOnClose>
        <Form form={form} layout="vertical">
          {editing === "new" ? (
            <Form.Item name="item_id" label={t("items.item")} rules={[{ required: true }]} extra={t("items.notInCatalogue")}>
              <ItemSelect autoFocus />
            </Form.Item>
          ) : (
            <Form.Item label={t("items.item")}>
              <Input disabled value={editing ? `${editing.item_number} · ${editing.item_name}` : ""} />
            </Form.Item>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Form.Item name="quantity_installed" label={t("items.quantityInstalled")} rules={[{ required: true }]} style={{ flex: "0 0 160px" }}>
              <InputNumber min={0.01} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="position_note" label={t("items.position")} rules={[{ max: 200 }]} extra={t("items.positionHint")} style={{ flex: "1 1 220px" }}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
      <Modal open={copying} title={t("items.copyFrom")} onCancel={() => setCopying(false)} onOk={() => void copy()} okButtonProps={{ disabled: !copyFrom }} destroyOnClose>
        <Typography.Paragraph type="secondary">{t("items.copyHint")}</Typography.Paragraph>
        <AssetSelect value={copyFrom} onChange={(v) => setCopyFrom(v ?? undefined)} style={{ width: "100%" }} />
      </Modal>
    </div>
  );
};
