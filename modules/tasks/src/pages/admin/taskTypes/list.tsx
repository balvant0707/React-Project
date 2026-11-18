// Ported from COMPASS app/src/pages/admin/taskTypes/list.tsx (cut parts listed there).
import { App as AntdApp, Button, Popconfirm, Table, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { List, errorText, supabaseClient, useIdentity, usePermissions, useUserMap, userLabel } from "@rbp/core";
import { localName, taskTypeShortDescription } from "../../../lib/masterData";
import type { TypeRow as EditRow } from "./edit";

// The purpose column comes with COMPASS's workflows module (a type a workflow uses: tagged, cannot be deleted); without that
// module it is missing and the page shows neither.
type TypeRow = EditRow & { purpose?: string | null };

// Task types (routes). A row opens the full editor page (edit.tsx).
export const TaskTypeList = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { has, admin } = usePermissions();
  const meId = useIdentity().identity?.id;
  const users = useUserMap();

  const { data: allTypes, isLoading } = useQuery({
    queryKey: ["admin-task-types"],
    queryFn: async () =>
      (await supabaseClient.from("task_types").select("*").order("name")).data as TypeRow[],
  });
  // Admins and holders of "edit all" see every type, owners only the ones they own.
  const types = (allTypes ?? []).filter((r) => admin || has("task_types.edit.all") || (!!meId && r.owner_user_id === meId));
  const { data: stepCounts } = useQuery({
    queryKey: ["admin-task-type-step-counts"],
    queryFn: async () => {
      return ((await supabaseClient.from("task_type_steps").select("task_type_id")).data ?? []) as { task_type_id: string }[];
    },
    // The query cache is persisted as JSON, so the Map is built here and not in queryFn.
    select: (rows) => {
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.task_type_id, (map.get(r.task_type_id) ?? 0) + 1);
      return map;
    },
  });

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("task_types").delete().eq("id", id);
    if (error) message.error(error.message.includes("violates foreign key") ? t("taskTypes.errors.inUse") : error.message.includes("cannot be deleted") ? t("taskTypes.errors.purposeDelete") : errorText(error));
    await queryClient.invalidateQueries({ queryKey: ["admin-task-types"] });
  };

  const open = (r: TypeRow) => navigate(`/admin/task-types/${r.id}`);

  return (
    <List
      hint={t("taskTypes.hint")}
      headerButtons={
        admin ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/admin/task-types/new")}>
            {t("common.new")}
          </Button>
        ) : null
      }
    >
      <Table<TypeRow> dataSource={types} rowKey="id" loading={isLoading} pagination={false} onRow={(r) => ({ onClick: () => open(r), style: { cursor: "pointer" } })}>
        <Table.Column
          dataIndex="name"
          title={t("fields.name")}
          render={(_: string, r: TypeRow) => (
            <>
              <Typography.Text strong>{localName(r)}</Typography.Text>
              {r.purpose ? <Tooltip title={t("taskTypes.errors.purposeDelete")}><Tag style={{ marginLeft: 8 }}>{t(`taskTypes.purposes.${r.purpose}`, { defaultValue: r.purpose })}</Tag></Tooltip> : null}
              {r.short_description ? <div><Typography.Text type="secondary">{taskTypeShortDescription(t, r)}</Typography.Text></div> : null}
            </>
          )}
        />
        <Table.Column dataIndex="key" title={t("fields.key")} render={(v) => <Typography.Text code>{v}</Typography.Text>} />
        <Table.Column title={t("fields.owner")} render={(_, r: TypeRow) => (r.owner_user_id && users.get(r.owner_user_id) ? userLabel(users.get(r.owner_user_id)) : "—")} />
        <Table.Column title={t("taskTypes.steps")} render={(_, r: TypeRow) => stepCounts?.get(r.id) ?? 0} />
        <Table.Column dataIndex="show_on_start_page" title={t("taskTypes.onStartPage")} render={(v) => (v ? <Tag color="blue">{t("common.yes")}</Tag> : <Tag>{t("common.no")}</Tag>)} />
        <Table.Column dataIndex="active" title={t("fields.active")} render={(v) => (v ? <Tag color="green">{t("common.yes")}</Tag> : <Tag>{t("common.no")}</Tag>)} />
        <Table.Column
          title={t("common.actions")}
          width={120}
          render={(_, r: TypeRow) => (
            <span onClick={(e) => e.stopPropagation()}>
              <Button icon={<EditOutlined />} type="text" onClick={() => open(r)} />
              {admin && !r.purpose && (
                <Popconfirm title={t("common.deleteConfirm")} onConfirm={() => remove(r.id)}>
                  <Button icon={<DeleteOutlined />} type="text" danger />
                </Popconfirm>
              )}
            </span>
          )}
        />
      </Table>
    </List>
  );
};
