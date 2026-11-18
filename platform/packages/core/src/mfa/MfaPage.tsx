import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Typography, Input, Button, Alert, Space, Spin, Divider, type GetRef } from "antd";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { getMfaRequirement } from "./mfa";
import { useShell } from "../shell/ShellContext";

const { Title, Text, Paragraph } = Typography;

type Stage = "loading" | "enroll" | "challenge" | "error";

const PageShell = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", padding: 24 }}>
    <Card style={{ width: 420 }}>{children}</Card>
  </div>
);

// Required on Supabase Cloud only (IS_SUPABASE_CLOUD): first-time TOTP enrollment (QR code + secret) and the per-
// session step-up challenge. Reached via MfaGate's redirect.
// `onDone`: used by the public entry of the code gate (gate/GateEntry.tsx), where there is no app to go to: it is called after a
// verified code instead of leaving for "/", and a session that needs no second factor is shown as an error, not sent on.
export const MfaPage = ({ onDone }: { onDone?: () => void } = {}) => {
  const { t } = useTranslation();
  const { appName } = useShell();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const otpRef = useRef<GetRef<typeof Input.OTP>>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const requirement = await getMfaRequirement();
      if (cancelled) return;

      if (requirement === "none") {
        if (onDone) {
          setError(t("common.error"));
          setStage("error");
        } else {
          navigate("/", { replace: true });
        }
        return;
      }

      if (requirement === "challenge") {
        const { data: factorsData, error: listErr } = await supabaseClient.auth.mfa.listFactors();
        if (cancelled) return;
        const verified = factorsData?.totp?.[0];
        if (listErr || !verified) {
          setError(listErr?.message ?? t("mfa.noFactor"));
          setStage("error");
          return;
        }
        setFactorId(verified.id);
        setStage("challenge");
        return;
      }

      // enroll: remove a stray unverified factor left over from an abandoned attempt.
      const { data: factorsData } = await supabaseClient.auth.mfa.listFactors();
      const stale = factorsData?.all.filter((f) => f.factor_type === "totp" && f.status === "unverified") ?? [];
      for (const f of stale) {
        await supabaseClient.auth.mfa.unenroll({ factorId: f.id });
      }
      if (cancelled) return;

      const { data: enrollData, error: enrollErr } = await supabaseClient.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
        // Pins the issuer shown in the authenticator app (GoTrue would use the Site URL).
        issuer: appName,
      });
      if (cancelled) return;
      if (enrollErr || !enrollData) {
        setError(enrollErr?.message ?? t("mfa.enrollFailed"));
        setStage("error");
        return;
      }
      setFactorId(enrollData.id);
      // The returned value is already a complete data URI; do not prepend a prefix.
      setQrCode(enrollData.totp.qr_code);
      setSecret(enrollData.totp.secret);
      setStage("enroll");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Runs by itself when the sixth digit is in (typed or pasted); the button stays for a corrected code.
  const submit = async (value = code) => {
    if (!factorId || value.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: verifyErr } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId, code: value });
    setSubmitting(false);
    if (verifyErr) {
      setError(verifyErr.message);
      setCode("");
      // The field was disabled during the check and lost the focus; put it back for the next try.
      setTimeout(() => otpRef.current?.focus(), 0);
      return;
    }
    if (onDone) onDone();
    else navigate("/", { replace: true });
  };

  const signOut = async () => {
    await supabaseClient.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (stage === "loading") {
    return (
      <PageShell>
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spin size="large" />
        </div>
      </PageShell>
    );
  }

  if (stage === "error") {
    return (
      <PageShell>
        <Title level={4}>{t("mfa.title")}</Title>
        <Alert type="error" showIcon message={error ?? t("common.error")} style={{ marginBottom: 16 }} />
        <Button block onClick={signOut}>
          {t("mfa.signOut")}
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Title level={4}>{t("mfa.required")}</Title>
      {stage === "enroll" && (
        <>
          <Paragraph type="secondary">
            {t("mfa.enrollHint")}
          </Paragraph>
          {qrCode && (
            <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
              <img src={qrCode} alt={t("mfa.qrAlt")} width={200} height={200} />
            </div>
          )}
          {secret && (
            <Paragraph type="secondary" style={{ textAlign: "center" }}>
              {t("mfa.manual")} <Text code>{secret}</Text>
            </Paragraph>
          )}
          <Divider />
        </>
      )}
      {stage === "challenge" && (
        <Paragraph type="secondary">{t("mfa.challengeHint")}</Paragraph>
      )}
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Input.OTP ref={otpRef} length={6} value={code} onChange={(value) => { setCode(value); if (value.length === 6) void submit(value); }} disabled={submitting} />
        <Button type="primary" block loading={submitting} disabled={code.length !== 6} onClick={() => void submit()}>
          {t("mfa.verify")}
        </Button>
        <Button type="link" block onClick={signOut}>
          {t("mfa.signOut")}
        </Button>
      </Space>
    </PageShell>
  );
};
