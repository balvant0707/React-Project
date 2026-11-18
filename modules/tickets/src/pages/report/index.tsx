// Adapted from COMPASS (app/src/pages/report/index.tsx), ported; since 2026-11-14 hand-maintained
//. Changed: after the machine's name the reporter picks what is wrong
// on big buttons (the types the Edge Function offers, opt-in per type), then the inputs; the title is optional (the type's name);
// the Edge Function no longer returns the asset's location, so none is shown. No sign-in: only what that function returns is known here.
import { useEffect, useState } from "react";
import { Alert, Button, ConfigProvider, Form, Input, Result, Segmented, Spin, Tag, Typography, Upload } from "antd";
import { CameraOutlined, ToolOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import { useTranslation } from "react-i18next";
// @rbp/core/gate, not @rbp/core: this page is part of the public entry behind the code gate (docs/code-gate.md).
import { ANTD_LOCALES, LANGUAGES, SUPABASE_URL, currentLanguage } from "@rbp/core/gate";
import type { Language } from "@rbp/core";
import { shrinkImage } from "@rbp/module-messaging/src/lib/image.ts";
import { buildBody, flushReportOutbox, newClientRequestId, queueReport } from "../../offline/reportOutbox";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { BigChoice } from "../../components/bigChoice";

// Public QR-scan page: no login, no Refine shell. Talks only to the public-ticket-report Edge
// Function, which inserts one ticket (read access is limited to the asset's name and the offered types' names).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/public-ticket-report`;

type Status = "loading" | "ready" | "notFound" | "limited" | "sent" | "queued" | "error";

type PublicType = { key: string; name: string; name_de: string };
type PublicInfo = { asset: { name: string } | null; types: PublicType[] };

// The asset name and the offered types are remembered per token, so the form still works when the sticker is scanned again without reception.
const assetKey = (token: string) => `compass.report-asset.${token}`;
const readInfo = (token: string): PublicInfo => {
  try {
    const stored = JSON.parse(localStorage.getItem(assetKey(token)) ?? "null") as { asset?: { name: string }; name?: string; types?: PublicType[] } | null;
    // An older page stored the asset itself ({ name, location }).
    return { asset: stored?.asset ?? (stored?.name ? { name: stored.name } : null), types: stored?.types ?? [] };
  } catch {
    return { asset: null, types: [] };
  }
};

export const PublicReport = () => {
  const { t, i18n } = useTranslation();
  const token = window.location.pathname.split("/").filter(Boolean)[1] ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [asset, setAsset] = useState<{ name: string } | null>(null);
  const [types, setTypes] = useState<PublicType[]>([]);
  const [type, setType] = useState<PublicType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [photo, setPhoto] = useState<UploadFile[]>([]);
  const [sentLater, setSentLater] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    document.title = t("report.pageTitle");
  }, [t, i18n.language]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(token)}`);
        if (res.status === 429) return setStatus("limited");
        if (!res.ok) return setStatus("notFound");
        const json = await res.json();
        setAsset(json.asset);
        setTypes(json.types ?? []);
        try {
          localStorage.setItem(assetKey(token), JSON.stringify({ asset: json.asset, types: json.types ?? [] }));
        } catch {
          /* storage may be blocked */
        }
        setStatus("ready");
      } catch {
        // No reception: the form still works, the report is queued (the token is checked when it is sent).
        const cached = readInfo(token);
        setAsset(cached.asset);
        setTypes(cached.types);
        setStatus("ready");
      }
    })();
  }, [token]);

  // One type to offer, or none: nothing to choose.
  useEffect(() => {
    if (status === "ready" && !type && types.length === 1) setType(types[0]);
  }, [status, type, types]);

  // Reports queued earlier (this or another sticker) go out as soon as the connection is back.
  useEffect(() => {
    const flush = () =>
      void flushReportOutbox(ENDPOINT).then((count) => {
        if (count > 0) setSentLater(true);
      });
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  const submit = async (values: { title?: string; description?: string; reporter_name?: string; reporter_contact?: string; website?: string }) => {
    setSubmitting(true);
    const original = photo[0]?.originFileObj;
    // Phone photos are 4-8 MB; the server takes 5 MB, so shrink before sending (and before queueing offline).
    const shrunk = original ? await shrinkImage(original) : null;
    const file = original && shrunk ? (shrunk === original ? original : new File([shrunk], original.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })) : undefined;
    if (file && file.size > MAX_PHOTO_BYTES) {
      form.setFields([{ name: "title", errors: [t("report.errors.photo_too_large")] }]);
      setSubmitting(false);
      return;
    }
    const report = {
      id: newClientRequestId(),
      token,
      // The reporter may leave the title empty: the type's name then says what it is.
      title: values.title?.trim() || (type ? pickName(type.name, type.name_de) : ""),
      type: type?.key,
      description: values.description ?? "",
      reporter_name: values.reporter_name ?? "",
      reporter_contact: values.reporter_contact ?? "",
      photo: file ?? null,
      photoName: file?.name ?? null,
    };
    const queue = async () => {
      await queueReport({ ...report, queuedAt: Date.now() });
      setStatus("queued");
    };
    try {
      if (!navigator.onLine) return await queue();
      const body = buildBody({ ...report, website: values.website ?? "" });
      const res = await fetch(ENDPOINT, { method: "POST", body });
      if (res.status === 429) return setStatus("limited");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        form.setFields([{ name: "title", errors: [t(`report.errors.${json.error}`, { defaultValue: t("report.errors.generic") })] }]);
        return;
      }
      const json = await res.json();
      setTicketNumber(json.ticket_number ?? null);
      setStatus("sent");
    } catch {
      // The connection dropped while sending: keep the report (the client id prevents a duplicate ticket).
      await queue().catch(() => setStatus("error"));
    } finally {
      setSubmitting(false);
    }
  };

  const lang = currentLanguage();

  return (
    <ConfigProvider locale={ANTD_LOCALES[lang]}>
      <div style={{ minHeight: "100vh", background: "#FAFAFA", display: "flex", justifyContent: "center", padding: "16px" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          <img src="/wilckens-logo.svg" alt="Wilckens Farben" height={32} style={{ display: "block", marginBottom: 16 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <ToolOutlined /> {t("report.title")}
            </Typography.Title>
            <Segmented<Language> size="small" value={lang} options={LANGUAGES.map((l) => ({ value: l, label: l.toUpperCase() }))} onChange={(l) => i18n.changeLanguage(l)} />
          </div>

          {status === "loading" && <div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>}
          {status === "notFound" && <Result status="404" title={t("report.notFound")} subTitle={t("report.notFoundHint")} />}
          {status === "limited" && <Result status="warning" title={t("report.rateLimited")} />}
          {status === "error" && <Result status="error" title={t("report.errors.generic")} />}
          {status === "sent" && (
            <Result
              status="success"
              title={t("report.sent")}
              subTitle={ticketNumber ? t("report.sentNumber", { number: ticketNumber }) : undefined}
              extra={<Button onClick={() => window.location.reload()}>{t("report.another")}</Button>}
            />
          )}

          {status === "queued" && (
            <Result
              status="info"
              title={t("offline.queuedTitle")}
              subTitle={t("offline.queued")}
              extra={<Button onClick={() => window.location.reload()}>{t("report.another")}</Button>}
            />
          )}

          {sentLater && status !== "queued" && <Alert type="success" showIcon style={{ marginBottom: 16 }} message={t("offline.sentLater")} />}

          {status === "ready" && (
            <>
              {asset ? (
                <Alert type="info" showIcon style={{ marginBottom: 16 }} message={<strong>{asset.name}</strong>} />
              ) : (
                <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t("report.assetUnknownOffline")} />
              )}
              {types.length > 1 && !type && (
                <>
                  <Typography.Paragraph strong style={{ fontSize: 16 }}>{t("report.pickType")}</Typography.Paragraph>
                  <BigChoice
                    choices={types.map((x) => ({ key: x.key, label: pickName(x.name, x.name_de) }))}
                    onPick={(key) => setType(types.find((x) => x.key === key) ?? null)}
                    height={72}
                    fontSize={18}
                  />
                </>
              )}
              {(type || types.length === 0) && (
              <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} initialValues={{ website: "" }}>
                {type && (
                  <div style={{ marginBottom: 16 }}>
                    <Tag color="blue" style={{ fontSize: 15, padding: "3px 12px" }}>{pickName(type.name, type.name_de)}</Tag>
                    {types.length > 1 && (
                      <Button type="link" size="small" onClick={() => setType(null)}>
                        {t("report.change")}
                      </Button>
                    )}
                  </div>
                )}
                <Form.Item name="title" label={type ? t("report.titleOptional") : t("report.whatsWrong")} rules={[{ required: !type, max: 200 }]}>
                  <Input size="large" autoFocus placeholder={type ? pickName(type.name, type.name_de) : t("report.titlePlaceholder")} />
                </Form.Item>
                <Form.Item name="description" label={t("report.details")}>
                  <Input.TextArea rows={4} maxLength={4000} />
                </Form.Item>
                <Form.Item label={t("report.photo")}>
                  <Upload
                    accept="image/*"
                    maxCount={1}
                    listType="picture"
                    fileList={photo}
                    beforeUpload={(f) => {
                      if (f.size > 40 * 1024 * 1024) {
                        form.setFields([{ name: "title", errors: [t("report.errors.photo_too_large")] }]);
                        return Upload.LIST_IGNORE;
                      }
                      return false;
                    }}
                    onChange={({ fileList }) => setPhoto(fileList)}
                  >
                    <Button icon={<CameraOutlined />}>{t("report.addPhoto")}</Button>
                  </Upload>
                </Form.Item>
                <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>{t("report.optionalContact")}</Typography.Text>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Form.Item name="reporter_name" label={t("report.yourName")} style={{ flex: "1 1 200px" }}>
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item name="reporter_contact" label={t("report.contact")} style={{ flex: "1 1 200px" }}>
                    <Input maxLength={200} />
                  </Form.Item>
                </div>
                {/* Honeypot: invisible to people, tempting to bots. */}
                <Form.Item name="website" hidden>
                  <Input tabIndex={-1} autoComplete="off" />
                </Form.Item>
                <div aria-hidden style={{ position: "absolute", left: "-10000px" }}>
                  <input type="text" name="website_hp" tabIndex={-1} autoComplete="off" onChange={(e) => form.setFieldValue("website", e.target.value)} />
                </div>
                <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
                  {t("report.submit")}
                </Button>
              </Form>
              )}
            </>
          )}
        </div>
      </div>
    </ConfigProvider>
  );
};
