// Ported 1:1 from COMPASS (app/src/pages/assets/assetForm.tsx).
import { useEffect, useState } from "react";
import { Col, Form, Input, InputNumber, Modal, Row, Select, Space, TreeSelect, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { ASSET_STATUSES, type AssetOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { teamsFor, useTeams, useUsers, usersFor } from "@rbp/core";
import { userLabel } from "@rbp/module-task-family/src/lib/domain.ts";
import { fetchAllPages } from "@rbp/ui";
import { localName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { useAssetAttributes } from "../../hooks/useAssetAttributes";
import { attributeKey, type AttributeValue } from "../../lib/assetAttributes";
import { AssetAttributeInput } from "../../components/assetAttributeInput";
import { errorText } from "@rbp/core";
import { IconSelect } from "@rbp/module-task-family/src/components/lookPickers.tsx";
import { DEFAULT_ASSET_TYPE_ICON } from "@rbp/ui";

type FormValues = {
  name: string;
  parent_asset_id?: string | null;
  asset_type_id?: string | null;
  icon?: string | null;
  status: string;
  manufacturer?: string;
  serial_number?: string;
  location?: string;
  responsible_user_id?: string | null;
  team_id?: string | null;
  operating_hours?: number | null;
  // attribute id -> value (asset_save_attribute_values)
  attributes?: Record<string, AttributeValue>;
};

type TreeNode = { value: string; title: string; children?: TreeNode[] };

// Every asset the user can see, as a tree for the parent picker. Excludes the node being edited
// (and implicitly its subtree) so it cannot be moved below itself.
function useAssetTree(excludeId?: string) {
  return useQuery({
    queryKey: ["asset-tree", excludeId ?? null],
    queryFn: async () => {
      const rows = await fetchAllPages<{ id: string; name: string; parent_asset_id: string | null; path: string }>((from, to) =>
        supabaseClient.from("assets").select("id, name, parent_asset_id, path").order("path").range(from, to),
      );
      const excludePrefix = excludeId ? rows.find((r) => r.id === excludeId)?.path : undefined;
      const visible = rows.filter((r) => !excludePrefix || !(r.path === excludePrefix || r.path.startsWith(`${excludePrefix}.`)));
      const byId = new Map<string, TreeNode>(visible.map((r) => [r.id, { value: r.id, title: r.name }]));
      const roots: TreeNode[] = [];
      for (const r of visible) {
        const node = byId.get(r.id)!;
        const parent = r.parent_asset_id ? byId.get(r.parent_asset_id) : undefined;
        if (parent) (parent.children ??= []).push(node);
        else roots.push(node);
      }
      return roots;
    },
  });
}

export const AssetFormModal = ({
  open,
  asset,
  defaultParentId,
  onClose,
  onSaved,
}: {
  open: boolean;
  asset?: AssetOverviewRow | null;
  defaultParentId?: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<FormValues>();
  const { data: tree } = useAssetTree(asset?.id);
  const { data: users } = useUsers();
  const { data: groups } = useTeams();
  const { data: types } = useQuery({
    queryKey: ["asset-types"],
    queryFn: async () => (await supabaseClient.from("asset_types").select("id, name, name_de").order("name")).data ?? [],
  });
  const { data: definitions } = useAssetAttributes();
  const typeId = Form.useWatch("asset_type_id", form);
  const responsibleId = Form.useWatch("responsible_user_id", form);
  const teamId = Form.useWatch("team_id", form);
  // Saving an existing asset only writes the team once its current value arrived (a late answer must not clear it).
  const [teamLoaded, setTeamLoaded] = useState(false);
  // The attributes the chosen type offers, plus any that already hold a value (e.g. after a type
  // change), so a value can still be seen and cleared.
  const shown = (definitions ?? []).filter(
    (a) => (typeId && a.asset_type_ids.includes(typeId)) || asset?.attribute_values?.[attributeKey(a.id)] != null,
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (asset) {
      form.setFieldsValue({
        name: asset.name,
        parent_asset_id: asset.parent_asset_id,
        asset_type_id: asset.asset_type_id,
        status: asset.status,
        manufacturer: asset.manufacturer ?? undefined,
        serial_number: asset.serial_number ?? undefined,
        location: asset.location ?? undefined,
        responsible_user_id: asset.responsible_user_id,
        operating_hours: asset.operating_hours,
        icon: asset.icon ?? null,
      });
    } else {
      form.setFieldsValue({ status: "active", parent_asset_id: defaultParentId ?? null });
    }
  }, [open, asset, defaultParentId, form]);

  // The overview view has no team column; the row itself does (the team a node names, not the inherited ones).
  useEffect(() => {
    setTeamLoaded(false);
    if (!open || !asset) return;
    let live = true;
    supabaseClient.from("assets").select("team_id").eq("id", asset.id).maybeSingle().then(({ data }) => {
      if (!live) return;
      form.setFieldsValue({ team_id: (data?.team_id as string | null) ?? null });
      setTeamLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [open, asset, form]);

  // Separate from the reset above: the definitions may arrive after the modal opened.
  useEffect(() => {
    if (!open || !asset || !definitions) return;
    form.setFieldsValue({
      attributes: Object.fromEntries(definitions.map((a) => [a.id, (asset.attribute_values?.[attributeKey(a.id)] ?? null) as AttributeValue])),
    });
  }, [open, asset, definitions, form]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const payload = {
      name: v.name.trim(),
      parent_asset_id: v.parent_asset_id ?? null,
      asset_type_id: v.asset_type_id ?? null,
      status: v.status,
      manufacturer: v.manufacturer?.trim() || null,
      serial_number: v.serial_number?.trim() || null,
      location: v.location?.trim() || null,
      responsible_user_id: v.responsible_user_id ?? null,
      ...(!asset || teamLoaded ? { team_id: v.team_id ?? null } : {}),
      operating_hours: v.operating_hours ?? null,
      icon: v.icon ?? null,
    };
    const result = asset
      ? await supabaseClient.from("assets").update(payload).eq("id", asset.id).select("id").single()
      : await supabaseClient.from("assets").insert(payload).select("id").single();
    if (result.error) {
      form.setFields([{ name: "name", errors: [errorText(result.error)] }]);
      return;
    }
    // Only the attributes on screen; others keep their values.
    const values = Object.fromEntries(shown.map((a) => [a.id, v.attributes?.[a.id] ?? null]));
    if (shown.length) {
      const { error } = await supabaseClient.rpc("asset_save_attribute_values", { p_asset_id: result.data.id, p_values: values });
      if (error) {
        form.setFields([{ name: ["attributes", shown[0].id], errors: [errorText(error)] }]);
        return;
      }
    }
    onSaved(result.data.id);
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} width={640} title={asset ? t("assets.edit") : t("assets.new")} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("fields.name")} rules={[{ required: true }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="parent_asset_id" label={t("assets.parent")}>
          <TreeSelect allowClear showSearch treeNodeFilterProp="title" treeData={tree ?? []} placeholder={t("assets.noParent")} treeDefaultExpandAll />
        </Form.Item>
        <Space style={{ display: "flex" }} align="start" wrap>
          <Form.Item name="asset_type_id" label={t("fields.assetType")} style={{ minWidth: 200 }}>
            <Select allowClear options={sortByName(types).map((x) => ({ value: x.id, label: localName(x) }))} />
          </Form.Item>
          <Form.Item name="icon" label={t("looks.icon")} tooltip={t("looks.assetIconHint")} style={{ minWidth: 220 }}>
            <IconSelect fallback={DEFAULT_ASSET_TYPE_ICON} placeholderLabel={t("looks.inheritedIcon")} />
          </Form.Item>
          <Form.Item name="status" label={t("fields.status")} style={{ minWidth: 160 }}>
            <Select options={ASSET_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
          </Form.Item>
          <Form.Item name="responsible_user_id" label={t("fields.responsible")} style={{ minWidth: 200 }}>
            <Select allowClear showSearch optionFilterProp="label" options={usersFor(users, responsibleId).map((u) => ({ value: u.id, label: userLabel(u) }))} />
          </Form.Item>
          <Form.Item name="team_id" label={t("assets.team")} tooltip={t("assets.teamHint")} style={{ minWidth: 200 }}>
            <Select allowClear showSearch optionFilterProp="label" placeholder={t("assets.teamNone")} options={teamsFor(groups, "assets", teamId).map((g) => ({ value: g.id, label: g.name }))} />
          </Form.Item>
        </Space>
        <Space style={{ display: "flex" }} align="start" wrap>
          <Form.Item name="manufacturer" label={t("fields.manufacturer")}>
            <Input />
          </Form.Item>
          <Form.Item name="serial_number" label={t("fields.serialNumber")}>
            <Input />
          </Form.Item>
          <Form.Item name="location" label={t("fields.location")}>
            <Input />
          </Form.Item>
          <Form.Item name="operating_hours" label={t("fields.operatingHours")}>
            <InputNumber min={0} step={0.1} addonAfter="h" style={{ width: 160 }} />
          </Form.Item>
        </Space>
        {shown.length > 0 && (
          <>
            <Typography.Text type="secondary">{t("assets.technicalData")}</Typography.Text>
            <Row gutter={12} style={{ marginTop: 8 }}>
              {shown.map((a) => (
                <Col key={a.id} xs={24} sm={12}>
                  <Form.Item name={["attributes", a.id]} label={a.name} tooltip={a.description || undefined}>
                    <AssetAttributeInput attribute={a} />
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Form>
    </Modal>
  );
};
