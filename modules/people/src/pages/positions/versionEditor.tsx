// Ported 1:1 from COMPASS (app/src/pages/positions/versionEditor.tsx).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { App as AntdApp, Alert, Button, DatePicker, Empty, Form, Input, Modal, Popconfirm, Space, Spin, Tag, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { Page } from "@rbp/core";
import { JobDescriptionDocument } from "../../components/jobDescription";
import { RequirementsEditor } from "../../components/requirementsList";
import { RichTextEditor } from "@rbp/module-messaging/src/richText.tsx";
import { useUserMap } from "@rbp/core";
import { useCanEditPeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { usePositionAccess, usePositionCleanup, usePositions, usePositionsRefresh, usePositionVersions } from "../../hooks/usePositions";
import { REQUIREMENTS_AFTER, SECTIONS, VERSION_COLOR, type JobDescriptionVersion } from "../../lib/positions";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";

type Values = Record<(typeof SECTIONS)[number], string | null> & { valid_from?: Dayjs | null; change_note?: string };


// One version of a job description: a draft is edited here (managers submit, HR publishes); every other version is
// shown read-only. Status changes go through the RPCs only.
export const VersionEditor = () => {
  const { id, versionId } = useParams();
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = usePositionsRefresh();
  const access = usePositionAccess();
  const canErase = useCanEditPeople();
  const cleanup = usePositionCleanup();
  const users = useUserMap();
  const { data: positions } = usePositions();
  const { data: versions, isLoading } = usePositionVersions(id);
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const position = (positions ?? []).find((p) => p.id === id);
  const version = (versions ?? []).find((v) => v.id === versionId);
  const editable = !!version && version.status === "draft" && !!id && access.canWrite(id);

  useEffect(() => {
    if (!version) return;
    form.setFieldsValue({
      ...Object.fromEntries(SECTIONS.map((s) => [s, version[s]])),
      valid_from: version.valid_from ? dayjs(version.valid_from) : null,
      change_note: version.change_note ?? "",
    } as Values);
  }, [version?.id, version?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!version || !position || !id) return <Empty description={t("common.notFound")} />;

  const done = async (text: string, backToPosition = true) => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    message.success(text);
    if (backToPosition) void navigate(`/positions/${id}`);
  };

  const save = async (): Promise<boolean> => {
    const v = form.getFieldsValue();
    const { error } = await supabaseClient
      .from("job_description_versions")
      .update({
        ...Object.fromEntries(SECTIONS.map((s) => [s, v[s] ?? ""])),
        valid_from: v.valid_from ? v.valid_from.format("YYYY-MM-DD") : null,
        change_note: v.change_note?.trim() || null,
      })
      .eq("id", version.id);
    if (error) {
      message.error(errorText(error));
      return false;
    }
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

  const saveDraft = () => run("save", async () => { if (await save()) await done(t("positions.draftSaved"), false); });
  const submit = () => run("submit", async () => {
    if (!(await save())) return;
    const { error } = await supabaseClient.rpc("job_description_submit", { p_version: version.id });
    if (error) throw error;
    await done(t("positions.submitted"));
  });
  const publish = () => run("publish", async () => {
    if (editable && !(await save())) return;
    const { error } = await supabaseClient.rpc("job_description_publish", { p_version: version.id });
    if (error) throw error;
    await done(t("positions.published"));
  });
  const giveBack = () => run("return", async () => {
    const { error } = await supabaseClient.rpc("job_description_return", { p_version: version.id, p_note: note });
    if (error) throw error;
    setReturning(false);
    await done(t("positions.returned"));
  });
  const removeOld = () => run("delete", async () => {
    await cleanup.deleteVersion(version.id);
    await done(t("positions.versionDeleted"));
  });
  const remove = () => run("delete", async () => {
    const { error } = await supabaseClient.from("job_description_versions").delete().eq("id", version.id);
    if (error) throw error;
    await done(t("positions.draftDeleted"));
  });

  const heading = (
    <Space wrap>
      <span>{position.name}</span>
      <Tag color={VERSION_COLOR[version.status]}>{t(`positions.status.${version.status}`)}</Tag>
      <Tag>{t("positions.versionNo", { no: version.version_no })}</Tag>
    </Space>
  );

  return (
    <Page
      title={heading}
      subtitle={<Link to={`/positions/${id}`}>{t("positions.backToPosition")}</Link>}
      headerButtons={
        <>
          {!editable && <Button icon={<PrinterOutlined />} onClick={() => navigate(`/positions/${id}/print?version=${version.id}`)}>{t("positions.printView")}</Button>}
          {editable && <Button onClick={saveDraft} loading={busy === "save"}>{t("positions.saveDraft")}</Button>}
          {editable && !access.canManage && <Button type="primary" onClick={submit} loading={busy === "submit"}>{t("positions.submit")}</Button>}
          {access.canManage && (editable || version.status === "submitted") && <Button type="primary" onClick={publish} loading={busy === "publish"}>{t("positions.publish")}</Button>}
          {access.canManage && version.status === "submitted" && <Button onClick={() => setReturning(true)}>{t("positions.return")}</Button>}
          {canErase && version.status === "archived" && (
            <Popconfirm title={t("positions.deleteVersion")} onConfirm={removeOld} okText={t("common.yes")} cancelText={t("common.no")}>
              <Button danger loading={busy === "delete"}>{t("common.delete")}</Button>
            </Popconfirm>
          )}
          {editable && (
            <Popconfirm title={t("positions.deleteDraft")} onConfirm={remove} okText={t("common.yes")} cancelText={t("common.no")}>
              <Button danger loading={busy === "delete"}>{t("common.delete")}</Button>
            </Popconfirm>
          )}
        </>
      }
    >
      {version.status === "draft" && version.returned_note && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t("positions.returnedWith")} description={version.returned_note} />}
      {version.status === "submitted" && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t("positions.submittedBy", { name: users.get(version.submitted_by_user_id ?? "")?.name ?? "—", date: formatDate(version.submitted_at) })} />}

      {editable ? (
        <Form form={form} layout="vertical" requiredMark={false}>
          {SECTIONS.map((s) => (
            <div key={s}>
              <Form.Item name={s} label={t(`positions.sections.${s}`)} extra={t(`positions.sectionHints.${s}`)}>
                <RichTextEditor minHeight={s === "duties" ? 220 : 140} />
              </Form.Item>
              {s === REQUIREMENTS_AFTER && (
                <Form.Item label={t("positions.sections.requirements")} extra={t("positions.sectionHints.requirements")}>
                  <RequirementsEditor versionId={version.id} />
                </Form.Item>
              )}
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 16 }}>
            <Form.Item name="valid_from" label={t("positions.validFrom")} extra={t("positions.validFromHint")}><DatePicker style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="change_note" label={t("positions.changeNote")} extra={t("positions.changeNoteHint")}><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
          </div>
        </Form>
      ) : (
        <>
          {version.change_note && <Typography.Paragraph type="secondary">{t("positions.changeNote")}: {version.change_note}</Typography.Paragraph>}
          <JobDescriptionDocument version={version as JobDescriptionVersion} />
        </>
      )}

      <Modal open={returning} onCancel={() => setReturning(false)} onOk={giveBack} confirmLoading={busy === "return"} title={t("positions.return")} okText={t("positions.return")} cancelText={t("common.cancel")}>
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("positions.returnNote")} maxLength={2000} />
      </Modal>
    </Page>
  );
};
