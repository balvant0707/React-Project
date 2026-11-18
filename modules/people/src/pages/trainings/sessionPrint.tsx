// Ported 1:1 from COMPASS (app/src/pages/trainings/sessionPrint.tsx).
import { Link, useParams } from "react-router-dom";
import { Button, Empty, Spin } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Logo } from "@rbp/module-task-family/src/components/logo.tsx";
import { RichTextView } from "@rbp/module-messaging/src/richText.tsx";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useTrainingSession, useTrainingSessionParticipants, useTrainingTypes } from "../../hooks/useTrainings";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { formatDate } from "@rbp/ui";
import { PRINT_BASE_CSS } from "../../components/printSheet";
import { useInstructions, useTrainingTypeInstructions } from "../../hooks/useOperatingInstructions";
import { instructionNumber } from "../../lib/operatingInstructions";

// Blank lines for people who join on the day.
const SPARE_ROWS = 3;

// Attendance sheet of a training session for printing from the browser (outside the app layout, like the job
// description print): what the training covers, then every person with a field to sign the confirmation. A planned
// session lists everybody invited, a confirmed one the people who attended. The signed sheet is scanned and added to the
// session as proof.
export const TrainingSessionPrint = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const { data: session, isLoading } = useTrainingSession(id);
  const { data: participants } = useTrainingSessionParticipants(id);
  const { data: types } = useTrainingTypes();
  const { data: people } = usePeople();
  const { data: instructions } = useInstructions();
  const { data: links } = useTrainingTypeInstructions();
  // The operating instructions a type teaches, in their published version (~/maintenance_tool/docs/operating-instructions.md).
  const taughtBy = (typeId: string) =>
    (links ?? [])
      .filter((l) => l.training_type_id === typeId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => (instructions ?? []).find((x) => x.id === l.instruction_id))
      .filter((x) => !!x && x.active && x.published_version_no);

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;
  if (!session) return <Empty description={t("common.notFound")} />;

  const sessionTypes = session.training_type_ids.map((tid) => (types ?? []).find((x) => x.id === tid)).filter((x) => !!x);
  const names = (participants ?? [])
    .filter((p) => session.status === "planned" || p.attended)
    .map((p) => { const person = (people ?? []).find((x) => x.id === p.user_id); return person ? personName(person) : "—"; })
    .sort((a, b) => a.localeCompare(b));
  const rows = [...names, ...Array<string>(SPARE_ROWS).fill("")];

  const meta: [string, string | null][] = [
    [t("trainings.sessions.heldOn"), formatDate(session.held_on)],
    [t("trainings.trainer"), session.trainer],
    [t("trainings.sessions.location"), session.location],
    [t("trainings.sessions.types"), session.type_names || null],
  ];

  return (
    <div className="print-page">
      <style>{`${PRINT_BASE_CSS}
        .print-sheet h2 { font-size: 15px; margin: 18px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; break-after: avoid; color: #000; }
        .print-sheet h3 { font-size: 13px; margin: 10px 0 2px; color: #000; break-after: avoid; }
        .print-sheet .rich-text, .print-sheet .rich-text * { color: #000 !important; }
        .print-meta { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; margin: 12px 0 8px; font-size: 13px; }
        .print-meta dt { color: #555; }
        .print-meta dd { margin: 0; }
        .print-statement { border: 1px solid #000; padding: 8px 12px; margin: 16px 0 8px; font-size: 13px; break-inside: avoid; }
        .print-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .print-table th, .print-table td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
        .print-table th { background: #f0f0f0; }
        .print-table td { height: 30px; }
        .print-table tr { break-inside: avoid; }
        .print-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 40px; break-inside: avoid; }
        .print-signatures div { border-top: 1px solid #000; padding-top: 4px; font-size: 12px; }
        .print-footer { margin-top: 24px; font-size: 11px; color: #555; }
        @media print {
          .print-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="print-toolbar no-print">
        <Link to={`/trainings/sessions/${session.id}`}>{t("trainings.sessions.backToSession")}</Link>
        <span style={{ flex: 1 }} />
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>{t("common.print")}</Button>
      </div>

      <div className="print-sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>{t("trainings.sessions.sheetKicker")}</div>
            <h1>{t("trainings.sessions.sheetTitle")}</h1>
          </div>
          <Logo height={30} />
        </div>
        <dl className="print-meta">
          {meta.filter(([, value]) => !!value).map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>

        <h2>{t("trainings.content")}</h2>
        {sessionTypes.map((x) => (
          <div key={x.id}>
            <h3>{x.name}</h3>
            {x.content ? <RichTextView value={x.content} /> : x.description ? <p>{x.description}</p> : null}
            {taughtBy(x.id).length > 0 && (
              <>
                <p style={{ marginBottom: 2 }}><strong>{t("trainings.sessions.instructions")}</strong></p>
                <ul>
                  {taughtBy(x.id).map((oi) => (
                    <li key={oi!.id}>{instructionNumber(oi!.number)} {oi!.title} ({t("operatingInstructions.versionNo", { no: oi!.published_version_no })}{oi!.valid_from ? `, ${t("operatingInstructions.validFromDate", { date: formatDate(oi!.valid_from) })}` : ""})</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
        {session.extra_content && (
          <div>
            <h3>{t("trainings.sessions.extraContent")}</h3>
            <RichTextView value={session.extra_content} />
          </div>
        )}

        <h2>{t("trainings.sessions.participantsHeading")}</h2>
        <div className="print-statement">{t("trainings.sessions.statement")}</div>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th style={{ width: "40%" }}>{t("fields.name")}</th>
              <th>{t("trainings.sessions.signature")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((name, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{name}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-signatures">
          <div>{t("trainings.sessions.signatureTrainer")}</div>
          <div>{t("trainings.sessions.signaturePlaceDate")}</div>
        </div>
        <div className="print-footer">{t("positions.printedOn", { date: formatDate(new Date().toISOString()) })}</div>
      </div>
    </div>
  );
};
