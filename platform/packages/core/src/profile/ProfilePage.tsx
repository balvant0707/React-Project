// The profile page: COMPASS profile (details, language, privacy, password) with the NPM time zone card and photo upload.
// Modules add their own cards through the manifest hook profileSections (notification switches, reminders, push ...).
import { useEffect, useState } from "react";
import { App as AntdApp, Button, Card, Descriptions, Form, Input, Select, Spin, Switch, Typography, Upload } from "antd";
import { UploadOutlined, UserOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { deviceTimeZone, formatDateTime, setUserTimeZone, timeZoneOptions, zoneOffsetLabel } from "@rbp/ui";
import { supabaseClient } from "../supabase";
import { useIdentity } from "../hooks";
import { usePermissions } from "../directory";
import { useCaptcha } from "../login/captcha";
import { errorText } from "../errors";
import { currentLanguage, getAppLanguages, type Language } from "../i18n";
import { PhotoAvatar } from "../people/PersonAvatar";
import { useShell } from "../shell/ShellContext";
import { NotificationSettings } from "./NotificationSettings";
import { PushSettings } from "../push/PushSettings";

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  photo_url: string | null;
  position: string | null;
  site: string | null;
  sign_in_method: "password" | "sso";
  username: string;
  birthday_hidden: boolean;
  birthday_month: number | null;
  time_zone: string | null;
};

const zoneOptions = timeZoneOptions();

