// Platform: the controls of COMPASS's settings page (app/src/pages/admin/settings/index.tsx, cards "Default types") as editors of
// the core settings page (slot admin.settings.editors): the platform keeps settings as key/value rows, so each control edits one
// key; an empty value is "none" (the SQL reads nullif(value, '')).
import { Select } from "antd";
import { useTranslation } from "react-i18next";
import { useRoles } from "@rbp/core";
import { localName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { useTaskTypes } from "../pages/tasks/taskForm";

type EditorProps = { value: string; onChange: (value: string) => void };

/** A task type id (default_task_type_id; the assets module uses it for default_asset_task_type_id). */
export const TaskTypeSetting = ({ value, onChange }: EditorProps) => {
  const { data: types } = useTaskTypes(true);
  return (
    <Select allowClear style={{ width: 240 }} value={value || undefined} onChange={(v) => onChange(v ?? "")}
      options={sortByName(types).map((x) => ({ value: x.id, label: localName(x) }))} />
  );
};

/** The role a route step falls back to when its rule finds nobody (default_fallback_role_id). */
export const FallbackRoleSetting = ({ value, onChange }: EditorProps) => {
  const { t } = useTranslation();
  const { data: roles } = useRoles();
  return (
    <Select allowClear style={{ width: 240 }} placeholder={t("appSettings.defaultFallbackRoleNone")} value={value || undefined} onChange={(v) => onChange(v ?? "")}
      options={sortByName(roles ?? []).map((r) => ({ value: r.id, label: localName(r) }))} />
  );
};
