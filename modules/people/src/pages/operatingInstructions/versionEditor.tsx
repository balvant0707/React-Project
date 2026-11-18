// Ported 1:1 from COMPASS (app/src/pages/operatingInstructions/versionEditor.tsx).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { App as AntdApp, Alert, Button, Card, Checkbox, DatePicker, Empty, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Spin, Tag, Typography } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Page } from "@rbp/core";
import { RichTextEditor, RichTextView } from "@rbp/module-messaging/src/richText.tsx";
import { InstructionSheet } from "../../components/operatingInstruction/sheet";
import { SignPicker } from "../../components/operatingInstruction/signPicker";
import { SafetySign } from "../../lib/safetySigns";
import { ReinstructionChoice } from "./parts";
import { useUserMap } from "@rbp/core";
import {
  useInstruction, useInstructionAccess, useInstructionLanguages, useInstructionTexts, useInstructionVersions, useInstructionsRefresh,
} from "../../hooks/useOperatingInstructions";
import { KIND_SECTIONS, SECTION_SIGN_GROUPS, VERSION_COLOR, instructionNumber, type InstructionText, type SignalWord, languageName } from "../../lib/operatingInstructions";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";

type Meta = { signal_word: SignalWord | null; valid_from: string | null; change_note: string; requires_reinstruction: boolean; signs: Record<string, string[]> };

