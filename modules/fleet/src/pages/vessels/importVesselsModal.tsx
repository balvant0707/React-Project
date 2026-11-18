// Ported 1:1 from the NPM tool (app/src/pages/vessels/importVesselsModal.tsx).
import { useState } from "react";
import { Modal, Upload, Button, Progress, Typography, Table, Alert, Descriptions, App as AntdApp } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import type { SeawebParseResult } from "./seawebExcel";
import { errorText } from "@rbp/core";

// Batch size for each upsert request - large enough to keep round-trips low
// for a ~180k row SeaWeb export, small enough to stay well under PostgREST's
// request body limit.
const BATCH_SIZE = 2000;

type ImportVesselsModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

const readInWorker = (file: File) =>
  new Promise<SeawebParseResult>((resolve, reject) => {
    const worker = new Worker(new URL("./seawebExcelWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<SeawebParseResult>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Could not read the Excel file"));
    };
    file.arrayBuffer().then((buffer) => worker.postMessage(buffer, [buffer]), reject);
  });

// Import of the SeaWeb "Ship Data All" Excel export (~180k rows, run every 1-2
// months) in three steps: pick the file, read it and review how its columns
// map to vessel fields (nothing is written yet), then import. See
// ~/npm_tool/docs/domain-model.md "SeaWeb import". Upserts keyed on `imo` (unique) rather
// than truncating the table: vessels.id is a generated UUID that
// hull_events.vessel_id references with `on delete restrict`, so a vessel that
// already exists keeps its id (and its Hull Event links) across every
// re-import; only new IMOs get a fresh row. Vessels dropped from the file are
// left as-is.
export const ImportVesselsModal = ({ open, onClose, onImported }: ImportVesselsModalProps) => {
  const { message } = AntdApp.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<SeawebParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setFile(null);
    setReading(false);
    setParsed(null);
    setImporting(false);
    setProgress(0);
  };

  const handleClose = () => {
    if (importing || reading) return;
    reset();
    onClose();
  };

  const readFile = async () => {
    if (!file) return;
    setReading(true);
    try {
      const result = await readInWorker(file);
      if (result.error) throw new Error(result.error);
      setParsed(result);
    } catch (e: any) {
      message.error(errorText(e, "Could not read the Excel file"));
    } finally {
      setReading(false);
    }
  };

  const runImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const rows = parsed.vessels;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseClient.from("vessels").upsert(batch, { onConflict: "imo" });
        if (error) throw error;
        setProgress(Math.min(i + BATCH_SIZE, rows.length));
      }

      // group_owner_company_id/technical_manager_company_id/
      // operator_company_id for every non-manually-overridden vessel are
      // re-derived automatically by the vessels_resolve_company_links
      // trigger as part of the upsert above - no separate RPC call needed.
      // Manual corrections (the matching *_is_manual = true) are untouched,
      // by both the upsert (those columns aren't mapped in seawebExcel.ts) and the
      // trigger (it skips manual rows by design).
      message.success(`Imported ${rows.length} vessels`);
      reset();
      onClose();
      onImported();
    } catch (e: any) {
      message.error(errorText(e, "Import failed"));
      setImporting(false);
    }
  };

  const busy = reading || importing;
  const total = parsed?.vessels.length ?? 0;

  return (
    <Modal
      title="Import Vessels from Excel"
      open={open}
      onCancel={handleClose}
      maskClosable={!busy}
      closable={!busy}
      width={parsed ? 720 : 520}
      footer={
        parsed
          ? [
              <Button key="back" onClick={reset} disabled={importing}>
                Choose another file
              </Button>,
              <Button key="import" type="primary" onClick={runImport} loading={importing}>
                Import {total.toLocaleString()} vessels
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={handleClose} disabled={busy}>
                Cancel
              </Button>,
              <Button key="read" type="primary" onClick={readFile} loading={reading} disabled={!file}>
                Read file
              </Button>,
            ]
      }
    >
      {!parsed && (
        <>
          <Typography.Paragraph type="secondary">
            Upserts by IMO - existing vessels are updated in place (Hull Event links stay intact), new IMOs are added.
            Vessels no longer in the file are left untouched. Use the SeaWeb "Ship Data All" Excel export as it is
            (first sheet, SeaWeb column headers). Reading the file comes first; nothing is written until you confirm.
          </Typography.Paragraph>
          <Upload.Dragger
            accept=".xlsx"
            maxCount={1}
            disabled={busy}
            beforeUpload={(f) => {
              setFile(f);
              return false;
            }}
            onRemove={() => setFile(null)}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag the SeaWeb Excel export here</p>
          </Upload.Dragger>
          {reading && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              Reading the Excel file - a full export can take a minute...
            </Typography.Paragraph>
          )}
        </>
      )}
      {parsed && (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="File">{file?.name}</Descriptions.Item>
            <Descriptions.Item label="Rows in sheet">{parsed.sheetRows.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Vessels to import">{total.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Rows without IMO (skipped)">{parsed.skippedWithoutImo}</Descriptions.Item>
            <Descriptions.Item label="Duplicate IMOs (last row used)">{parsed.duplicateImos}</Descriptions.Item>
            <Descriptions.Item label="Tonnage 0 / blank (stored as unknown)">{parsed.unknownTonnage.toLocaleString()}</Descriptions.Item>
          </Descriptions>
          <Table
            size="small"
            pagination={false}
            rowKey="column"
            dataSource={parsed.mappedColumns}
            scroll={{ y: 280 }}
            columns={[
              { title: "File column", dataIndex: "header" },
              { title: "Vessel field", dataIndex: "column", render: (c: string) => <code>{c}</code> },
              { title: "Example (first filled row)", dataIndex: "example", render: (e: string | null) => e ?? <Typography.Text type="secondary">-</Typography.Text> },
            ]}
          />
          {parsed.ignoredHeaders.length > 0 && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Not imported: {parsed.ignoredHeaders.join(", ")}.
            </Typography.Paragraph>
          )}
          {parsed.missingColumns.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={`Not in this file, so left untouched on existing vessels: ${parsed.missingColumns.join(", ")}.`}
            />
          )}
          {importing && (
            <div style={{ marginTop: 16 }}>
              <Progress percent={total > 0 ? Math.round((progress / total) * 100) : 0} />
              <Typography.Text type="secondary">
                {progress.toLocaleString()} / {total.toLocaleString()} rows
              </Typography.Text>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};
