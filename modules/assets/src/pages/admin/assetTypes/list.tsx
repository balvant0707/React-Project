// Ported 1:1 from COMPASS (app/src/pages/admin/assetTypes/list.tsx).
import { useTable, useModalForm } from "@rbp/core";
import { useQueryClient } from "@tanstack/react-query";
import { List } from "@rbp/core";
import { useDelete } from "@rbp/core";
import { Table, Button, Modal, Form, Input, Popconfirm, Switch } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { IconSelect } from "@rbp/module-task-family/src/components/lookPickers.tsx";
import { DEFAULT_ASSET_TYPE_ICON, iconFor } from "@rbp/ui";

type AssetType = { id: string; name: string; name_de: string; description: string | null; is_grouping: boolean; icon: string | null };

// Asset types drive which checklist templates apply to an asset (phase 2) and label the tree.
// A grouping type (site, category) only structures the tree; the flat asset list hides it by default.
export const AssetTypeList = () => {
  const { t } = useTranslation();
  const { tableProps } = useTable<AssetType>({ resource: "asset_types", syncWithLocation: true, pagination: { pageSize: 100 }, sorters: { initial: [{ field: "name", order: "asc" }] } });
  const { mutate: remove } = useDelete();
  const queryClient = useQueryClient();
  // A type's icon is the fallback of its assets' effective_icon (assets_overview): reload the labels and the tree table.
  const onMutationSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ["assets-overview-all"] });
    void queryClient.invalidateQueries({ queryKey: ["assets-tree"] });
  };
  const create = useModalForm({ resource: "asset_types", action: "create", redirect: false, onMutationSuccess });
  const edit = useModalForm({ resource: "asset_types", action: "edit", redirect: false, onMutationSuccess });

  const fields = (
    <>
      <Form.Item label={t("fields.nameEn")} name="name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item label={t("fields.nameDe")} name="name_de" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item label={t("looks.icon")} name="icon" extra={t("looks.assetTypeIconHint")}>
        <IconSelect fallback={DEFAULT_ASSET_TYPE_ICON} />
      </Form.Item>
      <Form.Item label={t("fields.description")} name="description">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item label={t("configuration.asset_types.isGrouping")} name="is_grouping" valuePropName="checked" extra={t("configuration.asset_types.isGroupingHint")}>
        <Switch />
      </Form.Item>
    </>
  );

  return (
    <List
      headerButtons={
        <Button icon={<PlusOutlined />} type="primary" onClick={() => create.show()}>
          {t("common.new")}
        </Button>
      }
    >
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="icon" width={56} render={(v: string | null) => { const Glyph = iconFor(v, DEFAULT_ASSET_TYPE_ICON); return <Glyph size={20} stroke={2} aria-hidden />; }} />
        <Table.Column dataIndex="name" title={t("fields.nameEn")} />
        <Table.Column dataIndex="name_de" title={t("fields.nameDe")} />
        <Table.Column dataIndex="description" title={t("fields.description")} />
        <Table.Column dataIndex="is_grouping" title={t("configuration.asset_types.isGrouping")} align="center" render={(v: boolean) => (v ? <CheckOutlined /> : null)} />
        <Table.Column
          title={t("common.actions")}
          width={120}
          render={(_, record: AssetType) => (
            <>
              <Button icon={<EditOutlined />} type="text" onClick={() => edit.show(record.id)} />
              <Popconfirm title={t("common.deleteConfirm")} onConfirm={() => remove({ resource: "asset_types", id: record.id, meta: { select: "*" } })}>
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </>
          )}
        />
      </Table>
      <Modal {...create.modalProps} title={t("common.new")}>
        <Form {...create.formProps} layout="vertical">{fields}</Form>
      </Modal>
      <Modal {...edit.modalProps} title={t("common.edit")}>
        <Form {...edit.formProps} layout="vertical">{fields}</Form>
      </Modal>
    </List>
  );
};
