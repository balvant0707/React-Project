// Ported 1:1 from COMPASS (app/src/components/hookListEditor.tsx).
import { Button, Form, Select, Space, Typography } from "antd";
import type { FormInstance } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import type { StepHook } from "../lib/domain";

type HookRegistryRow = { key: string; events: StepHook["event"][] };

function useHookRegistry() {
  return useQuery({
    queryKey: ["workflow-hooks"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("workflow_hooks").select("key, events").order("sort_order");
      if (error) throw error;
      return (data ?? []) as HookRegistryRow[];
    },
  });
}

// The special functions of a step or of a whole task type (~/maintenance_tool/docs/workflow-hooks.md): pick the function and when it runs.
// `name` is the form path of the list, `watch` the current values (to offer the events of the chosen function).
export const HookListEditor = ({ form, name, current, title, hint }: { form: FormInstance; name: (string | number)[]; current: StepHook[] | undefined; title: string; hint: string }) => {
  const { t } = useTranslation();
  const { data: registry } = useHookRegistry();
  return (
    <div style={{ marginTop: 12 }}>
      <Typography.Text type="secondary">{title}</Typography.Text>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>{hint}</Typography.Paragraph>
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => {
              const chosen = registry?.find((h) => h.key === current?.[field.name]?.hook);
              return (
                <Space key={field.key} align="baseline" wrap style={{ display: "flex" }}>
                  <Form.Item name={[field.name, "hook"]} rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                    <Select
                      style={{ minWidth: 260 }}
                      placeholder={t("taskTypes.hook")}
                      options={(registry ?? []).map((h) => ({ value: h.key, label: t(`workflowHooks.${h.key}.name`, { defaultValue: h.key }) }))}
                      onChange={(value) => {
                        const only = registry?.find((h) => h.key === value)?.events;
                        form.setFieldValue([...name, field.name, "event"], only?.length === 1 ? only[0] : undefined);
                      }}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, "event"]} rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                    <Select style={{ minWidth: 220 }} placeholder={t("taskTypes.hookEvent")} options={(chosen?.events ?? []).map((e) => ({ value: e, label: t(`taskTypes.hookEvents.${e}`) }))} />
                  </Form.Item>
                  {chosen && <Typography.Text type="secondary">{t(`workflowHooks.${chosen.key}.description`, { defaultValue: "" })}</Typography.Text>}
                  <MinusCircleOutlined onClick={() => remove(field.name)} />
                </Space>
              );
            })}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => add({})}>
              {t("taskTypes.addHook")}
            </Button>
          </>
        )}
      </Form.List>
    </div>
  );
};

// What every type needed implicitly before the hooks existed: its ticket is resolved or given back, an order books its arrival.
export const DEFAULT_TYPE_HOOKS: StepHook[] = [
  { hook: "ticket_resolve", event: "done" },
  { hook: "ticket_release", event: "cancelled" },
];
export const ORDER_HOOKS: StepHook[] = [
  { hook: "items_order_finished", event: "done" },
  { hook: "items_order_finished", event: "cancelled" },
];
