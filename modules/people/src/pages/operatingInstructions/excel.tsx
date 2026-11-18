// Ported 1:1 from COMPASS (app/src/pages/operatingInstructions/excel.tsx).
import { useState } from "react";
import { Alert, App as AntdApp, Button, Checkbox, Dropdown, Modal, Space, Table, Tag, Typography, Upload } from "antd";
import { DownloadOutlined, FileExcelOutlined, InboxOutlined, UploadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import i18n from "i18next"; // platform: the app's i18next instance (COMPASS: ../../i18n)
import { useInstructionAccess, useInstructionLanguages, useInstructions, useInstructionsRefresh } from "../../hooks/useOperatingInstructions";
import { errorText } from "@rbp/core";
import { instructionNumber, languageName, type InstructionOverview } from "../../lib/operatingInstructions";
import { instructionWorkbook, loadInstructionData, parseNumber, planImport, readInstructionSheet, runImport, type ImportGroup, type ImportResult } from "../../lib/instructionExcel";
import { downloadBlob } from "@rbp/ui";

// Excel export and import (~/maintenance_tool/docs/operating-instructions.md "Excel export and import"): the button on the tab All.
// Export = the instructions of the current filter, one row per language; template = the same file without rows.

const fileName = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
const fixed = () => ({ t: i18n.t, de: i18n.getFixedT("de"), en: i18n.getFixedT("en") });

export const InstructionExcelButton = ({ rows }: { rows: InstructionOverview[] }) => {
  const { t } = useTranslation();
  const access = useInstructionAccess();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const items = [
    { key: "export", icon: <DownloadOutlined />, label: t("operatingInstructions.excel.export", { count: rows.length }), disabled: !rows.length },
    { key: "template", icon: <FileExcelOutlined />, label: t("operatingInstructions.excel.template") },
    ...(access.canWrite ? [{ key: "import", icon: <UploadOutlined />, label: t("operatingInstructions.excel.import") }] : []),
  ];
  const onClick = ({ key }: { key: string }) => {
    if (key === "export") setExporting(true);
    if (key === "template") downloadBlob(instructionWorkbook([], ["de"], fixed()), fileName(t("operatingInstructions.excel.templateFile")));
    if (key === "import") setImporting(true);
  };
  return (
    <>
      <Dropdown menu={{ items, onClick }} trigger={["click"]}>
        <Button icon={<FileExcelOutlined />}>{t("operatingInstructions.excel.button")}</Button>
      </Dropdown>
      {exporting && <ExportModal rows={rows} onClose={() => setExporting(false)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  );
};

const ExportModal = ({ rows, onClose }: { rows: InstructionOverview[]; onClose: () => void }) => {
  const { t, i18n: { resolvedLanguage } } = useTranslation();
  const { message } = AntdApp.useApp();
  const { data: configured } = useInstructionLanguages();
  const available = [...new Set(["de", ...(configured ?? []), ...rows.flatMap((r) => r.languages)])];
  const [languages, setLanguages] = useState<string[] | null>(null);
  const chosen = languages ?? available;
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const data = await loadInstructionData(rows);
      const list = rows.map((r) => data.get(r.id)!).filter(Boolean);
      downloadBlob(instructionWorkbook(list, chosen, fixed()), fileName(t("operatingInstructions.excel.exportFile")));
      onClose();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={t("operatingInstructions.excel.exportTitle", { count: rows.length })} onCancel={onClose} onOk={run} okText={t("operatingInstructions.excel.download")} confirmLoading={busy}>
      <Typography.Paragraph type="secondary">{t("operatingInstructions.excel.exportHint")}</Typography.Paragraph>
      <Typography.Text strong>{t("operatingInstructions.languages")}</Typography.Text>
      <div style={{ marginTop: 8 }}>
        <Checkbox.Group
          value={chosen}
          onChange={(v) => setLanguages(["de", ...(v as string[]).filter((x) => x !== "de")])}
          options={available.map((l) => ({ value: l, label: languageName(l, resolvedLanguage ?? "de"), disabled: l === "de" }))}
        />
      </div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>{t("operatingInstructions.excel.languagesHint")}</Typography.Paragraph>
    </Modal>
  );
};

type Planned = ImportGroup & { result?: ImportResult };

const ImportModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { data: all } = useInstructions();
  const refresh = useInstructionsRefresh();
  const [plan, setPlan] = useState<Planned[] | null>(null);
  const [file, setFile] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Reads the file, compares it with the current versions and asks the database what would happen (rolled back).
  const read = async (f: File) => {
    setBusy(true);
    setDone(false);
    try {
      const rows = await readInstructionSheet(await f.arrayBuffer());
      const numbers = new Set(rows.map((r) => parseNumber(r.cells.number ?? "")).filter((n): n is number => n != null));
      const data = await loadInstructionData((all ?? []).filter((x) => numbers.has(x.number)));
      const groups = planImport(rows, all ?? [], data);
      const sent = groups.filter((g) => g.payload && g.changes.length);
      const results = await runImport(sent.map((g) => g.payload!), false);
      setPlan(groups.map((g) => ({ ...g, result: results.find((r) => r.row === g.row) })));
      setFile(f.name);
    } catch (e) {
      message.error(e instanceof Error && (e.message === "empty" || e.message === "header" || /zip|workbook/.test(e.message)) ? t("operatingInstructions.excel.unreadable") : errorText(e));
    } finally {
      setBusy(false);
    }
    return false;
  };

  const ready = (plan ?? []).filter((g) => g.payload && g.changes.length && g.result?.result !== "error");
  const apply = async () => {
    setBusy(true);
    try {
      const results = await runImport(ready.map((g) => g.payload!), true);
      setPlan((p) => (p ?? []).map((g) => ({ ...g, result: results.find((r) => r.row === g.row) ?? g.result })));
      setDone(true);
      void refresh();
      const failed = results.filter((r) => r.result === "error").length;
      if (failed) message.warning(t("operatingInstructions.excel.appliedWithErrors", { count: results.length - failed, failed }));
      else message.success(t("operatingInstructions.excel.applied", { count: results.length }));
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const outcome = (g: Planned) => {
    if (g.problems.length) return <Tag color="error">{t("operatingInstructions.excel.result.error")}</Tag>;
    if (!g.changes.length) return <Tag>{t("operatingInstructions.excel.result.unchanged")}</Tag>;
    if (!g.result) return null;
    const color = g.result.result === "error" ? "error" : g.result.result === "unchanged" ? "default" : done ? "success" : "processing";
    return <Tag color={color}>{t(`operatingInstructions.excel.result.${g.result.result}`)}</Tag>;
  };
  const counts = (plan ?? []).reduce((acc, g) => {
    const key = g.problems.length || g.result?.result === "error" ? "error" : !g.changes.length ? "unchanged" : "ready";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Modal
      open
      width={980}
      title={t("operatingInstructions.excel.importTitle")}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t(done ? "common.close" : "common.cancel")}</Button>
          {plan && !done && (
            <Button type="primary" loading={busy} disabled={!ready.length} onClick={apply}>
              {t("operatingInstructions.excel.apply", { count: ready.length })}
            </Button>
          )}
        </Space>
      }
    >
      {!plan ? (
        <>
          <Typography.Paragraph type="secondary">{t("operatingInstructions.excel.importHint")}</Typography.Paragraph>
          <Upload.Dragger accept=".xlsx" multiple={false} showUploadList={false} disabled={busy || !all} beforeUpload={read}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{busy ? t("operatingInstructions.excel.reading") : t("operatingInstructions.excel.drop")}</p>
          </Upload.Dragger>
        </>
      ) : (
        <>
          <Alert
            style={{ marginBottom: 12 }}
            type={counts.error ? "warning" : "info"}
            showIcon
            message={t(done ? "operatingInstructions.excel.summaryDone" : "operatingInstructions.excel.summary", { file, ready: counts.ready ?? 0, unchanged: counts.unchanged ?? 0, errors: counts.error ?? 0 })}
            description={!done ? t("operatingInstructions.excel.neverPublishes") : undefined}
          />
          <Table<Planned>
            rowKey="row"
            size="small"
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            dataSource={plan}
            columns={[
              { title: t("operatingInstructions.excel.row"), dataIndex: "row", width: 70 },
              {
                title: t("operatingInstructions.number"),
                width: 100,
                render: (_, g) => (g.number != null ? instructionNumber(g.number) : g.result?.number ? instructionNumber(g.result.number) : <Tag color="blue">{t("operatingInstructions.excel.new")}</Tag>),
              },
              { title: t("operatingInstructions.titleField"), dataIndex: "title", ellipsis: true },
              {
                title: t("operatingInstructions.excel.changes"),
                render: (_, g) => (
                  <Space size={[4, 4]} wrap>
                    {g.changes.map((c) => <Tag key={c}>{c.startsWith("text:") ? t("operatingInstructions.excel.change.text", { language: c.slice(5).toUpperCase() }) : t(`operatingInstructions.excel.change.${c}`)}</Tag>)}
                  </Space>
                ),
              },
              {
                title: t("operatingInstructions.excel.outcome"),
                width: 260,
                render: (_, g) => (
                  <div>
                    {outcome(g)}
                    {g.problems.map((p, i) => <div key={i}><Typography.Text type="danger" style={{ fontSize: 12 }}>{t(`operatingInstructions.excel.problem.${p.key}`, p.values)}</Typography.Text></div>)}
                    {g.warnings.map((p, i) => <div key={`w${i}`}><Typography.Text type="warning" style={{ fontSize: 12 }}>{t(`operatingInstructions.excel.warning.${p.key}`, p.values)}</Typography.Text></div>)}
                    {g.result?.message && <div><Typography.Text type="danger" style={{ fontSize: 12 }}>{g.result.message}</Typography.Text></div>}
                  </div>
                ),
              },
            ]}
          />
          {!done && <Button type="link" style={{ paddingLeft: 0 }} onClick={() => setPlan(null)}>{t("operatingInstructions.excel.otherFile")}</Button>}
        </>
      )}
    </Modal>
  );
};
