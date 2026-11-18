// Ported 1:1 from COMPASS (app/src/pages/profile/reminders.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Card, Select, Switch, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useHasModule } from "../../lib/modules";
import { errorText } from "@rbp/core";

// Platform: "Also by email" is in the core notification card; the trainings reminder comes with the people module, the items
// reminder with the items module (their columns of notification_preferences too).
type Prefs = { remind_planned_today: boolean; remind_due_soon: boolean; remind_overdue: boolean; remind_trainings: boolean; remind_items: boolean; due_soon_days: number };
const DEFAULTS: Prefs = { remind_planned_today: true, remind_due_soon: true, remind_overdue: true, remind_trainings: true, remind_items: true, due_soon_days: 2 };

// Which task reminders the person gets in the bell. Saved at once; no row yet = everything on.
export const ReminderSettings = ({ userId }: { userId: string }) => {
  const { t } = useTranslation();
  const { has } = usePermissions();
  const { message } = AntdApp.useApp();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const hasPeople = useHasModule("people");
  const hasItems = useHasModule("items");
  const columns = ["remind_planned_today", "remind_due_soon", "remind_overdue", ...(hasPeople ? ["remind_trainings"] : []), ...(hasItems ? ["remind_items"] : []), "due_soon_days"];

  useEffect(() => {
    void supabaseClient
      .from("notification_preferences")
      .select(columns.join(", "))
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => data && setPrefs({ ...DEFAULTS, ...(data as Partial<Prefs>) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- columns follow the modules, fixed while the app runs
  }, [userId]);

  const change = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    // Platform: only the columns of the modules in the app; update the own row, else create it (as the core notification card does).
    const row = { ...Object.fromEntries(columns.map((c) => [c, next[c as keyof Prefs]])), updated_at: new Date().toISOString() };
    const { data: updated, error: updateError } = await supabaseClient.from("notification_preferences").update(row).eq("user_id", userId).select("user_id");
    const error = updateError ?? ((updated ?? []).length ? null : (await supabaseClient.from("notification_preferences").insert({ user_id: userId, ...row })).error);
    if (error) message.error(errorText(error));
  };

  const row = (label: string, key: "remind_planned_today" | "remind_due_soon" | "remind_overdue" | "remind_trainings" | "remind_items", extra?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", flexWrap: "wrap" }}>
      <Switch checked={prefs[key]} onChange={(v) => void change({ [key]: v })} />
      <span>{label}</span>
      {extra}
    </div>
  );

  return (
    <Card title={t("profile.reminders")} size="small" style={{ marginBottom: 16 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>{t("profile.remindersHint")}</Typography.Paragraph>
      {row(t("profile.remindPlannedToday"), "remind_planned_today")}
      {row(
        t("profile.remindDueSoon"),
        "remind_due_soon",
        <Select
          size="small"
          style={{ width: 150 }}
          disabled={!prefs.remind_due_soon}
          value={prefs.due_soon_days}
          onChange={(v) => void change({ due_soon_days: v })}
          options={[0, 1, 2, 3, 5, 7].map((d) => ({ value: d, label: d === 0 ? t("profile.onDueDate") : t("profile.daysAhead", { count: d }) }))}
        />,
      )}
      {row(t("profile.remindOverdue"), "remind_overdue")}
      {hasPeople && row(t("profile.remindTrainings"), "remind_trainings")}
      {hasItems && has("items.view") && row(t("profile.remindItems"), "remind_items")}
    </Card>
  );
};
