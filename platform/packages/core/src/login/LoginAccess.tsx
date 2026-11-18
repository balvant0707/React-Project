import { useState } from "react";
import { App as AntdApp, Alert, Button, Input, Modal, Radio, Space, Tag, Typography } from "antd";
import { ClockCircleOutlined, KeyOutlined, LockOutlined, PrinterOutlined, QrcodeOutlined, StopOutlined, UnlockOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { supabaseClient } from "../supabase";
import { activationUrl } from "./loginEmail";
import { formatDateTime } from "@rbp/ui";
import { useShell } from "../shell/ShellContext";

// From COMPASS app/src/components/loginAccess.tsx (changed: imports; the sheet prints the app name). A person's sign-in
// for user managers (~/maintenance_tool/docs/username-login.md): give login, activation sheet, lock / unlock, revoke; may_manage_login decides.

type LoginPerson = {
  id: string;
  name: string | null;
  email: string | null;
  username: string;
  has_login: boolean;
  sign_in_method: "password" | "sso";
  locked_at: string | null;
};

type Sheet = { code: string; expires_at: string; username: string; name: string };

// The Edge Function answers with a code; the known ones have a text (login.grantErrors.*).
const functionErrorText = async (error: unknown) => {
  const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
  const code = detail?.error as string | undefined;
  if (code && i18n.exists(`login.grantErrors.${code}`)) return i18n.t(`login.grantErrors.${code}`);
  return (detail?.message as string | undefined) ?? code ?? (error instanceof Error ? error.message : String(error));
};

export const LoginStateTags = ({ person }: { person: Pick<LoginPerson, "has_login" | "locked_at"> }) => {
  const { t } = useTranslation();
  if (!person.has_login) return <Tag>{t("people.noLogin")}</Tag>;
  if (person.locked_at) return <Tag color="red" icon={<LockOutlined />}>{t("login.locked")}</Tag>;
  return <Tag color="green">{t("admin.hasLogin")}</Tag>;
};

// showUsername: false where the username is an input field next to it (users page).
export const LoginAccess = ({ person, onChanged, showUsername = true }: { person: LoginPerson; onChanged: () => void; showUsername?: boolean }) => {
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [granting, setGranting] = useState(false);
  const [locking, setLocking] = useState(false);
  const { data: mayManage } = useQuery({
    queryKey: ["may-manage-login", person.id],
    queryFn: async () => (await supabaseClient.rpc("may_manage_login", { p_user_id: person.id })).data === true,
  });
  const password = person.sign_in_method === "password";
  // The sign-in throttle (login_throttle): the account waits after repeated wrong passwords; only login managers can read it.
  const { data: waiting, refetch: refetchWaiting } = useQuery({
    queryKey: ["login-throttle", person.id],
    enabled: person.has_login && person.sign_in_method === "password",
    queryFn: async () => {
      const { data } = await supabaseClient.from("login_throttle").select("locked_until").eq("user_id", person.id).maybeSingle();
      return data?.locked_until && new Date(data.locked_until) > new Date() ? (data.locked_until as string) : null;
    },
  });

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (e) {
      message.error(await functionErrorText(e));
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const issueSheet = () =>
    run("sheet", async () => {
      const { data, error } = await supabaseClient.rpc("login_activation_create", { p_user_id: person.id });
      if (error) throw error;
      const row = (data as { code: string; expires_at: string; username: string }[])[0];
      setSheet({ ...row, name: person.name ?? row.username });
    });

  const grant = (sendMail: boolean) =>
    run("grant", async () => {
      const { data, error } = await supabaseClient.functions.invoke("person-grant-login", { body: { person_id: person.id, send_mail: sendMail } });
      if (error) throw error;
      setGranting(false);
      if (data?.sign_in_method === "sso") message.success(t("people.loginGrantedSso"));
      else if (data?.mail_sent) message.success(t("people.loginGranted"));
      else {
        if (data?.mail_error) message.warning(t("login.mailFailed", { error: data.mail_error }));
        const { data: rows, error: sheetError } = await supabaseClient.rpc("login_activation_create", { p_user_id: person.id });
        if (sheetError) throw sheetError;
        const row = (rows as { code: string; expires_at: string; username: string }[])[0];
        setSheet({ ...row, name: person.name ?? row.username });
      }
    });

  const confirmSheet = () =>
    modal.confirm({
      title: t("login.sheetConfirmTitle"),
      content: t("login.sheetConfirm"),
      okText: t("login.sheetCreate"),
      cancelText: t("common.cancel"),
      onOk: issueSheet,
    });

  const confirmRevoke = () =>
    modal.confirm({
      title: t("login.revokeTitle", { name: person.name ?? person.username }),
      content: t("login.revokeConfirm"),
      okText: t("login.revoke"),
      okButtonProps: { danger: true },
      cancelText: t("common.cancel"),
      onOk: () =>
        run("revoke", async () => {
          const { error } = await supabaseClient.rpc("user_revoke_login", { p_user_id: person.id });
          if (error) throw error;
          message.success(t("login.revoked"));
        }),
    });

  const unlock = () =>
    run("unlock", async () => {
      const { error } = await supabaseClient.rpc("user_unlock", { p_user_id: person.id });
      if (error) throw error;
      message.success(t("login.unlocked"));
    });

  const clearWait = () =>
    run("throttle", async () => {
      const { error } = await supabaseClient.rpc("login_throttle_clear", { p_user_id: person.id });
      if (error) throw error;
      message.success(t("login.throttleCleared"));
      await refetchWaiting();
    });

  const may = mayManage === true;
  return (
    <>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space wrap size={[8, 4]}>
          {showUsername && <Typography.Text type="secondary">{t("login.username")}:</Typography.Text>}
          {showUsername && <Typography.Text strong copyable>{person.username}</Typography.Text>}
          <LoginStateTags person={person} />
          {person.has_login && <Tag>{password ? t("admin.signInPassword") : t("admin.signInSso")}</Tag>}
        </Space>
        {person.locked_at && <Typography.Text type="secondary">{t("login.lockedSince", { date: formatDateTime(person.locked_at) })}</Typography.Text>}
        {waiting && (
          <Space wrap>
            <Typography.Text type="warning"><ClockCircleOutlined /> {t("login.throttled", { time: formatDateTime(waiting) })}</Typography.Text>
            <Button size="small" loading={busy === "throttle"} disabled={!may} onClick={clearWait}>{t("login.throttleClear")}</Button>
          </Space>
        )}
        {mayManage === false && person.has_login && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("login.notYours")}</Typography.Text>}
        <Space wrap>
          {!person.has_login && (
            <Button icon={<KeyOutlined />} loading={busy === "grant"} onClick={() => setGranting(true)} disabled={!may || (!password && !person.email)} title={mayManage === false ? t("login.grantErrors.not_allowed") : !password && !person.email ? t("people.emailRequired") : undefined}>
              {t("people.grantLogin")}
            </Button>
          )}
          {person.has_login && password && !person.locked_at && (
            <Button icon={<QrcodeOutlined />} loading={busy === "sheet"} disabled={!may} onClick={confirmSheet}>{t("login.sheet")}</Button>
          )}
          {person.has_login && !person.locked_at && (
            <Button icon={<LockOutlined />} disabled={!may} onClick={() => setLocking(true)}>{t("login.lock")}</Button>
          )}
          {person.has_login && person.locked_at && (
            <Button icon={<UnlockOutlined />} loading={busy === "unlock"} disabled={!may} onClick={unlock}>{t("login.unlock")}</Button>
          )}
          {person.has_login && (
            <Button danger icon={<StopOutlined />} loading={busy === "revoke"} disabled={!may} onClick={confirmRevoke}>{t("login.revoke")}</Button>
          )}
        </Space>
      </Space>
      {granting && <GrantDialog person={person} busy={busy === "grant"} onCancel={() => setGranting(false)} onGrant={grant} />}
      {locking && (
        <LockDialog
          person={person}
          onCancel={() => setLocking(false)}
          onLock={(reason) =>
            run("lock", async () => {
              const { error } = await supabaseClient.rpc("user_lock", { p_user_id: person.id, p_reason: reason || null });
              if (error) throw error;
              setLocking(false);
              message.success(t("login.lockedDone"));
            })
          }
        />
      )}
      {sheet && <ActivationSheet sheet={sheet} onClose={() => setSheet(null)} />}
    </>
  );
};

const GrantDialog = ({ person, busy, onCancel, onGrant }: { person: LoginPerson; busy: boolean; onCancel: () => void; onGrant: (sendMail: boolean) => void }) => {
  const { t } = useTranslation();
  const password = person.sign_in_method === "password";
  const [how, setHow] = useState<"mail" | "sheet">(person.email ? "mail" : "sheet");
  return (
    <Modal open title={t("people.grantLogin")} okText={t("people.grantLogin")} cancelText={t("common.cancel")} confirmLoading={busy} onCancel={onCancel} onOk={() => onGrant(how === "mail")}>
      <Typography.Paragraph>{password && person.email ? t("login.grantEmail", { email: person.email }) : t("login.grantUsername", { username: person.username })}</Typography.Paragraph>
      {!password ? (
        <Alert type="info" showIcon message={t("login.grantSso", { email: person.email ?? "" })} />
      ) : (
        <Radio.Group value={how} onChange={(e) => setHow(e.target.value)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Radio value="mail" disabled={!person.email}>{person.email ? t("login.grantMail", { email: person.email }) : t("login.grantMailNone")}</Radio>
          <Radio value="sheet">{t("login.grantSheet")}</Radio>
        </Radio.Group>
      )}
    </Modal>
  );
};

const LockDialog = ({ person, onCancel, onLock }: { person: LoginPerson; onCancel: () => void; onLock: (reason: string) => Promise<void> }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={t("login.lockTitle", { name: person.name ?? person.username })}
      okText={t("login.lock")}
      okButtonProps={{ danger: true }}
      cancelText={t("common.cancel")}
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={async () => {
        setBusy(true);
        await onLock(reason.trim());
        setBusy(false);
      }}
    >
      <Typography.Paragraph>{t("login.lockExplain")}</Typography.Paragraph>
      <Input.TextArea rows={2} maxLength={500} placeholder={t("login.lockReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
};

// The printed sheet handed over in person: QR code to /activate, username and code for typing, validity. Printing
// shows only the sheet (the rest of the page is hidden by the print style).
const ActivationSheet = ({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) => {
  const { t } = useTranslation();
  const { appName } = useShell();
  return (
    <Modal
      open
      title={t("login.sheetTitle")}
      onCancel={onClose}
      width={560}
      footer={[
        <Button key="close" onClick={onClose}>{t("common.close")}</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>{t("common.print")}</Button>,
      ]}
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .activation-sheet, .activation-sheet * { visibility: visible !important; }
          .activation-sheet { position: fixed; inset: 0; padding: 24mm; background: #fff; }
        }
      `}</style>
      <Alert type="warning" showIcon message={t("login.sheetOnce")} style={{ marginBottom: 16 }} />
      <div className="activation-sheet" style={{ background: "#fff", color: "#000", padding: 16, border: "1px solid #ddd", borderRadius: 6 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{appName}</div>
        <div style={{ fontSize: 16, marginBottom: 12 }}>{t("login.sheetFor", { name: sheet.name })}</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <QRCodeSVG value={activationUrl(sheet.username, sheet.code)} size={180} />
          <div style={{ fontSize: 14, lineHeight: 1.8 }}>
            <div>{t("login.username")}: <strong style={{ fontFamily: "monospace", fontSize: 16 }}>{sheet.username}</strong></div>
            <div>{t("activate.code")}: <strong style={{ fontFamily: "monospace", fontSize: 16 }}>{sheet.code}</strong></div>
            <div>{t("login.sheetValid", { date: formatDateTime(sheet.expires_at) })}</div>
          </div>
        </div>
        <ol style={{ marginTop: 16, paddingLeft: 20, fontSize: 13 }}>
          <li>{t("login.sheetStep1")}</li>
          <li>{t("login.sheetStep2")}</li>
          <li>{t("login.sheetStep3")}</li>
          <li>{t("login.sheetStep4")}</li>
        </ol>
        <div style={{ fontSize: 12, color: "#555" }}>{t("login.sheetAddress", { url: `${window.location.origin}/activate` })}</div>
      </div>
    </Modal>
  );
};