const emptyText = (versionId: string, language: string): InstructionText => ({ version_id: versionId, language, title: "", work_area: "", subject: "", sections: {}, needs_check: false });
const plain = (html: string | undefined) => (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const hasContent = (x: InstructionText) => !!(x.title.trim() || x.work_area.trim() || x.subject.trim() || Object.values(x.sections).some((v) => plain(v)));

// One version of an operating instruction. A draft is edited here in every language (German is the master); on the
// published version an approver adds or corrects translations. Status changes go through the RPCs only.
export const InstructionVersionEditor = () => {
  const { id, versionId } = useParams();
  const { t, i18n } = useTranslation();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const refresh = useInstructionsRefresh();
  const access = useInstructionAccess();
  const users = useUserMap();
  const { data: row } = useInstruction(id);
  const { data: versions, isLoading } = useInstructionVersions(id);
  const { data: texts } = useInstructionTexts(versionId);
  const { data: configured } = useInstructionLanguages();
  const version = (versions ?? []).find((v) => v.id === versionId);
  const uiLanguage = i18n.resolvedLanguage ?? "de";

  const [meta, setMeta] = useState<Meta | null>(null);
  const [drafts, setDrafts] = useState<Record<string, InstructionText>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState("de");
  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishChoice, setPublishChoice] = useState(false);

  useEffect(() => {
    if (!version) return;
    setMeta({ signal_word: version.signal_word, valid_from: version.valid_from, change_note: version.change_note ?? "", requires_reinstruction: version.requires_reinstruction, signs: version.signs ?? {} });
  }, [version?.id, version?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!texts || !versionId) return;
    const next: Record<string, InstructionText> = {};
    for (const x of texts) next[x.language] = x;
    for (const l of configured ?? ["de", "en"]) if (!next[l]) next[l] = emptyText(versionId, l);
    setDrafts(next);
    setDirty(new Set());
  }, [texts, configured, versionId]);

  const languages = useMemo(() => {
    const all = Object.keys(drafts);
    return ["de", ...all.filter((l) => l !== "de").sort()];
  }, [drafts]);

  if (isLoading || !meta) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!version || !row || !id) return <Empty description={t("common.notFound")} />;

  const draftEditable = version.status === "draft" && row.can_edit;
  // Translations of the published version: an approver, every language but German.
  const translating = version.status === "published" && access.canApprove;
  const textEditable = draftEditable || (translating && language !== "de");
  const current = drafts[language] ?? emptyText(version.id, language);
  const german = drafts.de;
  const sections = KIND_SECTIONS[row.kind];

  const changeText = (patch: Partial<InstructionText>) => {
    setDrafts((d) => ({ ...d, [language]: { ...(d[language] ?? emptyText(version.id, language)), ...patch } }));
    setDirty((s) => new Set(s).add(language));
  };
  const changeSection = (key: string, value: string | null) => changeText({ sections: { ...current.sections, [key]: value ?? "" } });

  const save = async (): Promise<boolean> => {
    if (draftEditable) {
      const { error } = await supabaseClient
        .from("operating_instruction_versions")
        .update({ signal_word: row.kind === "substance" ? meta.signal_word : null, valid_from: meta.valid_from, change_note: meta.change_note.trim() || null, requires_reinstruction: meta.requires_reinstruction, signs: meta.signs })
        .eq("id", version.id);
      if (error) {
        message.error(errorText(error));
        return false;
      }
    }
    // German first: saving it marks the translations "check", saving a translation afterwards clears its own mark.
    const order = [...dirty].sort((a, b) => (a === "de" ? -1 : b === "de" ? 1 : 0));
    for (const l of order) {
      const x = drafts[l];
      const known = (texts ?? []).some((y) => y.language === l);
      if (!x || (!known && !hasContent(x))) continue;
      if (!draftEditable && l === "de") continue;
      const { error } = await supabaseClient
        .from("operating_instruction_texts")
        .upsert({ version_id: version.id, language: l, title: x.title.trim(), work_area: x.work_area.trim(), subject: x.subject.trim(), sections: x.sections }, { onConflict: "version_id,language" });
      if (error) {
        message.error(errorText(error));
        return false;
      }
    }
    setDirty(new Set());
    return true;
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const done = (text: string, back = true) => {
    void refresh();
    message.success(text);
    if (back) void navigate(`/operating-instructions/${id}`);
  };
  const saveDraft = () => run("save", async () => { if (await save()) done(t("operatingInstructions.saved"), false); });
  const submit = () => run("submit", async () => {
    if (!(await save())) return;
    const { error } = await supabaseClient.rpc("operating_instruction_submit", { p_version: version.id });
    if (error) throw error;
    done(t("operatingInstructions.submitted"));
  });
  // From version 2 on the approver decides whether the change requires a new instruction.
  const publish = () => run("publish", async () => {
    if (draftEditable && !(await save())) return;
    const { error } = await supabaseClient.rpc("operating_instruction_publish", { p_version: version.id, p_requires_reinstruction: version.version_no > 1 ? publishChoice : undefined });
    if (error) throw error;
    setPublishing(false);
    done(t("operatingInstructions.published"));
  });
  const askPublish = () => {
    if (version.version_no === 1) return void publish();
    setPublishChoice(meta.requires_reinstruction);
    setPublishing(true);
  };
  const giveBack = () => run("return", async () => {
    const { error } = await supabaseClient.rpc("operating_instruction_return", { p_version: version.id, p_note: note });
    if (error) throw error;
    setReturning(false);
    done(t("operatingInstructions.returned"));
  });
  const removeDraft = () => run("delete", async () => {
    const { error } = await supabaseClient.from("operating_instruction_versions").delete().eq("id", version.id);
    if (error) throw error;
    done(t("operatingInstructions.draftDeleted"));
  });
  const removeLanguage = () => run("language", async () => {
    if ((texts ?? []).some((y) => y.language === language)) {
      const { error } = await supabaseClient.from("operating_instruction_texts").delete().eq("version_id", version.id).eq("language", language);
      if (error) throw error;
    }
    setLanguage("de");
    void refresh();
  });
  const addLanguage = (code: string) => {
    const l = code.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(l) || drafts[l]) return;
    setDrafts((d) => ({ ...d, [l]: emptyText(version.id, l) }));
    setLanguage(l);
  };

  const heading = (
    <Space wrap>
      <span>{instructionNumber(row.number)} {german?.title || row.title}</span>
      <Tag color={VERSION_COLOR[version.status]}>{t(`operatingInstructions.status.${version.status}`)}</Tag>
      <Tag>{t("operatingInstructions.versionNo", { no: version.version_no })}</Tag>
    </Space>
  );
  const anyEditable = draftEditable || translating;

  return (
    <Page
      title={heading}
      subtitle={<Link to={`/operating-instructions/${id}`}>{t("operatingInstructions.back")}</Link>}
      headerButtons={
        <>
          <Button icon={<EyeOutlined />} onClick={() => setPreview(true)}>{t("operatingInstructions.preview")}</Button>
          {anyEditable && <Button onClick={saveDraft} loading={busy === "save"} disabled={!draftEditable && dirty.size === 0}>{t("common.save")}</Button>}
          {draftEditable && !access.canApprove && <Button type="primary" onClick={submit} loading={busy === "submit"}>{t("operatingInstructions.submit")}</Button>}
          {access.canApprove && (draftEditable || version.status === "submitted") && <Button type="primary" onClick={askPublish} loading={busy === "publish"}>{t("operatingInstructions.publish")}</Button>}
          {access.canApprove && version.status === "submitted" && <Button onClick={() => setReturning(true)}>{t("operatingInstructions.return")}</Button>}
          {draftEditable && (
            <Popconfirm title={t("operatingInstructions.deleteDraft")} onConfirm={removeDraft} okText={t("common.yes")} cancelText={t("common.no")}>
              <Button danger loading={busy === "delete"}>{t("common.delete")}</Button>
            </Popconfirm>
          )}
        </>
      }
    >
      {version.status === "draft" && version.returned_note && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t("operatingInstructions.returnedWith")} description={version.returned_note} />}
      {version.status === "submitted" && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t("operatingInstructions.submittedBy", { name: users.get(version.submitted_by_user_id ?? "")?.name ?? "—", date: formatDate(version.submitted_at) })} />}
      {translating && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t("operatingInstructions.translatingHint")} />}

      {draftEditable && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 16px" }}>
            {row.kind === "substance" && (
              <Form.Item label={t("operatingInstructions.signalWord.label")} layout="vertical">
                <Select
                  allowClear
                  value={meta.signal_word ?? undefined}
                  onChange={(v) => setMeta({ ...meta, signal_word: (v as SignalWord | undefined) ?? null })}
                  options={(["danger", "warning"] as SignalWord[]).map((s) => ({ value: s, label: t(`operatingInstructions.signalWord.${s}`) }))}
                  placeholder={t("operatingInstructions.signalWord.none")}
                />
              </Form.Item>
            )}
            <Form.Item label={t("operatingInstructions.validFrom")} extra={t("operatingInstructions.validFromHint")} layout="vertical">
              <DatePicker value={meta.valid_from ? dayjs(meta.valid_from) : null} onChange={(d) => setMeta({ ...meta, valid_from: d ? d.format("YYYY-MM-DD") : null })} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label={t("operatingInstructions.changeNote")} layout="vertical">
              <Input.TextArea rows={1} autoSize={{ minRows: 1, maxRows: 4 }} value={meta.change_note} onChange={(e) => setMeta({ ...meta, change_note: e.target.value })} maxLength={2000} />
            </Form.Item>
          </div>
          <Checkbox checked={meta.requires_reinstruction} onChange={(e) => setMeta({ ...meta, requires_reinstruction: e.target.checked })}>{t("operatingInstructions.requiresReinstruction")}</Checkbox>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "4px 0 0" }}>{t("operatingInstructions.requiresReinstructionHint")}</Typography.Paragraph>
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Segmented
          value={language}
          onChange={(v) => setLanguage(v as string)}
          options={languages.map((l) => ({
            value: l,
            label: (
              <span>
                {languageName(l, uiLanguage)}
                {l === "de" && <Typography.Text type="secondary"> · {t("operatingInstructions.master")}</Typography.Text>}
                {drafts[l]?.needs_check && <Tag color="gold" style={{ marginLeft: 6 }}>{t("operatingInstructions.check")}</Tag>}
                {dirty.has(l) && " •"}
              </span>
            ),
          }))}
        />
        {anyEditable && (
          <Input.Search
            placeholder={t("operatingInstructions.addLanguage")}
            enterButton={t("common.add")}
            maxLength={2}
            style={{ width: 210 }}
            onSearch={(v, _e, info) => { if (info?.source !== "clear") addLanguage(v); }}
          />
        )}
        {textEditable && language !== "de" && (
          <Popconfirm title={t("operatingInstructions.removeLanguage")} onConfirm={removeLanguage} okText={t("common.yes")} cancelText={t("common.no")}>
            <Button danger size="small" loading={busy === "language"}>{t("operatingInstructions.removeLanguageButton")}</Button>
          </Popconfirm>
        )}
      </div>
      {language !== "de" && current.needs_check && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t("operatingInstructions.needsCheck")} />}

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 16px" }}>
          <Form.Item label={t("operatingInstructions.titleField")} extra={t("operatingInstructions.titleHint")} layout="vertical">
            <Input value={current.title} disabled={!textEditable} onChange={(e) => changeText({ title: e.target.value })} maxLength={200} />
            {language !== "de" && german?.title && <Reference text={german.title} />}
          </Form.Item>
          <Form.Item label={t("operatingInstructions.workArea")} extra={t("operatingInstructions.workAreaHint")} layout="vertical">
            <Input value={current.work_area} disabled={!textEditable} onChange={(e) => changeText({ work_area: e.target.value })} maxLength={200} />
            {language !== "de" && german?.work_area && <Reference text={german.work_area} />}
          </Form.Item>
          <Form.Item label={t(`operatingInstructions.subject.${row.kind}`)} extra={t(`operatingInstructions.subjectHint.${row.kind}`)} layout="vertical">
            <Input value={current.subject} disabled={!textEditable} onChange={(e) => changeText({ subject: e.target.value })} maxLength={300} />
            {language !== "de" && german?.subject && <Reference text={german.subject} />}
          </Form.Item>
        </div>
      </Card>

      {sections.map((s) => (
        <Card
          key={s}
          size="small"
          style={{ marginBottom: 12 }}
          title={t(`operatingInstructions.sections.${s}`)}
          extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{t(`operatingInstructions.sectionHints.${s}`)}</Typography.Text>}
        >
          {(draftEditable || (meta.signs[s] ?? []).length > 0) && (
            <div style={{ marginBottom: 8 }}>
              {draftEditable ? (
                <SignPicker value={meta.signs[s] ?? []} groups={SECTION_SIGN_GROUPS[s] ?? []} onChange={(codes) => setMeta({ ...meta, signs: { ...meta.signs, [s]: codes } })} />
              ) : (
                <Space size={4}>{(meta.signs[s] ?? []).map((c) => <SafetySign key={c} code={c} size={32} title={t(`safetySigns.codes.${c}`)} />)}</Space>
              )}
            </div>
          )}
          {textEditable ? (
            <RichTextEditor key={`${language}-${s}`} value={current.sections[s] ?? ""} onChange={(v) => changeSection(s, v)} minHeight={110} />
          ) : plain(current.sections[s]) ? (
            <RichTextView value={current.sections[s]} />
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          )}
          {language !== "de" && plain(german?.sections[s]) && <Reference text={plain(german?.sections[s])} />}
        </Card>
      ))}

      <Modal open={publishing} onCancel={() => setPublishing(false)} onOk={publish} confirmLoading={busy === "publish"} title={t("operatingInstructions.publish")} okText={t("operatingInstructions.publish")} cancelText={t("common.cancel")}>
        <Typography.Paragraph>{t("operatingInstructions.change.question")}</Typography.Paragraph>
        <ReinstructionChoice value={publishChoice} onChange={setPublishChoice} />
      </Modal>
      <Modal open={returning} onCancel={() => setReturning(false)} onOk={giveBack} confirmLoading={busy === "return"} title={t("operatingInstructions.return")} okText={t("operatingInstructions.return")} cancelText={t("common.cancel")}>
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("operatingInstructions.returnNote")} maxLength={2000} />
      </Modal>
      <Modal open={preview} onCancel={() => setPreview(false)} footer={null} width={900} title={t("operatingInstructions.preview")}>
        <InstructionSheet
          instructionId={row.id}
          number={row.number}
          legacyNumber={row.legacy_number}
          kind={row.kind}
          versionNo={version.version_no}
          status={version.status}
          validFrom={meta.valid_from}
          signalWord={meta.signal_word}
          signs={meta.signs}
          text={current.title || hasContent(current) ? current : german}
          language={language}
          approvedBy={version.approved_by_user_id ? users.get(version.approved_by_user_id)?.name ?? null : null}
          approvedAt={version.approved_at}
          reviewDueOn={row.review_due_on}
          showEmpty
        />
      </Modal>
    </Page>
  );
};

// The German original under a translation field.
const Reference = ({ text }: { text: string }) => {
  const { t } = useTranslation();
  return (
    <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "4px 0 0" }} ellipsis={{ rows: 3, expandable: true, symbol: t("common.more") }}>
      <Tag style={{ fontSize: 10 }}>DE</Tag>{text}
    </Typography.Paragraph>
  );
};