export const ProfilePage = () => {
  const { t, i18n } = useTranslation();
  const { message } = AntdApp.useApp();
  const { identity } = useIdentity();
  const { has } = usePermissions();
  const { profileSections } = useShell();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordForm] = Form.useForm();
  const captcha = useCaptcha();
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  useEffect(() => {
    if (!identity?.id) return;
    void (async () => {
      const { data } = await supabaseClient
        .from("users")
        .select("id, name, email, photo_url, position, site, sign_in_method, username, birthday_hidden, birthday_month, time_zone")
        .eq("id", identity.id)
        .single();
      setProfile((data as ProfileRow) ?? null);
      setLoading(false);
    })();
  }, [identity?.id]);

  const changeLanguage = async (language: Language) => {
    await i18n.changeLanguage(language);
    if (identity?.id) await supabaseClient.from("users").update({ language }).eq("id", identity.id);
  };

  // users.time_zone: every timestamp in the app is shown in it; empty = the device's zone.
  const saveTimeZone = async (zone: string | null) => {
    if (!profile) return;
    setSavingZone(true);
    const { error } = await supabaseClient.from("users").update({ time_zone: zone }).eq("id", profile.id);
    setSavingZone(false);
    if (error) return void message.error(errorText(error));
    setProfile({ ...profile, time_zone: zone });
    setUserTimeZone(zone);
  };

  // Hidden: day and month disappear from the directory and the birthday list; HR keeps the date.
  const changeBirthdayShown = async (shown: boolean) => {
    if (!profile) return;
    setProfile({ ...profile, birthday_hidden: !shown });
    const { error } = await supabaseClient.from("users").update({ birthday_hidden: !shown }).eq("id", profile.id);
    if (error) {
      message.error(errorText(error));
      setProfile({ ...profile });
    }
    void queryClient.invalidateQueries({ queryKey: ["directory"] });
  };

  // Fixed key per user (upsert): a re-upload replaces the old photo; the path is what users.photo_url holds.
  const uploadPhoto = async (file: File) => {
    if (!profile) return;
    const path = `${profile.id}/avatar`;
    const { error } = await supabaseClient.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) return void message.error(errorText(error));
    const { error: updateError } = await supabaseClient.from("users").update({ photo_url: path }).eq("id", profile.id);
    if (updateError) return void message.error(errorText(updateError));
    setProfile({ ...profile, photo_url: path });
    await queryClient.invalidateQueries({ queryKey: ["signed-url", "avatars"] });
    message.success(t("profile.photoUpdated"));
  };

  const changePassword = async () => {
    if (!identity?.id) return;
    try {
      const values = await passwordForm.validateFields().catch(() => null);
      if (!values) return;
      if (values.password === values.currentPassword) return void message.error(t("profile.passwordMustDiffer"));
      const sessionEmail = (await supabaseClient.auth.getSession()).data.session?.user.email ?? "";
      setSavingPassword(true);
      // Re-verify the current password first (with the address of this very session): a live session alone must not suffice to set a new one.
      const { error: verifyError } = await supabaseClient.auth.signInWithPassword({ email: sessionEmail, password: values.currentPassword, options: captcha.token ? { captchaToken: captcha.token } : undefined });
      captcha.reset();
      if (verifyError) return void message.error(t("profile.currentPasswordWrong"));
      const { error } = await supabaseClient.auth.updateUser({ password: values.password });
      if (error) throw error;
      message.success(t("profile.passwordUpdated"));
      passwordForm.resetFields();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading || !profile) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PhotoAvatar size={72} photo={profile.photo_url} icon={<UserOutlined />} />
          {has("users.photo.own") ? (
            <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={(file) => { void uploadPhoto(file); return false; }}>
              <Button icon={<UploadOutlined />}>{t("profile.photoUpload")}</Button>
            </Upload>
          ) : (
            <Typography.Text type="secondary">{t("profile.photoByHr")}</Typography.Text>
          )}
        </div>
      </Card>

      <Card title={t("profile.details")} size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t("fields.name")}>{profile.name ?? "—"}</Descriptions.Item>
          {profile.sign_in_method === "password" && <Descriptions.Item label={t("login.username")}>{profile.username}</Descriptions.Item>}
          <Descriptions.Item label={t("fields.email")}>{profile.email ?? "—"}</Descriptions.Item>
          <Descriptions.Item label={t("fields.position")}>{profile.position ?? "—"}</Descriptions.Item>
          <Descriptions.Item label={t("fields.site")}>{profile.site ?? "—"}</Descriptions.Item>
        </Descriptions>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("profile.adminManaged")}</Typography.Text>
      </Card>

      {getAppLanguages().length > 1 && (
        <Card title={t("profile.language")} size="small" style={{ marginBottom: 16 }}>
          <Select<Language> value={currentLanguage()} style={{ width: 200 }} onChange={changeLanguage} options={getAppLanguages().map((l) => ({ value: l, label: t(`languages.${l}`) }))} />
        </Card>
      )}

      <Card title={t("profile.timeZone")} size="small" style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: "100%", maxWidth: 400 }}
          loading={savingZone}
          disabled={savingZone}
          value={profile.time_zone ?? ""}
          onChange={(v: string) => void saveTimeZone(v || null)}
          options={[{ value: "", label: `${t("profile.timeZoneAuto")} (${zoneOffsetLabel(deviceTimeZone())}) ${deviceTimeZone().replace(/_/g, " ")}` }, ...zoneOptions]}
        />
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("profile.timeZoneHint")} {formatDateTime(new Date().toISOString())}</Typography.Text></div>
      </Card>

      {/* Only when HR keeps a birthday (COMPASS); an app without birthdays (RADAR) has nothing to hide. */}
      {profile.birthday_month != null && (
      <Card title={t("profile.privacy")} size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
          <Switch checked={!profile.birthday_hidden} onChange={(v) => void changeBirthdayShown(v)} />
          <span>{t("profile.showBirthday")}</span>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("profile.showBirthdayHint")}</Typography.Text>
      </Card>
      )}

      <PushSettings userId={profile.id} />
      <NotificationSettings userId={profile.id} />
      {[...profileSections].sort((a, b) => a.order - b.order).map((section) => <section.Component key={section.key} userId={profile.id} />)}

      {profile.sign_in_method === "sso" ? (
        <Card title={t("profile.password")} size="small">
          <Typography.Text type="secondary">{t("profile.ssoNoPassword")}</Typography.Text>
        </Card>
      ) : (
        <Card title={t("profile.changePassword")} size="small">
          <Form form={passwordForm} layout="vertical" onFinish={changePassword} style={{ maxWidth: 360 }}>
            <Form.Item name="currentPassword" label={t("profile.currentPassword")} rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
            <Form.Item name="password" label={t("profile.newPassword")} rules={[{ required: true, min: 10, max: 72, message: t("profile.passwordLength") }]} hasFeedback>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirm"
              label={t("profile.confirmPassword")}
              dependencies={["password"]}
              hasFeedback
              rules={[
                { required: true },
                ({ getFieldValue }) => ({ validator: (_, value) => (!value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error(t("profile.passwordsDiffer")))) }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            {captcha.widget}
            <Button type="primary" htmlType="submit" loading={savingPassword} disabled={captcha.enabled && !captcha.token}>{t("profile.updatePassword")}</Button>
          </Form>
        </Card>
      )}
    </div>
  );
};
