// From COMPASS pages/profile/messageSettings.tsx. The switchable types are not hard-coded any more: they come from the
// registry (notification_types.switchable). Saved at once; no row yet = everything on. Below them, while the app mails its
// daily digest (email_delivery_enabled), COMPASS's "Also by email" switch (pages/profile/reminders.tsx, email_enabled).
import { useEffect, useState } from "react";
import { App as AntdApp, Card, Switch, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { errorText } from "../errors";

export const NotificationSettings = ({ userId }: { userId: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [muted, setMuted] = useState<string[]>([]);
  const [types, setTypes] = useState<{ type: string; description: string | null }[]>([]);
  const [emailOn, setEmailOn] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);

  useEffect(() => {
    void supabaseClient.from("notification_types").select("type, description").eq("switchable", true).order("type").then(({ data }) => setTypes(data ?? []));
    void supabaseClient
      .from("notification_preferences")
      .select("muted_types, email_enabled")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setMuted((data.muted_types as string[] | null) ?? []);
        setEmailEnabled(data.email_enabled !== false);
      });
    void supabaseClient.rpc("email_delivery_enabled").then(({ data }) => setEmailOn(data === true));
  }, [userId]);

  // An upsert would also try to update user_id, which the column grant forbids: update the own row, else create it.
  const write = async (patch: { muted_types?: string[]; email_enabled?: boolean }) => {
    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseClient.from("notification_preferences").update({ ...patch, updated_at: now }).eq("user_id", userId).select("user_id");
    if (error || (updated ?? []).length > 0) return error;
    return (await supabaseClient.from("notification_preferences").insert({ user_id: userId, ...patch, updated_at: now })).error;
  };

  const changeEmail = async (on: boolean) => {
    setEmailEnabled(on);
    const failure = await write({ email_enabled: on });
    if (failure) {
      setEmailEnabled(!on);
      message.error(errorText(failure));
    }
  };

  const change = async (type: string, on: boolean) => {
    const previous = muted;
    const next = on ? muted.filter((x) => x !== type) : [...muted, type];
    setMuted(next);
    const failure = await write({ muted_types: next });
    if (failure) {
      setMuted(previous);
      message.error(errorText(failure));
    }
  };

  if (types.length === 0 && !emailOn) return null;
  return (
    <Card title={t("profile.messageSwitches")} size="small" style={{ marginBottom: 16 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>{t("profile.messageSwitchesHint")}</Typography.Paragraph>
      {types.map(({ type, description }) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
          <Switch checked={!muted.includes(type)} onChange={(v) => void change(type, v)} />
          <span>{t(`profile.messageSwitch.${type}`, { defaultValue: description ?? type })}</span>
        </div>
      ))}
      {emailOn && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: types.length ? "1px solid rgba(128,128,128,0.2)" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Switch checked={emailEnabled} onChange={(v) => void changeEmail(v)} />
            <span>{t("profile.emailToo")}</span>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("profile.emailTooHint")}</Typography.Text>
        </div>
      )}
    </Card>
  );
};
