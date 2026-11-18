// Admin > Configuration > Email, from COMPASS pages/admin/email/index.tsx (SMTP, daily digest, test mail, "send now").
// Changed: imports; banner title; mail language (email_settings.language); no COMPASS sender defaults; the transport
// (email_transports: SMTP or a module's, its fields in the slot "admin.email.transport"); the mail colour
// (email_settings.brand_color; the logo is the app's branding/mail-logo.png).
import { useEffect, useState } from "react";
import { App as AntdApp, Alert, Button, Card, ColorPicker, Form, Input, InputNumber, Select, Space, Spin, Switch, Typography } from "antd";
import { useGetIdentity } from "@refinedev/core";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDate, formatDateTime } from "@rbp/ui";
import { supabaseClient } from "../supabase";
import { currentLanguage } from "../i18n";
import { errorText } from "../errors";
import { RecordSlot } from "../shell/ShellContext";

type Settings = {
  enabled: boolean; transport: string; transport_config: { mailbox_id?: string } & Record<string, string | undefined>; host: string | null; port: number; security: "starttls" | "ssl" | "none"; username: string | null;
  from_address: string | null; from_name: string; language: "de" | "en"; brand_color: string | null; app_url: string | null; dispatch_url: string | null; digest_time: string; timezone: string; weekdays_only: boolean; last_digest_on: string | null;
  last_run_at: string | null; last_error: string | null; last_sent_count: number | null;
};
type FormValues = Omit<Settings, "last_run_at" | "last_error" | "last_sent_count"> & { password?: string };

const PORT_FOR = { starttls: 587, ssl: 465, none: 25 } as const;

