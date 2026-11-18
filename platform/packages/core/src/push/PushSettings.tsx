import { useEffect, useState } from "react";
import { App as AntdApp, Alert, Button, Card, List, Switch, Tag, TimePicker, Typography } from "antd";
import dayjs from "dayjs";
import { DeleteOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { currentSubscription, disablePush, enablePush, pushState, PushServiceTimeout, type PushState } from "./push";
import { formatDateTime } from "@rbp/ui";
import { errorText } from "../errors";

type Quiet = { from: string; to: string } | null;
const DEFAULT_QUIET = { from: "22:00", to: "06:00" };

type Device = { id: string; endpoint: string; user_agent: string | null; created_at: string; last_success_at: string | null };

// "Chrome on Windows", "Safari on iPhone" ... from the stored user agent, so a person recognises the device.
const deviceName = (ua: string | null) => {
  if (!ua) return "?";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const system = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return system ? `${browser} · ${system}` : browser;
};

// Push notifications: switched on per device (this browser or the installed app); the list shows every device that
// receives them, so an old phone can be removed from here.
export const PushSettings = ({ userId }: { userId: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"permission" | "subscribe" | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);

  const refreshState = async () => {
    setState(await pushState());
    setThisEndpoint((await currentSubscription())?.endpoint ?? null);
  };
  useEffect(() => {
    void refreshState();
  }, []);

  const { data: devices } = useQuery({
    queryKey: ["push-devices", userId],
    queryFn: async () =>
      ((await supabaseClient.from("push_subscriptions").select("id, endpoint, user_agent, created_at, last_success_at").order("created_at", { ascending: false })).data ?? []) as Device[],
  });

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const next = await enablePush(setStep);
        if (next === "denied") message.warning(t("profile.push.denied"));
      } else {
        await disablePush();
      }
    } catch (e) {
      message.error(e instanceof PushServiceTimeout ? t("profile.push.serviceTimeout") : errorText(e));
    } finally {
      setStep(null);
      await refreshState();
      await queryClient.invalidateQueries({ queryKey: ["push-devices", userId] });
      setBusy(false);
    }
  };

  // Quiet hours: no push in this window (it may span midnight); the notifications still land in the bell.
  const { data: quiet } = useQuery({
    queryKey: ["push-quiet", userId],
    queryFn: async (): Promise<Quiet> => {
      const { data } = await supabaseClient.from("notification_preferences").select("push_quiet_from, push_quiet_to").eq("user_id", userId).maybeSingle();
      return data?.push_quiet_from && data.push_quiet_to ? { from: data.push_quiet_from.slice(0, 5), to: data.push_quiet_to.slice(0, 5) } : null;
    },
  });
  const saveQuiet = async (next: Quiet) => {
    queryClient.setQueryData(["push-quiet", userId], next);
    const { error } = await supabaseClient
      .from("notification_preferences")
      .upsert({ user_id: userId, push_quiet_from: next?.from ?? null, push_quiet_to: next?.to ?? null, updated_at: new Date().toISOString() });
    if (error) {
      message.error(errorText(error));
      await queryClient.invalidateQueries({ queryKey: ["push-quiet", userId] });
    }
  };
  const timePicker = (key: "from" | "to") => (
    <TimePicker
      size="small"
      format="HH:mm"
      minuteStep={15}
      allowClear={false}
      needConfirm={false}
      inputReadOnly
      value={dayjs(`2000-01-01T${quiet?.[key] ?? DEFAULT_QUIET[key]}`)}
      disabled={!quiet}
      onChange={(v) => v && quiet && void saveQuiet({ ...quiet, [key]: v.format("HH:mm") })}
      aria-label={t(`profile.push.quiet${key === "from" ? "From" : "To"}`)}
    />
  );

  const remove = async (device: Device) => {
    if (device.endpoint === thisEndpoint) return toggle(false);
    const { error } = await supabaseClient.from("push_subscriptions").delete().eq("id", device.id);
    if (error) message.error(errorText(error));
    await queryClient.invalidateQueries({ queryKey: ["push-devices", userId] });
  };

  const notice =
    state === "unsupported" || state === "no_worker" || state === "dev_server" || state === "ios_install" || state === "not_configured" || state === "denied" ? (
      <Alert type={state === "denied" ? "warning" : "info"} showIcon message={t(`profile.push.state.${state}`)} style={{ marginBottom: 8 }} />
    ) : null;

  return (
    <Card title={t("profile.push.title")} size="small" style={{ marginBottom: 16 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>{t("profile.push.hint")}</Typography.Paragraph>
      {notice}
      {(state === "on" || state === "off") && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
          <Switch checked={state === "on"} loading={busy} onChange={(v) => void toggle(v)} />
          <span>{t("profile.push.thisDevice")}</span>
        </div>
      )}
      {busy && step && <Alert type="info" showIcon message={t(`profile.push.waiting.${step}`)} style={{ margin: "4px 0 8px" }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", flexWrap: "wrap" }}>
        <Switch checked={!!quiet} onChange={(v) => void saveQuiet(v ? DEFAULT_QUIET : null)} />
        <span>{t("profile.push.quietFrom")}</span>
        {timePicker("from")}
        <span>{t("profile.push.quietTo")}</span>
        {timePicker("to")}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("profile.push.quietHint")}</Typography.Text>
      {!!devices?.length && (
        <List
          size="small"
          header={<Typography.Text type="secondary">{t("profile.push.devices")}</Typography.Text>}
          dataSource={devices}
          renderItem={(d) => (
            <List.Item actions={[<Button key="remove" type="text" size="small" danger icon={<DeleteOutlined />} aria-label={t("common.delete")} onClick={() => void remove(d)} />]}>
              <List.Item.Meta
                title={
                  <span>
                    {deviceName(d.user_agent)} {d.endpoint === thisEndpoint && <Tag color="blue">{t("profile.push.current")}</Tag>}
                  </span>
                }
                description={d.last_success_at ? t("profile.push.lastSent", { date: formatDateTime(d.last_success_at) }) : t("profile.push.since", { date: formatDateTime(d.created_at) })}
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};
