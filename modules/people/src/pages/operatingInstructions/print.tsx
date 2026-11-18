// Ported 1:1 from COMPASS (app/src/pages/operatingInstructions/print.tsx).
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button, Empty, Select, Spin } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { InstructionSheet } from "../../components/operatingInstruction/sheet";
import { useUserMap } from "@rbp/core";
import { useInstruction, useInstructionTexts, useInstructionVersions } from "../../hooks/useOperatingInstructions";
import { textFor, languageName } from "../../lib/operatingInstructions";

// Print view of one version (default: the published one) in one language (?version=, ?lang=). A page of its own outside
// the app layout, so the menu never ends up on paper; one A4 page in the normal case.
export const OperatingInstructionPrint = () => {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const users = useUserMap();
  const { data: row, isLoading } = useInstruction(id);
  const { data: versions } = useInstructionVersions(id);
  const wanted = params.get("version");
  const version = (versions ?? []).find((v) => (wanted ? v.id === wanted : v.status === "published")) ?? (versions ?? [])[0];
  const { data: texts } = useInstructionTexts(version?.id);
  const text = textFor(texts, params.get("lang") ?? "de");
  const uiLanguage = i18n.resolvedLanguage ?? "de";

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!row) return <Empty description={t("common.notFound")} />;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="oi-print-page">
      <style>{`
        .oi-print-page { min-height: 100vh; background: #e9ecef; padding: 16px 16px 48px; }
        .oi-print-toolbar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .oi-print-sheet { max-width: 210mm; margin: 0 auto; box-shadow: 0 1px 6px rgba(0,0,0,.2); }
        @media print {
          @page { size: A4; margin: 8mm; }
          html, body, .oi-print-page { background: #fff !important; }
          .oi-print-page { padding: 0; min-height: 0; }
          .no-print { display: none !important; }
          .oi-print-sheet { box-shadow: none; max-width: none; }
          .oi-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="oi-print-toolbar no-print">
        <Link to={`/operating-instructions/${row.id}`}>{t("operatingInstructions.back")}</Link>
        <span style={{ flex: 1 }} />
        {(versions ?? []).length > 1 && (
          <Select
            value={version?.id}
            style={{ minWidth: 200 }}
            onChange={(v) => set("version", v)}
            options={(versions ?? []).map((v) => ({ value: v.id, label: `${t("operatingInstructions.versionNo", { no: v.version_no })} · ${t(`operatingInstructions.status.${v.status}`)}` }))}
          />
        )}
        {(texts ?? []).length > 1 && (
          <Select value={text?.language} style={{ minWidth: 150 }} onChange={(v) => set("lang", v)} options={(texts ?? []).map((x) => ({ value: x.language, label: languageName(x.language, uiLanguage) }))} />
        )}
        <Button type="primary" icon={<PrinterOutlined />} disabled={!version} onClick={() => window.print()}>{t("common.print")}</Button>
      </div>
      <div className="oi-print-sheet">
        {!version ? (
          <Empty description={t("operatingInstructions.noVersion")} />
        ) : (
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
        )}
      </div>
    </div>
  );
};
