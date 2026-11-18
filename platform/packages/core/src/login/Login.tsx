// Copied from COMPASS pages/login/index.tsx. Changes: the brand comes from the app (prop), imports.
import { Alert, Button, Divider, Form, Input, Typography } from "antd";
import { LockOutlined, UserOutlined, WindowsOutlined } from "@ant-design/icons";
import { useLogin } from "@refinedev/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { AuthShell } from "./AuthShell";
import { useCaptcha } from "./captcha";

// GoTrue sends a refused SSO login back as #error_description=... (or ?error_description=...), e.g. when no account
// exists for the Microsoft identity.
const readSsoError = (): string | null => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, "") || window.location.search);
  return params.get("error_description");
};

type Values = { username: string; password: string; captchaToken?: string | null };

// Sign-in with the contact e-mail address, or the username for an account without one (~/maintenance_tool/docs/username-login.md). Accounts are provisioned by HR or an admin,
// no self-registration. Microsoft Entra SSO is the OAuth provider `azure` (supabase/config.toml, ~/maintenance_tool/docs/sso-entra.md).
export const Login = ({ brand }: { brand: ReactNode }) => {
  const { t } = useTranslation();
  // A failed sign-in appears as Refine's notification (texts from the authProvider).
  const { mutate: login, isPending } = useLogin<Values | { providerName: string }>();
  const captcha = useCaptcha();
  const ssoError = readSsoError();
  // Sent here when the account was locked during a session (authProvider.onError).
  const lockedOut = new URLSearchParams(window.location.search).get("locked") === "1";

  return (
    <AuthShell brand={brand}>
      {ssoError && <Alert type="error" showIcon message={t("pages.login.ssoFailed")} description={ssoError} style={{ marginBottom: 12 }} />}
      {lockedOut && <Alert type="error" showIcon message={t("pages.login.locked")} description={t("pages.login.lockedHint")} style={{ marginBottom: 12 }} />}
      <Typography.Title level={4} style={{ textAlign: "center", marginTop: 0 }}>{t("pages.login.title")}</Typography.Title>
      <Form<Values> layout="vertical" requiredMark={false} onFinish={(values) => login({ ...values, captchaToken: captcha.token }, { onSettled: captcha.reset })}>
        <Form.Item
          name="username"
          label={t("pages.login.fields.emailOrUsername")}
          extra={t("pages.login.fields.emailOrUsernameHint")}
          rules={[{ required: true, message: t("pages.login.errors.requiredEmailOrUsername") }]}
        >
          <Input prefix={<UserOutlined />} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} size="large" />
        </Form.Item>
        <Form.Item name="password" label={t("pages.login.fields.password")} rules={[{ required: true, message: t("pages.login.errors.requiredPassword") }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" />
        </Form.Item>
        <div style={{ textAlign: "right", marginTop: -8, marginBottom: 16 }}>
          <Link to="/forgot-password">{t("pages.login.buttons.forgotPassword")}</Link>
        </div>
        {captcha.widget}
        {captcha.failed && <Alert type="error" showIcon message={t("pages.login.captchaFailed")} style={{ marginBottom: 12 }} />}
        <Button type="primary" htmlType="submit" block size="large" loading={isPending} disabled={captcha.enabled && !captcha.token}>{t("pages.login.signin")}</Button>
      </Form>
      <Divider plain>{t("pages.login.divider")}</Divider>
      <Button block size="large" icon={<WindowsOutlined />} onClick={() => login({ providerName: "azure" })}>{t("pages.login.ssoButton")}</Button>
    </AuthShell>
  );
};