// SMTP settings for the notification mails. The password is write-only: it is never read back, the field stays empty
// and an empty field keeps the stored one.
export const EmailSettingsPage = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: identity } = useGetIdentity<{ email?: string }>();
  const [form] = Form.useForm<FormValues>();
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "run" | null>(null);
  const [clearPassword, setClearPassword] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const [{ data: row, error }, { data: hasPassword }] = await Promise.all([
        supabaseClient.from("email_settings").select("enabled, transport, transport_config, host, port, security, username, from_address, from_name, language, brand_color, app_url, dispatch_url, digest_time, timezone, weekdays_only, last_digest_on, last_run_at, last_error, last_sent_count").single(),
        supabaseClient.rpc("email_password_is_set"),
      ]);
      if (error) throw error;
      const { data: transports } = await supabaseClient.from("email_transports").select("key, label").order("sort_order");
      return { row: row as Settings, hasPassword: hasPassword === true, transports: (transports ?? []) as { key: string; label: string }[] };
    },
  });

  useEffect(() => {
    if (data) form.setFieldsValue({ ...data.row, password: "" });
  }, [data, form]);
  useEffect(() => {
    if (identity?.email && !testTo) setTestTo(identity.email);
  }, [identity?.email, testTo]);

  const save = async (): Promise<boolean> => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return false;
    // Fields of the other transport are not mounted; their stored values are kept.
    const { error } = await supabaseClient.rpc("email_settings_save", {
      p: { ...(data?.row ?? {}), ...v, password: clearPassword ? "" : v.password ? v.password : null },
    });
    if (error) {
      message.error(errorText(error));
      return false;
    }
    setClearPassword(false);
    await queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    await queryClient.invalidateQueries({ queryKey: ["email-delivery-enabled"] });
    return true;
  };

  const onSave = async () => {
    setBusy("save");
    if (await save()) message.success(t("emailSettings.saved"));
    setBusy(null);
  };

  const onTest = async () => {
    setBusy("test");
    try {
      if (!(await save())) return;
      const { data: res, error } = await supabaseClient.functions.invoke("send-emails", { body: { action: "test", to: testTo, language: currentLanguage() } });
      if (error) throw error;
      if ((res as { ok?: boolean }).ok) message.success(t("emailSettings.testSent", { to: testTo }));
      else message.error(t("emailSettings.testFailed", { error: (res as { error?: string }).error ?? "?" }), 8);
    } catch (e) {
      message.error(t("emailSettings.testFailed", { error: (e as Error).message }), 8);
    } finally {
      setBusy(null);
    }
  };

  const onRun = async () => {
    setBusy("run");
    const { error } = await supabaseClient.rpc("email_dispatch_run_now");
    if (error) message.error(errorText(error));
    else {
      message.info(t("emailSettings.runStarted"));
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["email-settings"] }), 4000);
    }
    setBusy(null);
  };

  const transport = Form.useWatch("transport", form) ?? data?.row.transport ?? "smtp";
  if (isLoading || !data) return <Spin />;
  const row = data.row;

  return (
    <>
      <div style={{ maxWidth: 760 }}>
        <Typography.Paragraph type="secondary">{t("emailSettings.subtitle")}</Typography.Paragraph>
        <Form form={form} layout="vertical" initialValues={{ security: "starttls", port: 587, digest_time: "16:30", timezone: "Europe/Berlin", weekdays_only: true }}>
          <Card size="small" title={t("emailSettings.connection")} style={{ marginBottom: 16 }}>
            <Form.Item name="enabled" label={t("emailSettings.enabled")} valuePropName="checked" extra={t("emailSettings.enabledHint")}>
              <Switch />
            </Form.Item>
            {data.transports.length > 1 && (
              <Form.Item name="transport" label={t("emailSettings.transport")} style={{ width: 320 }} extra={t("emailSettings.transportHint")}>
                <Select options={data.transports.map((x) => ({ value: x.key, label: x.key === "smtp" ? "SMTP" : x.label }))} />
              </Form.Item>
            )}
            <RecordSlot slot="admin.email.transport" transport={transport} />
            {transport === "smtp" && (<>
            <Space align="start" wrap size={16}>
              <Form.Item name="host" label={t("emailSettings.host")} style={{ width: 280 }}>
                <Input placeholder="smtp.example.com" autoComplete="off" />
              </Form.Item>
              <Form.Item name="security" label={t("emailSettings.security")} style={{ width: 200 }}>
                <Select
                  onChange={(v: keyof typeof PORT_FOR) => form.setFieldValue("port", PORT_FOR[v])}
                  options={[
                    { value: "starttls", label: t("emailSettings.starttls") },
                    { value: "ssl", label: t("emailSettings.ssl") },
                    { value: "none", label: t("emailSettings.none") },
                  ]}
                />
              </Form.Item>
              <Form.Item name="port" label={t("emailSettings.port")} style={{ width: 110 }}>
                <InputNumber min={1} max={65535} style={{ width: "100%" }} />
              </Form.Item>
            </Space>
            <Space align="start" wrap size={16}>
              <Form.Item name="username" label={t("emailSettings.username")} style={{ width: 280 }} extra={t("emailSettings.usernameHint")}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item label={t("emailSettings.password")} style={{ width: 280 }} extra={data.hasPassword && !clearPassword ? t("emailSettings.passwordSet") : undefined}>
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item name="password" noStyle>
                    <Input.Password autoComplete="new-password" placeholder={data.hasPassword && !clearPassword ? "••••••••" : ""} />
                  </Form.Item>
                  {data.hasPassword && (
                    <Button danger={!clearPassword} onClick={() => setClearPassword((c) => !c)}>
                      {clearPassword ? t("common.cancel") : t("emailSettings.removePassword")}
                    </Button>
                  )}
                </Space.Compact>
              </Form.Item>
            </Space>
            {form.getFieldValue("security") === "none" && <Alert type="warning" showIcon message={t("emailSettings.noneWarning")} />}
            </>)}
          </Card>

          <Card size="small" title={t("emailSettings.sender")} style={{ marginBottom: 16 }}>
            <Space align="start" wrap size={16}>
              {transport === "smtp" && (
                <Form.Item name="from_address" label={t("emailSettings.fromAddress")} rules={[{ type: "email" }]} style={{ width: 280 }}>
                  <Input placeholder="noreply@example.com" />
                </Form.Item>
              )}
              <Form.Item name="from_name" label={t("emailSettings.fromName")} style={{ width: 280 }}>
                <Input />
              </Form.Item>
              <Form.Item name="language" label={t("emailSettings.language")} style={{ width: 160 }} extra={t("emailSettings.languageHint")}>
                <Select options={[{ value: "de", label: t("languages.de") }, { value: "en", label: t("languages.en") }]} />
              </Form.Item>
              <Form.Item name="brand_color" label={t("emailSettings.brandColor")} extra={t("emailSettings.brandColorHint")}
                getValueFromEvent={(c: { toHexString(): string } | null) => (c ? c.toHexString().slice(0, 7) : "")}>
                <ColorPicker allowClear disabledAlpha showText format="hex" />
              </Form.Item>
            </Space>
            <Form.Item name="app_url" label={t("emailSettings.appUrl")} extra={t("emailSettings.appUrlHint")}>
              <Input placeholder={window.location.origin} />
            </Form.Item>
          </Card>

          <Card size="small" title={t("emailSettings.digest")} style={{ marginBottom: 16 }}>
            <Typography.Paragraph type="secondary">{t("emailSettings.digestHint")}</Typography.Paragraph>
            <Space align="start" wrap size={16}>
              <Form.Item name="digest_time" label={t("emailSettings.digestTime")} style={{ width: 140 }} rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/, message: "HH:MM" }]}>
                <Input placeholder="16:30" maxLength={8} />
              </Form.Item>
              <Form.Item name="timezone" label={t("emailSettings.timezone")} style={{ width: 240 }}>
                <Input placeholder="Europe/Berlin" />
              </Form.Item>
              <Form.Item name="weekdays_only" label={t("emailSettings.weekdaysOnly")} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
          </Card>

          <Card size="small" title={t("emailSettings.advanced")} style={{ marginBottom: 16 }}>
            <Form.Item name="dispatch_url" label={t("emailSettings.dispatchUrl")} extra={t("emailSettings.dispatchUrlHint")}>
              <Input placeholder="https://<project>.supabase.co/functions/v1/send-emails" />
            </Form.Item>
          </Card>
        </Form>

        <Card size="small" title={t("emailSettings.status")} style={{ marginBottom: 16 }}>
          {row.last_run_at ? (
            <Typography.Paragraph>
              {t("emailSettings.lastRun", { when: formatDateTime(row.last_run_at), count: row.last_sent_count ?? 0 })}{row.last_digest_on ? " " + t("emailSettings.lastDigest", { date: formatDate(row.last_digest_on) }) : ""}
            </Typography.Paragraph>
          ) : (
            <Typography.Paragraph type="secondary">{t("emailSettings.neverRun")}</Typography.Paragraph>
          )}
          {row.last_error && <Alert type="error" showIcon message={row.last_error} style={{ marginBottom: 12 }} />}
          <Space wrap>
            <Input style={{ width: 280 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={t("emailSettings.testTo")} />
            <Button loading={busy === "test"} disabled={!testTo.includes("@")} onClick={() => void onTest()}>{t("emailSettings.sendTest")}</Button>
            <Button loading={busy === "run"} onClick={() => void onRun()} disabled={!row.enabled}>{t("emailSettings.runNow")}</Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>{t("emailSettings.testHint")}</Typography.Paragraph>
        </Card>

        <Button type="primary" loading={busy === "save"} onClick={() => void onSave()}>{t("common.save")}</Button>
      </div>
    </>
  );
};
