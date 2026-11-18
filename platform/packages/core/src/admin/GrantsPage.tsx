// Admin > Grants. After COMPASS pages/admin/grants/list.tsx: one searchable list of permission literals per module. A checkbox
// grants the literal to the role; a literal the role only has because a stronger one implies it shows as included. The
// vocabulary comes from the registry (permissions, filled by the migrations of the modules), not from the frontend.
import { useMemo, useState } from "react";
import { App as AntdApp, Checkbox, Empty, Input, Segmented, Select, Space, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { errorText } from "../errors";
import { resetAccessCache } from "../refine/accessControlProvider";
import { useRoles } from "../directory";
import { roleLabel } from "./UsersPage";

type Literal = { key: string; module: string; action: string; scope: string | null; sort_order: number };

export const GrantsPage = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: roles } = useRoles();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [view, setView] = useState<"all" | "held">("all");
  const selected = roleId ?? roles?.find((r) => r.name !== "Admin")?.id ?? null;

  const { data: literals } = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => ((await supabaseClient.from("permissions").select("key, module, action, scope, sort_order").order("sort_order")).data ?? []) as Literal[],
  });
  const { data: closure } = useQuery({
    queryKey: ["permission-closure"],
    queryFn: async () => (await supabaseClient.from("permission_closure").select("permission, implied")).data ?? [],
  });
  const heldKey = ["role-permissions", selected];
  const { data: held } = useQuery({
    queryKey: heldKey, enabled: !!selected,
    queryFn: async () => new Set(((await supabaseClient.from("role_permissions").select("permission").eq("role_id", selected!)).data ?? []).map((r) => r.permission as string)),
  });

  // literal -> the stronger held literal that includes it
  const via = useMemo(() => {
    const out = new Map<string, string>();
    for (const row of closure ?? []) if (row.permission !== row.implied && held?.has(row.permission) && !held.has(row.implied)) out.set(row.implied, row.permission);
    return out;
  }, [closure, held]);

  const toggle = async (key: string, on: boolean) => {
    if (!selected) return;
    const { error } = on ? await supabaseClient.from("role_permissions").insert({ role_id: selected, permission: key }) : await supabaseClient.from("role_permissions").delete().eq("role_id", selected).eq("permission", key);
    if (error) return void message.error(errorText(error));
    resetAccessCache();
    await queryClient.invalidateQueries({ queryKey: heldKey });
    await queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
  };

  // The sentence of a literal ("See tasks assigned to me") comes from the modules' texts: permissions.literals.<literal>, the
  // literal's dots are the nesting; the heading of a module is entities.<module>. Resolved
  // once per language and vocabulary, not per row and keystroke. A literal without a sentence shows its key and action / scope.
  const texts = useMemo(() => {
    const sentences = new Map<string, string>();
    const headings = new Map<string, string>();
    for (const l of literals ?? []) {
      const path = `permissions.literals.${l.key}`;
      const text = t(path, { defaultValue: "" });
      if (typeof text === "string" && text && text !== path) sentences.set(l.key, text);
      if (!headings.has(l.module)) headings.set(l.module, t(`entities.${l.module}`, { defaultValue: t(`admin.permissionModules.${l.module}`, { defaultValue: l.module }) }));
    }
    return { sentences, headings };
  }, [literals, t]);
  const heading = (module: string) => texts.headings.get(module) ?? module;
  const needle = term.trim().toLowerCase();
  const shown = (literals ?? []).filter((l) => (view === "all" || held?.has(l.key) || via.has(l.key))
    && (!needle || l.key.includes(needle) || texts.sentences.get(l.key)?.toLowerCase().includes(needle) || heading(l.module).toLowerCase().includes(needle)));
  const modules = [...new Set(shown.map((l) => l.module))];
  return (
    <div style={{ maxWidth: 820 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select style={{ width: 240 }} value={selected ?? undefined} onChange={setRoleId} options={(roles ?? []).filter((r) => r.name !== "Admin").map((r) => ({ value: r.id, label: roleLabel(r) }))} />
        <Input allowClear prefix={<SearchOutlined />} placeholder={t("common.search")} value={term} onChange={(e) => setTerm(e.target.value)} style={{ width: 220 }} />
        <Segmented value={view} onChange={(v) => setView(v as "all" | "held")} options={[{ value: "all", label: t("admin.grantsAll") }, { value: "held", label: t("admin.grantsHeld") }]} />
      </Space>
      {modules.length === 0 && <Empty />}
      {modules.map((module) => (
        <div key={module} style={{ marginBottom: 16 }}>
          <Typography.Title level={5} style={{ marginBottom: 4 }}>{heading(module)}</Typography.Title>
          {shown.filter((l) => l.module === module).map((l) => {
            const text = texts.sentences.get(l.key);
            const by = via.get(l.key);
            return (
              <div key={l.key} style={{ padding: "2px 0" }}>
                <Checkbox checked={!!held?.has(l.key)} disabled={!!by} onChange={(e) => void toggle(l.key, e.target.checked)}>
                  {text ? (
                    <>{text}{" "}<Typography.Text type="secondary" code style={{ fontSize: 11 }}>{l.key}</Typography.Text></>
                  ) : (
                    <>
                      <code>{l.key}</code>{" "}
                      <span style={{ color: "var(--ant-color-text-secondary)" }}>{t(`admin.permissionActions.${l.action}`, { defaultValue: l.action })}{l.scope ? ` · ${t(`admin.permissionScopes.${l.scope}`, { defaultValue: l.scope })}` : ""}</span>
                    </>
                  )}
                  {by && <Tag style={{ marginInlineStart: 8 }}>{t("admin.includedVia", { by: texts.sentences.get(by) ?? by })}</Tag>}
                </Checkbox>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
