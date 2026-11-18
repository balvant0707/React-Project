import { useEffect, useState } from "react";
import { AuthPage } from "@refinedev/antd";
import { Alert, Button, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { useShell } from "../shell/ShellContext";

// The recovery mail links here with ?token_hash=...; the token is redeemed only after a click, so mail scanners that
// open links in advance cannot use it up (the default /auth/v1/verify link breaks with "Auth session missing").
export const UpdatePassword = () => {
  const { t } = useTranslation();
  const { brand } = useShell();
  const tokenHash = new URLSearchParams(window.location.search).get("token_hash");
  const [ready, setReady] = useState(!tokenHash);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `null` while checking; a link that arrived without any session (consumed or expired) gets a clear message.
  const [hasSession, setHasSession] = useState<boolean | null>(tokenHash ? true : null);

  useEffect(() => {
    if (tokenHash) return;
    let alive = true;
    const check = () => supabaseClient.auth.getSession().then(({ data }) => alive && setHasSession(!!data.session));
    // Give the client a moment to process a #access_token hash from older links.
    const timer = window.setTimeout(check, 800);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [tokenHash]);

  const redeem = async () => {
    if (!tokenHash) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabaseClient.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  };

  if (!ready) {
    return (
      <div style={{ maxWidth: 400, margin: "15vh auto", padding: 24, textAlign: "center" }}>
        {brand}
        <p style={{ margin: "24px 0" }}>{t("pages.updatePassword.continueText")}</p>
        {error && <Alert type="error" message={t("pages.updatePassword.linkInvalid")} description={error} style={{ marginBottom: 16 }} />}
        <Button type="primary" block loading={busy} onClick={redeem}>{t("pages.updatePassword.continue")}</Button>
      </div>
    );
  }
  if (hasSession === null) return <Spin style={{ display: "block", margin: "30vh auto" }} />;
  if (hasSession === false) {
    return (
      <div style={{ maxWidth: 400, margin: "15vh auto", padding: 24 }}>
        {brand}
        <Alert type="error" message={t("pages.updatePassword.linkInvalid")} description={t("pages.updatePassword.linkInvalidHint")} style={{ marginTop: 24 }} />
        <Button block href="/forgot-password" style={{ marginTop: 16 }}>{t("pages.updatePassword.requestNew")}</Button>
      </div>
    );
  }
  return <AuthPage type="updatePassword" title={brand} />;
};
