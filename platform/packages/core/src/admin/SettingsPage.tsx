// The settings of the platform and its modules: key/value rows (app_settings) described by the registry (app_setting_registry,
// filled by migrations through app_setting_register). One form row per registered setting; saved at once.
// A module may describe its settings through slots: 'admin.settings.editors' (key = setting key; label and value.hint are i18n
// keys; Component = editor with value/onChange, e.g. a task type picker for an id) and 'admin.settings.modules' (key = module,
// label = card title). Without them the row shows the registry description and a plain input.
import { useEffect, useState } from "react";
import { App as AntdApp, Card, Input, InputNumber, Switch, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { errorText } from "../errors";
import { useRecordSlot } from "../shell/ShellContext";

type Registered = { key: string; module: string; value_type: string; default_value: string | null; description: string | null };

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [registry, setRegistry] = useState<Registered[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const editors = new Map(useRecordSlot("admin.settings.editors").map((s) => [s.key, s]));
  const moduleTitles = new Map(useRecordSlot("admin.settings.modules").map((s) => [s.key, s.label]));

  useEffect(() => {
    void (async () => {
      const [{ data: reg }, { data: rows }] = await Promise.all([
        supabaseClient.from("app_setting_registry").select("key, module, value_type, default_value, description").order("module").order("key"),
        supabaseClient.from("app_settings").select("key, value"),
      ]);
      setRegistry((reg ?? []) as Registered[]);
      setValues(Object.fromEntries((rows ?? []).map((r) => [r.key as string, String(r.value ?? "")])));
    })();
  }, []);

  const save = async (key: string, value: string) => {
    const previous = values[key];
    setValues((v) => ({ ...v, [key]: value }));
    const { error } = await supabaseClient.from("app_settings").update({ value }).eq("key", key);
    if (error) {
      setValues((v) => ({ ...v, [key]: previous }));
      message.error(errorText(error));
    }
  };

  const modules = [...new Set(registry.map((r) => r.module))];
  return (
    <div style={{ maxWidth: 720 }}>
      {modules.map((module) => (
        <Card key={module} size="small" title={moduleTitles.get(module) ? t(moduleTitles.get(module)!) : t(`admin.settings.modules.${module}`, { defaultValue: module })} style={{ marginBottom: 16 }}>
          {registry.filter((r) => r.module === module).map((r) => {
            const value = values[r.key] ?? r.default_value ?? "";
            const custom = editors.get(r.key);
            const hint = (custom?.value as { hint?: string } | undefined)?.hint;
            return (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", flexWrap: "wrap" }}>
                {custom?.Component ? (
                  <custom.Component value={value} onChange={(v: string) => void save(r.key, v)} />
                ) : r.value_type === "boolean" ? (
                  <Switch checked={value === "true"} onChange={(on) => void save(r.key, String(on))} />
                ) : r.value_type === "integer" ? (
                  <InputNumber value={value === "" ? null : Number(value)} style={{ width: 100 }} onChange={(n) => n !== null && void save(r.key, String(n))} />
                ) : (
                  <Input defaultValue={value} style={{ width: 240 }} onBlur={(e) => e.target.value !== value && void save(r.key, e.target.value)} />
                )}
                <span style={{ flex: 1, minWidth: 200 }}>
                  {custom?.label ? t(custom.label) : t(`admin.settings.keys.${r.key}`, { defaultValue: r.description ?? r.key })}
                  <br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{hint ? t(hint) : r.key}</Typography.Text>
                </span>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
};
