// Ported 1:1 from COMPASS (app/src/pages/operatingInstructions/show.tsx).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { App as AntdApp, Button, Card, DatePicker, Descriptions, Dropdown, Empty, Form, Input, List, Modal, Select, Space, Spin, Tag, Typography } from "antd";
import { CheckOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import dayjs, { type Dayjs } from "dayjs";
import { Page } from "@rbp/core";
import { AssetSelect } from "@rbp/module-task-family/src/components/assetSelect.tsx";
import { OwnerSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { InstructionSheet } from "../../components/operatingInstruction/sheet";
import { useUserMap } from "@rbp/core";
import {
  useInstruction, useInstructionAccess, useInstructionLinks, useInstructionLog, useInstructionTexts, useInstructionVersions, useInstructionsRefresh,
  useTrainingTypeInstructions,
} from "../../hooks/useOperatingInstructions";
import { VERSION_COLOR, instructionNumber, reviewOverdue, textFor, type InstructionOverview, languageName } from "../../lib/operatingInstructions";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTrainingTypes } from "../../hooks/useTrainings";
import { ChangeTag, InstructionStateTags, KindTag, ReinstructionChoice } from "./parts";

// One operating instruction: the page-like preview of a version in a language, where it applies, its versions and its
// history. Drafts are edited on the version page.
export const OperatingInstructionShow = () => {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const [params, setParams] = useSearchParams();
  const access = useInstructionAccess();
  const users = useUserMap();
  const refresh = useInstructionsRefresh();
  const { data: row, isLoading } = useInstruction(id);
  const { data: versions } = useInstructionVersions(id);
  const { data: log } = useInstructionLog(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [classifying, setClassifying] = useState<{ id: string; value: boolean } | null>(null);

  const wanted = params.get("version");
  const version = (versions ?? []).find((v) => (wanted ? v.id === wanted : v.status === "published")) ?? (versions ?? [])[0];
  const { data: texts } = useInstructionTexts(version?.id);
  const uiLanguage = i18n.resolvedLanguage ?? "de";
  const language = params.get("lang") ?? ((texts ?? []).some((x) => x.language === uiLanguage) ? uiLanguage : "de");
  const text = textFor(texts, language);
  const heading = row ? `${instructionNumber(row.number)} ${(uiLanguage === "en" && row.title_en) || row.title}` : "";

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!row || !id) return <Empty description={t("common.notFound")} />;

  const open = (versions ?? []).find((v) => v.status === "draft" || v.status === "submitted");
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
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
  const newDraft = () => run("draft", async () => {
    const { data, error } = await supabaseClient.rpc("operating_instruction_new_draft", { p_instruction: id });
    if (error) throw error;
    void refresh();
    void navigate(`/operating-instructions/${id}/versions/${data as string}`);
  });
  const remove = () => run("delete", async () => {
    const { error } = await supabaseClient.from("operating_instructions").delete().eq("id", id);
    if (error) throw error;
    void refresh();
    message.success(t("operatingInstructions.deleted"));
    void navigate("/operating-instructions");
  });
  const setActive = (active: boolean) => run("active", async () => {
    const { error } = await supabaseClient.from("operating_instructions").update({ active }).eq("id", id);
    if (error) throw error;
    void refresh();
  });

  const menu = [
    ...(access.canCreate ? [{ key: "edit", icon: <EditOutlined />, label: t("operatingInstructions.editDetails"), onClick: () => setEditing(true) }] : []),
    ...(access.canCreate ? [{ key: "active", label: row.active ? t("operatingInstructions.deactivate") : t("operatingInstructions.activate"), onClick: () => setActive(!row.active) }] : []),
    ...(access.canCreate && !row.published_version_id && !(versions ?? []).some((v) => v.status === "archived")
      ? [{ key: "delete", icon: <DeleteOutlined />, danger: true, label: t("common.delete"), onClick: () => modal.confirm({ title: t("operatingInstructions.deleteConfirm"), okText: t("common.yes"), cancelText: t("common.no"), okButtonProps: { danger: true }, onOk: remove }) }]
      : []),
  ];

  return (
    <Page
      title={heading}
      subtitle={<Space wrap><KindTag kind={row.kind} /><InstructionStateTags row={row} />{!row.active && <Tag>{t("operatingInstructions.inactive")}</Tag>}</Space>}
      headerButtons={
        <>
          {version && <Button icon={<PrinterOutlined />} onClick={() => navigate(`/operating-instructions/${id}/print?version=${version.id}&lang=${language}`)}>{t("common.print")}</Button>}
          {row.can_edit && open && <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/operating-instructions/${id}/versions/${open.id}`)}>{t(open.status === "draft" ? "operatingInstructions.editDraft" : "operatingInstructions.openSubmitted")}</Button>}
          {!row.can_edit && access.canApprove && open?.status === "submitted" && <Button type="primary" onClick={() => navigate(`/operating-instructions/${id}/versions/${open.id}`)}>{t("operatingInstructions.openSubmitted")}</Button>}
          {row.can_edit && !open && <Button type="primary" icon={<PlusOutlined />} loading={busy === "draft"} onClick={newDraft}>{t("operatingInstructions.newVersion")}</Button>}
          {access.canApprove && row.published_version_id && <Button icon={<CheckOutlined />} onClick={() => setReviewing(true)}>{t("operatingInstructions.reviewed")}</Button>}
          {menu.length > 0 && <Dropdown menu={{ items: menu }} trigger={["click"]}><Button icon={<MoreOutlined />} aria-label={t("common.more")} /></Dropdown>}
        </>
      }
    >
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "2 1 560px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {(versions ?? []).length > 1 && (
              <Select
                value={version?.id}
                style={{ minWidth: 220 }}
                onChange={(v) => setParam("version", v)}
                options={(versions ?? []).map((v) => ({ value: v.id, label: `${t("operatingInstructions.versionNo", { no: v.version_no })} · ${t(`operatingInstructions.status.${v.status}`)}` }))}
              />
            )}
            {(texts ?? []).length > 1 && (
              <Select
                value={text?.language}
                style={{ minWidth: 160 }}
                onChange={(v) => setParam("lang", v)}
                options={(texts ?? []).map((x) => ({ value: x.language, label: languageName(x.language, uiLanguage) }))}
              />
            )}
          </div>
          {!version ? (
            <Empty description={t("operatingInstructions.noVersion")} />
          ) : (
            <div style={{ background: "#e9ecef", padding: 12, borderRadius: 8 }}>
              <div style={{ maxWidth: "210mm", margin: "0 auto", boxShadow: "0 1px 6px rgba(0,0,0,.2)" }}>
                <InstructionSheet
                  instructionId={row.id}
                  number={row.number}
                  legacyNumber={row.legacy_number}
                  kind={row.kind}
                  versionNo={version.version_no}
                  status={version.status}
                  validFrom={version.valid_from}
                  signalWord={version.signal_word}
                  signs={version.signs}
                  text={text}
                  language={text?.language ?? "de"}
                  approvedBy={version.approved_by_user_id ? users.get(version.approved_by_user_id)?.name ?? null : null}
                  approvedAt={version.approved_at}
                  reviewDueOn={row.review_due_on}
                />
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <Card size="small" title={t("operatingInstructions.details")}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label={t("operatingInstructions.number")}>{instructionNumber(row.number)}</Descriptions.Item>
              {row.legacy_number && <Descriptions.Item label={t("operatingInstructions.legacyNumber")}>{row.legacy_number}</Descriptions.Item>}
              <Descriptions.Item label={t("fields.owner")}>{row.owner_user_id ? <Link to={`/people/${row.owner_user_id}`}>{users.get(row.owner_user_id)?.name ?? "—"}</Link> : "—"}</Descriptions.Item>
              <Descriptions.Item label={t("operatingInstructions.validFrom")}>{row.valid_from ? formatDate(row.valid_from) : "—"}</Descriptions.Item>
              <Descriptions.Item label={t("operatingInstructions.reviewDue")}>
                {row.review_due_on ? <span style={{ color: reviewOverdue(row.review_due_on) ? "#cf1322" : undefined }}>{formatDate(row.review_due_on)}</span> : "—"}
              </Descriptions.Item>
              <Descriptions.Item label={t("operatingInstructions.languages")}>{row.languages.map((l) => <Tag key={l}>{languageName(l, uiLanguage)}</Tag>)}</Descriptions.Item>
            </Descriptions>
          </Card>
          <AppliesTo row={row} />
          <TaughtThrough instructionId={row.id} />
          <Card size="small" title={t("operatingInstructions.versions")}>
            <List
              size="small"
              dataSource={versions ?? []}
              renderItem={(v) => (
                <List.Item
                  actions={[
                    (v.status === "draft" || v.status === "submitted") && (row.can_edit || access.canApprove) ? (
                      <Link key="open" to={`/operating-instructions/${id}/versions/${v.id}`}>{t("operatingInstructions.open")}</Link>
                    ) : (
                      <a key="show" onClick={() => setParam("version", v.id)}>{t("operatingInstructions.show")}</a>
                    ),
                    access.canApprove && v.version_no > 1 && (v.status === "published" || v.status === "archived") && (
                      <a key="classify" onClick={() => setClassifying({ id: v.id, value: v.requires_reinstruction })}>{t("operatingInstructions.change.classify")}</a>
                    ),
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    title={<Space size={6}>{t("operatingInstructions.versionNo", { no: v.version_no })}<Tag color={VERSION_COLOR[v.status]}>{t(`operatingInstructions.status.${v.status}`)}</Tag>{v.version_no > 1 && (v.status === "published" || v.status === "archived") && <ChangeTag reinstruction={v.requires_reinstruction} />}</Space>}
                    description={[v.valid_from && t("operatingInstructions.validFromDate", { date: formatDate(v.valid_from) }), v.change_note].filter(Boolean).join(" · ") || undefined}
                  />
                </List.Item>
              )}
            />
          </Card>
          <Card size="small" title={t("operatingInstructions.history")}>
            {(log ?? []).length === 0 ? (
              <Typography.Text type="secondary">{t("operatingInstructions.noHistory")}</Typography.Text>
            ) : (
              <List
                size="small"
                dataSource={log ?? []}
                renderItem={(l) => (
                  <List.Item>
                    <div>
                      <div>
                        {t(`operatingInstructions.log.${l.action}`, { language: l.language ? languageName(l.language, uiLanguage) : "", version: (versions ?? []).find((v) => v.id === l.version_id)?.version_no ?? "?" })}
                        {l.action === "classified" && <> <ChangeTag reinstruction={(l.note ?? "").startsWith("reinstruction")} /></>}
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDate(l.happened_at)} · {l.by_user_id ? users.get(l.by_user_id)?.name ?? "—" : "—"}
                        {logNote(l) ? ` · ${logNote(l)}` : ""}
                      </Typography.Text>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </div>
      </div>
      <ClassifyModal value={classifying} onClose={() => setClassifying(null)} />
      <ReviewModal open={reviewing} instructionId={id} onClose={() => setReviewing(false)} />
      <DetailsModal open={editing} row={row} onClose={() => setEditing(false)} />
    </Page>
  );
};

// A classification note starts with its code (editorial | reinstruction), which the history shows as a tag.
const logNote = (l: { action: string; note: string | null }) => (l.action === "classified" ? (l.note ?? "").replace(/^(editorial|reinstruction):? ?/, "") : l.note ?? "");

// An approver changes afterwards whether a version requires a new instruction; the training status follows at once.
const ClassifyModal = ({ value, onClose }: { value: { id: string; value: boolean } | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const refresh = useInstructionsRefresh();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value) {
      setChoice(value.value);
      setNote("");
    }
  }, [value]);
  const save = async () => {
    if (!value) return;
    setBusy(true);
    const { error } = await supabaseClient.rpc("operating_instruction_classify", { p_version: value.id, p_requires_reinstruction: choice, p_note: note || undefined });
    setBusy(false);
    if (error) return void message.error(errorText(error));
    void refresh();
    void queryClient.invalidateQueries({ queryKey: ["training-status"] });
    message.success(t("operatingInstructions.change.classified"));
    onClose();
  };
  return (
    <Modal open={!!value} onCancel={onClose} onOk={save} confirmLoading={busy} title={t("operatingInstructions.change.classify")} okText={t("common.save")} cancelText={t("common.cancel")}>
      <Typography.Paragraph type="secondary">{t("operatingInstructions.change.classifyHint")}</Typography.Paragraph>
      <ReinstructionChoice value={choice} onChange={setChoice} />
      <Input.TextArea style={{ marginTop: 12 }} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t("operatingInstructions.reviewNote")} />
    </Modal>
  );
};

const ReviewModal = ({ open, instructionId, onClose }: { open: boolean; instructionId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const refresh = useInstructionsRefresh();
  const [next, setNext] = useState<Dayjs | null>(dayjs().add(1, "year"));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setNext(dayjs().add(1, "year"));
      setNote("");
    }
  }, [open]);
  const save = async () => {
    setBusy(true);
    const { error } = await supabaseClient.rpc("operating_instruction_reviewed", { p_instruction: instructionId, p_next: next ? next.format("YYYY-MM-DD") : undefined, p_note: note || undefined });
    setBusy(false);
    if (error) {
      message.error(errorText(error));
      return;
    }
    void refresh();
    message.success(t("operatingInstructions.reviewedDone"));
    onClose();
  };
  return (
    <Modal open={open} onCancel={onClose} onOk={save} confirmLoading={busy} title={t("operatingInstructions.reviewed")} okText={t("operatingInstructions.confirmReview")} cancelText={t("common.cancel")}>
      <Typography.Paragraph type="secondary">{t("operatingInstructions.reviewedHint")}</Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label={t("operatingInstructions.nextReview")}>
          <DatePicker value={next} onChange={setNext} disabledDate={(d) => !d.isAfter(dayjs(), "day")} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label={t("operatingInstructions.reviewNote")}>
          <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const DetailsModal = ({ open, row, onClose }: { open: boolean; row: InstructionOverview; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const refresh = useInstructionsRefresh();
  const [form] = Form.useForm<{ owner_user_id: string | null; legacy_number: string }>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) form.setFieldsValue({ owner_user_id: row.owner_user_id, legacy_number: row.legacy_number ?? "" });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const v = form.getFieldsValue();
    setBusy(true);
    const { error } = await supabaseClient.from("operating_instructions").update({ owner_user_id: v.owner_user_id ?? null, legacy_number: v.legacy_number?.trim() || null }).eq("id", row.id);
    setBusy(false);
    if (error) {
      message.error(errorText(error));
      return;
    }
    void refresh();
    onClose();
  };
  return (
    <Modal open={open} onCancel={onClose} onOk={save} confirmLoading={busy} title={t("operatingInstructions.editDetails")} okText={t("common.save")} cancelText={t("common.cancel")}>
      <Form form={form} layout="vertical">
        <Form.Item name="owner_user_id" label={t("fields.owner")} extra={t("operatingInstructions.ownerHint")}><OwnerSelect /></Form.Item>
        <Form.Item name="legacy_number" label={t("operatingInstructions.legacyNumber")} extra={t("operatingInstructions.legacyNumberHint")}><Input maxLength={40} /></Form.Item>
      </Form>
    </Modal>
  );
};

// The training types that teach this instruction; they are linked in the training catalogue.
const TaughtThrough = ({ instructionId }: { instructionId: string }) => {
  const { t } = useTranslation();
  const { data: links } = useTrainingTypeInstructions();
  const { data: types } = useTrainingTypes();
  const linked = (types ?? []).filter((x) => (links ?? []).some((l) => l.instruction_id === instructionId && l.training_type_id === x.id));
  return (
    <Card size="small" title={t("operatingInstructions.taughtIn")}>
      {linked.length ? linked.map((x) => <Tag key={x.id}><Link to="/trainings?tab=catalogue">{x.name}</Link></Tag>) : <Typography.Text type="secondary">{t("operatingInstructions.notTaught")}</Typography.Text>}
    </Card>
  );
};

// Where the instruction applies: assets (and everything below them) and asset types.
const AppliesTo = ({ row }: { row: InstructionOverview }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const refresh = useInstructionsRefresh();
  const { data: links } = useInstructionLinks(row.id);
  const [asset, setAsset] = useState<string | undefined>();
  const { data: assetTypes } = useQuery({
    queryKey: ["asset-types", "names"],
    staleTime: 5 * 60_000,
    queryFn: async () => ((await supabaseClient.from("asset_types").select("id, name, name_de").order("name")).data ?? []) as { id: string; name: string; name_de: string }[],
  });
  const takenTypes = useMemo(() => new Set((links?.assetTypes ?? []).map((x) => x.asset_type_id)), [links]);
  const edit = row.can_edit;

  const write = async (fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn();
    if (error) message.error(errorText(error));
    void refresh();
  };
  const addAsset = (id: string | undefined) => { if (id) void write(() => supabaseClient.from("operating_instruction_assets").insert({ instruction_id: row.id, asset_id: id })); setAsset(undefined); };
  const addType = (id: string) => void write(() => supabaseClient.from("operating_instruction_assets").insert({ instruction_id: row.id, asset_type_id: id }));
  const removeLink = (id: string) => void write(() => supabaseClient.from("operating_instruction_assets").delete().eq("id", id));
  const closable = (onClose: () => void) => (edit ? { closable: true, onClose: (e: React.MouseEvent) => { e.preventDefault(); onClose(); } } : {});

  return (
    <Card size="small" title={t("operatingInstructions.appliesTo")}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("operatingInstructions.assets")}</Typography.Text>
      <div style={{ margin: "4px 0 10px" }}>
        {(links?.assets ?? []).map((a) => <Tag key={a.id} {...closable(() => removeLink(a.id))}><Link to={`/assets/${a.asset_id}?tab=instructions`}>{a.name}</Link></Tag>)}
        {(links?.assetTypes ?? []).map((a) => <Tag key={a.id} color="blue" {...closable(() => removeLink(a.id))}>{t("operatingInstructions.assetTypeTag", { name: localName(a) })}</Tag>)}
        {!(links?.assets ?? []).length && !(links?.assetTypes ?? []).length && <Typography.Text type="secondary">—</Typography.Text>}
        {edit && (
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <AssetSelect value={asset} onChange={addAsset} placeholder={t("operatingInstructions.addAsset")} style={{ flex: "1 1 160px" }} />
            <Select<string>
              value={undefined}
              placeholder={t("operatingInstructions.addAssetType")}
              style={{ flex: "1 1 140px" }}
              onChange={(v) => v && addType(v)}
              options={(assetTypes ?? []).filter((x) => !takenTypes.has(x.id)).map((x) => ({ value: x.id, label: localName(x) }))}
            />
          </div>
        )}
      </div>
    </Card>
  );
};
