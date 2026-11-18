import { useMemo, useState } from "react";
import { Alert, Button, Form, Input, Typography } from "antd";
import { KeyOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { useLogin } from "@refinedev/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { AuthShell } from "./AuthShell";
import { useCaptcha } from "./captcha";
import { useShell } from "../shell/ShellContext";

// Copied from COMPASS app/src/pages/activate/index.tsx (imports and AuthShell brand adapted).
type Values = { username: string; code: string; password: string; confirm: string };

// Opened from the QR code on an activation sheet (/activate#u=<username>&c=<code>, ~/maintenance_tool/docs/username-login.md): the person
// chooses a password, is signed in, and sets up the authenticator app next (MfaGate). The code can also be typed.
export const Activate = () => {
  const { t } = useTranslation();
  const { brand } = useShell();
  const [form] = Form.useForm<Values>();
  const { mutate: login } = useLogin<{ username: string; password: string; captchaToken?: string | null }>();
  const captcha = useCaptcha();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return { username: params.get("u") ?? "", code: params.get("c") ?? "" };
  }, []);

  const submit = async (values: Values) => {
    setBusy(true);
    setError(null);
    const { data: activated, error: fnError } = await supabaseClient.functions.invoke("login-help", {
      body: { action: "activate", username: values.username, code: values.code, password: values.password },
    });
    if (fnError) {
      const detail = await (fnError as { context?: Response }).context?.json?.().catch(() => null);
      setBusy(false);
      setError(detail?.error === "password_length" ? t("profile.passwordLength") : detail?.error === "password_rejected" ? detail.message ?? t("common.error") : t("activate.codeInvalid"));
      return;
    }
    // The code is used up; keep it out of the history.
    window.history.replaceState(null, "", window.location.pathname);
    // The function names the address to sign in with: the contact address, or the username's own without one.
    login({ username: (activated as { login?: string } | null)?.login ?? values.username, password: values.password, captchaToken: captcha.token }, { onSettled: () => { setBusy(false); captcha.reset(); } });
  };

  return (
    <AuthShell brand={brand}>
      <Typography.Title level={4} style={{ textAlign: "center", marginTop: 0 }}>{t("activate.title")}</Typography.Title>
      <Typography.Paragraph type="secondary">{t("activate.intro")}</Typography.Paragraph>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
      <Form<Values> form={form} layout="vertical" requiredMark={false} initialValues={{ ...initial, password: "", confirm: "" }} onFinish={submit}>
        <Form.Item name="username" label={t("pages.login.fields.username")} rules={[{ required: true, message: t("pages.login.errors.requiredUsername") }]}>
          <Input prefix={<UserOutlined />} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} size="large" />
        </Form.Item>
        <Form.Item name="code" label={t("activate.code")} rules={[{ required: true, message: t("activate.codeRequired") }]}>
          <Input prefix={<KeyOutlined />} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} size="large" placeholder="XXXX-XXXX-XXXX" />
        </Form.Item>
        <Form.Item name="password" label={t("profile.newPassword")} rules={[{ required: true, min: 10, max: 72, message: t("profile.passwordLength") }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" size="large" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label={t("pages.updatePassword.fields.confirmPassword")}
          dependencies={["password"]}
          rules={[
            { required: true, message: t("pages.updatePassword.errors.requiredConfirmPassword") },
            ({ getFieldValue }) => ({
              validator: (_, v) => (!v || v === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error(t("pages.updatePassword.errors.confirmPasswordNotMatch")))),
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" size="large" />
        </Form.Item>
        {captcha.widget}
        {captcha.failed && <Alert type="error" showIcon message={t("pages.login.captchaFailed")} style={{ marginBottom: 12 }} />}
        <Button type="primary" htmlType="submit" block size="large" loading={busy} disabled={captcha.enabled && !captcha.token}>{t("activate.submit")}</Button>
      </Form>
      <Typography.Paragraph type="secondary" style={{ marginTop: 16, fontSize: 12 }}>{t("activate.homeScreenHint")}</Typography.Paragraph>
      <div style={{ textAlign: "center" }}>
        <Link to="/login">{t("pages.forgotPassword.buttons.haveAccount")}</Link>
      </div>
    </AuthShell>
  );
};
