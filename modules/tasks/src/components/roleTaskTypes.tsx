// "Task types this role may start" on Admin > Roles, taken over from COMPASS pages/admin/roles/list.tsx (the Task types column
// and the copy of a role's types). Changes: a cell of the core roles page (slot admin.roles.columns) instead of a column of
// COMPASS's own page; errors through antd message; the copy is the slot admin.roles.copy.
import { App as AntdApp, Select } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { errorText, supabaseClient } from "@rbp/core";
import { localName, sortByName } from "../lib/masterData";

const useRoleTaskTypes = () =>
  useQuery({
    queryKey: ["admin-role-task-types"],
    queryFn: async () => {
      const map: Record<string, string[]> = {};
      for (const r of (await supabaseClient.from("role_task_types").select("role_id, task_type_id")).data ?? []) (map[r.role_id] ??= []).push(r.task_type_id);
      return map;
    },
  });

// Task types a role may use. A role without any entry may use all of them, which is what the empty select says.
export const RoleTaskTypesCell = ({ roleId, disabled }: { roleId: string; disabled?: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: allTypes } = useQuery({
    queryKey: ["admin-task-types-simple"],
    queryFn: async () => (await supabaseClient.from("task_types").select("id, name, name_de").order("name")).data ?? [],
  });
  const { data: roleTypes } = useRoleTaskTypes();
  const saveTypes = async (next: string[]) => {
    const previous = roleTypes?.[roleId] ?? [];
    const toAdd = next.filter((x) => !previous.includes(x));
    const toRemove = previous.filter((x) => !next.includes(x));
    if (toAdd.length) {
      const { error } = await supabaseClient.from("role_task_types").insert(toAdd.map((task_type_id) => ({ role_id: roleId, task_type_id })));
      if (error) message.error(errorText(error));
    }
    if (toRemove.length) {
      const { error } = await supabaseClient.from("role_task_types").delete().eq("role_id", roleId).in("task_type_id", toRemove);
      if (error) message.error(errorText(error));
    }
    await queryClient.invalidateQueries({ queryKey: ["admin-role-task-types"] });
    await queryClient.invalidateQueries({ queryKey: ["task-types"] });
  };
  return (
    <Select
      mode="multiple"
      allowClear
      style={{ minWidth: 260 }}
      placeholder={t("admin.allTaskTypes")}
      disabled={disabled}
      value={roleTypes?.[roleId] ?? []}
      onChange={(value) => void saveTypes(value)}
      options={sortByName(allTypes).map((x) => ({ label: localName(x), value: x.id }))}
      optionFilterProp="label"
    />
  );
};

// Copying a role copies the task types it may start.
export const copyRoleTaskTypes = async (fromRoleId: string, toRoleId: string): Promise<string | null> => {
  const { data, error } = await supabaseClient.from("role_task_types").select("task_type_id").eq("role_id", fromRoleId);
  if (error) return errorText(error);
  if (!data?.length) return null;
  const { error: insertError } = await supabaseClient.from("role_task_types").insert(data.map((r) => ({ role_id: toRoleId, task_type_id: r.task_type_id })));
  return insertError ? errorText(insertError) : null;
};
