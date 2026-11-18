// Ported 1:1 from COMPASS (app/src/pages/positions/print.tsx).
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button, Empty, Select, Spin } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { JobDescriptionDocument } from "../../components/jobDescription";
import { Logo } from "@rbp/module-task-family/src/components/logo.tsx";
import { useTeams, useUserMap } from "@rbp/core";
import { usePositions, usePositionTeams, usePositionVersions } from "../../hooks/usePositions";
import { formatDate } from "@rbp/ui";
import { PRINT_BASE_CSS } from "../../components/printSheet";

// Print view of one version (default: the published one) for printing from the browser. A page of its own, outside the
// app layout, so the menu never ends up on paper. Everything with class `no-print` stays on screen only.
export const PositionPrint = () => {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const { data: positions, isLoading } = usePositions();
  const { data: teams } = usePositionTeams();
  const { data: groups } = useTeams();
  const { data: versions } = usePositionVersions(id);
  const users = useUserMap();
  const position = (positions ?? []).find((p) => p.id === id);
  const wanted = params.get("version");
  const version = (versions ?? []).find((v) => (wanted ? v.id === wanted : v.status === "published"));
  const teamNames = (teams ?? []).filter((x) => x.position_id === id).map((x) => (groups ?? []).find((g) => g.id === x.team_id)?.name).filter(Boolean);

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!position) return <Empty description={t("common.notFound")} />;

  const meta: [string, string | null][] = [
    [t("positions.code"), position.code],
    [t("people.site"), position.site],
    [t("positions.teams"), teamNames.length ? teamNames.join(", ") : null],
    [t("positions.versions"), version ? t("positions.versionNo", { no: version.version_no }) : null],
    [t("positions.validFrom"), version?.valid_from ? formatDate(version.valid_from) : null],
    [t("positions.approvedBy"), version?.approved_by_user_id ? `${users.get(version.approved_by_user_id)?.name ?? "—"}, ${formatDate(version.approved_at)}` : null],
  ];

  return (
    <div className="print-page">
      <style>{`${PRINT_BASE_CSS}
        .print-sheet .ant-typography, .print-sheet .rich-text, .print-sheet .rich-text * { color: #000 !important; }
        .print-sheet h5 { font-size: 14px; border-bottom: 1px solid #999; padding-bottom: 2px; break-after: avoid; }
        .print-meta { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; margin: 12px 0 20px; font-size: 13px; }
        .print-meta dt { color: #555; }
        .print-meta dd { margin: 0; }
        .print-notvalid { display: inline-block; border: 2px solid #b00; color: #b00; font-weight: 700; padding: 2px 10px; margin: 8px 0; text-transform: uppercase; }
        .print-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 48px; break-inside: avoid; }
        .print-signatures div { border-top: 1px solid #000; padding-top: 4px; font-size: 12px; }
        .print-footer { margin-top: 24px; font-size: 11px; color: #555; }
      `}</style>

      <div className="print-toolbar no-print">
        <Link to={`/positions/${position.id}`}>{t("positions.backToPosition")}</Link>
        <span style={{ flex: 1 }} />
        {(versions ?? []).length > 1 && (
          <Select
            value={version?.id}
            style={{ minWidth: 220 }}
            onChange={(v) => setParams({ version: v }, { replace: true })}
            options={(versions ?? []).map((v) => ({ value: v.id, label: `${t("positions.versionNo", { no: v.version_no })} · ${t(`positions.status.${v.status}`)}` }))}
          />
        )}
        <Button type="primary" icon={<PrinterOutlined />} disabled={!version} onClick={() => window.print()}>{t("common.print")}</Button>
      </div>

      <div className="print-sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>{t("positions.printTitle")}</div>
            <h1>{position.name}</h1>
          </div>
          <Logo height={30} />
        </div>

        {!version ? (
          <Empty description={t("positions.noVersionToPrint")} />
        ) : (
          <>
            {version.status !== "published" && <div className="print-notvalid">{t("positions.notValid", { status: t(`positions.status.${version.status}`) })}</div>}
            <dl className="print-meta">
              {meta.filter(([, value]) => !!value).map(([label, value]) => (
                <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            <JobDescriptionDocument version={version} />
            <div className="print-signatures">
              <div>{t("positions.signatureSupervisor")}</div>
              <div>{t("positions.signatureHolder")}</div>
            </div>
            <div className="print-footer">{t("positions.printedOn", { date: formatDate(new Date().toISOString()) })}</div>
          </>
        )}
      </div>
    </div>
  );
};
