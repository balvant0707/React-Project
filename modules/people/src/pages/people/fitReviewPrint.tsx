// Ported 1:1 from COMPASS (app/src/pages/people/fitReviewPrint.tsx).
import { Link, useParams } from "react-router-dom";
import { Button, Empty, Spin } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { FitResultTag } from "../../components/personFitReviews";
import { Logo } from "@rbp/module-task-family/src/components/logo.tsx";
import { useUserMap } from "@rbp/core";
import { useFitReviews } from "../../hooks/useFitReviews";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { formatDate } from "@rbp/ui";
import { PRINT_BASE_CSS } from "../../components/printSheet";

// Print view of all suitability reviews of one person (for the audit). A page of its own, outside the app layout;
// everything with class `no-print` stays on screen only.
export const FitReviewPrint = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: people, isLoading } = usePeople();
  const { data: reviews } = useFitReviews(id);
  const users = useUserMap();
  const person = (people ?? []).find((p) => p.id === id);
  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!person) return <Empty description={t("common.notFound")} />;

  return (
    <div className="print-page">
      <style>{`${PRINT_BASE_CSS}
        .print-sheet h2 { font-size: 15px; border-bottom: 1px solid #999; padding-bottom: 2px; margin: 24px 0 6px; break-after: avoid; color: #000; }
        .print-sheet table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
        .print-sheet th, .print-sheet td { border: 1px solid #bbb; padding: 3px 6px; text-align: left; vertical-align: top; }
        .print-meta { font-size: 13px; margin: 4px 0; }
      `}</style>
      <div className="print-toolbar no-print">
        <Link to={`/people/${person.id}`}>{t("fit.backToPerson")}</Link>
        <span style={{ flex: 1 }} />
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>{t("common.print")}</Button>
      </div>
      <div className="print-sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>{t("fit.printTitle")}</div>
            <h1>{personName(person)}</h1>
          </div>
          <Logo height={30} />
        </div>
        {(reviews ?? []).length === 0 && <Empty description={t("fit.noReviews")} />}
        {(reviews ?? []).map((r) => (
          <section key={r.id}>
            <h2>{formatDate(r.reviewed_on)} · <FitResultTag result={r.result} /></h2>
            <div className="print-meta">{t("fit.reviewer")}: {users.get(r.created_by_user_id ?? "")?.name ?? "—"} · {t("fit.nextReview")}: {formatDate(r.next_review_on)}</div>
            <div className="print-meta">{t("fit.positionsChecked")}: {r.positions.map((p) => `${p.name} (${t("positions.versionNo", { no: p.version_no })})`).join(", ")}</div>
            {r.note && <div className="print-meta">{t("fit.note")}: {r.note}</div>}
            {r.measure && <div className="print-meta">{t("fit.measure")}: {r.measure}{r.measure_due_on ? ` (${formatDate(r.measure_due_on)})` : ""}{r.measure_status ? ` · ${t(`fit.measureStatus.${r.measure_status}`)}` : ""}</div>}
            <table>
              <thead><tr><th>{t("fit.requirement")}</th><th>{t("fit.rating.title")}</th><th>{t("fit.comment")}</th></tr></thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.text}</td>
                    <td>{t(`fit.rating.${i.rating}`)}</td>
                    <td>{i.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <div style={{ marginTop: 24, fontSize: 11, color: "#555" }}>{t("positions.printedOn", { date: formatDate(new Date().toISOString()) })}</div>
      </div>
    </div>
  );
};
