import { useState } from "react";
import { Alert, Button, Form, Input, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useForgotPassword } from "@refinedev/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthShell } from "./AuthShell";
import { useShell } from "../shell/ShellContext";

// "Forgot password" by e-mail address or username: the link goes to the person's stored e-mail address, if there is one.
// The page says the same in every case, so it does not tell whether an account exists or has an address.
export const ForgotPassword = () => {
  const { t } = useTranslation();
  const { brand } = useShell();
  const { mutate, isPending } = useForgotPassword<{ username: string }>();
  const [sent, setSent] = useState(false);

  return (
    <AuthShell brand={brand}>
      <Typography.Title level={4} style={{ textAlign: "center", marginTop: 0 }}>{t("pages.forgotPassword.title")}</Typography.Title>
      {sent ? (
        <Alert type="info" showIcon message={t("pages.forgotPassword.sent")} description={t("pages.forgotPassword.sentHint")} style={{ marginBottom: 16 }} />
      ) : (
        <>
          <Typography.Paragraph type="secondary">{t("pages.forgotPassword.intro")}</Typography.Paragraph>
          <Form<{ username: string }>
            layout="vertical"
            requiredMark={false}
            onFinish={(values) => mutate(values, { onSuccess: () => setSent(true), onError: () => setSent(true) })}
          >
            <Form.Item name="username" label={t("pages.login.fields.emailOrUsername")} rules={[{ required: true, message: t("pages.login.errors.requiredEmailOrUsername") }]}>
              <Input prefix={<UserOutlined />} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={isPending}>{t("pages.forgotPassword.buttons.submit")}</Button>
          </Form>
        </>
      )}
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link to="/login">{t("pages.forgotPassword.buttons.haveAccount")}</Link>
      </div>
    </AuthShell>
  );
};
