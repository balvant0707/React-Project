// Ported 1:1 from COMPASS (app/src/components/operatingInstruction/sheet.tsx).
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@rbp/module-task-family/src/components/logo.tsx";
import { RichTextView } from "@rbp/module-messaging/src/richText.tsx";
import { SafetySign } from "../../lib/safetySigns";
import { KIND_COLOR, KIND_SECTIONS, instructionNumber, type InstructionKind, type InstructionText, type SignalWord, type VersionStatus } from "../../lib/operatingInstructions";
import { formatDate } from "@rbp/ui";

// One operating instruction as the A4 page (~/maintenance_tool/docs/operating-instructions.md "Printout"): coloured frame by kind, header,
// a bar per section with its pictograms left and right of the text. The same component is the preview on screen and the printout; its
// labels are in the language of the text, not of the UI (a language the UI does not have falls back to English).

export const SHEET_CSS = `
  .oi-sheet { --oi: #005387; background: #fff; color: #000; border: 3mm solid var(--oi); padding: 0; font-size: 10.5pt; line-height: 1.35; font-family: Arial, Helvetica, sans-serif; }
  .oi-sheet * { color: inherit; }
  .oi-head { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; padding: 8px 10px; border-bottom: 2px solid var(--oi); align-items: start; }
  .oi-title { font-size: 20pt; font-weight: 700; letter-spacing: 1px; line-height: 1.1; }
  .oi-basis { font-size: 8.5pt; color: #333 !important; }
  .oi-meta { display: grid; grid-template-columns: max-content 1fr; gap: 1px 10px; font-size: 9pt; margin-top: 6px; }
  .oi-meta dt { color: #444 !important; }
  .oi-meta dd { margin: 0; font-weight: 600; }
  .oi-head-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font-size: 9pt; text-align: right; }
  .oi-number { font-size: 13pt; font-weight: 700; }
  .oi-subject { background: var(--oi); color: #fff !important; text-align: center; padding: 6px 10px; font-weight: 700; font-size: 13pt; }
  .oi-subject * { color: #fff !important; }
  .oi-signal { display: block; font-size: 11pt; letter-spacing: 2px; text-transform: uppercase; }
  .oi-bar { background: var(--oi); color: #fff !important; text-align: center; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; padding: 3px 8px; font-size: 10.5pt; break-after: avoid; }
  .oi-section { break-inside: avoid; }
  .oi-body { display: grid; grid-template-columns: 72px 1fr; gap: 10px; padding: 6px 10px 8px; min-height: 40px; }
  .oi-body.no-signs { grid-template-columns: 1fr; }
  .oi-body.both-sides { grid-template-columns: 72px 1fr 72px; }
  .oi-signs { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .oi-text .rich-text p { margin: 0 0 4px; }
  .oi-text .rich-text ul, .oi-text .rich-text ol { margin: 0 0 4px; padding-left: 18px; }
  .oi-empty { color: #888 !important; font-style: italic; }
  .oi-foot { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; padding: 8px 10px; border-top: 2px solid var(--oi); font-size: 8.5pt; align-items: end; }
  .oi-notvalid { margin: 6px 10px 0; display: inline-block; border: 2px solid #b00; color: #b00 !important; font-weight: 700; padding: 1px 8px; text-transform: uppercase; font-size: 9pt; }
  @media (max-width: 600px) {
    .oi-head { grid-template-columns: 1fr; }
    .oi-head-right { align-items: flex-start; text-align: left; }
    .oi-body { grid-template-columns: 52px 1fr; }
    .oi-body.both-sides { grid-template-columns: 52px 1fr 52px; }
    .oi-foot { grid-template-columns: 1fr; }
  }
`;

export type SheetProps = {
  instructionId: string;
  number: number;
  legacyNumber: string | null;
  kind: InstructionKind;
  versionNo: number;
  status: VersionStatus;
  validFrom: string | null;
  signalWord: SignalWord | null;
  signs: Record<string, string[]>;
  text: InstructionText | undefined;
  language: string;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewDueOn: string | null;
  // Drafts in the editor show their empty sections so nothing is forgotten.
  showEmpty?: boolean;
};

const plain = (html: string | undefined) => (html ?? "").replace(/<[^>]*>/g, "").trim();

export const InstructionSheet = (p: SheetProps) => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT(p.language);
  const color = KIND_COLOR[p.kind];
  const sections = KIND_SECTIONS[p.kind].filter((s) => p.showEmpty || plain(p.text?.sections[s]) || (p.signs[s] ?? []).length);
  const url = `${window.location.origin}/operating-instructions/${p.instructionId}`;
  const date = (d: string | null) => (d ? formatDate(d) : "—");

  return (
    <div className="oi-sheet" style={{ ["--oi" as string]: color }} lang={p.language}>
      <style>{SHEET_CSS}</style>
      <div className="oi-head">
        <div>
          <div className="oi-title">{t("operatingInstructions.sheet.title")}</div>
          <div className="oi-basis">{t(`operatingInstructions.sheet.basis.${p.kind}`)}</div>
          <dl className="oi-meta">
            <dt>{t("operatingInstructions.sheet.workArea")}</dt>
            <dd>{p.text?.work_area || "—"}</dd>
            <dt>{t("operatingInstructions.sheet.activity")}</dt>
            <dd>{p.text?.title || "—"}</dd>
          </dl>
        </div>
        <div className="oi-head-right">
          <Logo height={26} />
          <div className="oi-number">{instructionNumber(p.number)}</div>
          {p.legacyNumber && <div>{t("operatingInstructions.sheet.legacy", { number: p.legacyNumber })}</div>}
          <div>{t("operatingInstructions.sheet.version", { no: p.versionNo, date: date(p.validFrom) })}</div>
        </div>
      </div>
      {p.status !== "published" && <div className="oi-notvalid">{t("operatingInstructions.sheet.notValid", { status: t(`operatingInstructions.status.${p.status}`) })}</div>}
      <div className="oi-bar">{t(`operatingInstructions.sheet.subject.${p.kind}`)}</div>
      <div className="oi-subject">
        {p.text?.subject || "—"}
        {p.kind === "substance" && p.signalWord && <span className="oi-signal">{t(`operatingInstructions.signalWord.${p.signalWord}`)}</span>}
      </div>
      {sections.map((s) => {
        const signs = p.signs[s] ?? [];
        // Half of the signs on the left, the rest on the right: a section with many signs stays short.
        const left = signs.slice(0, Math.ceil(signs.length / 2));
        const right = signs.slice(left.length);
        const column = (codes: string[]) => (
          <div className="oi-signs">
            {codes.map((c) => <SafetySign key={c} code={c} size={56} title={t(`safetySigns.codes.${c}`)} />)}
          </div>
        );
        return (
          <div className="oi-section" key={s}>
            <div className="oi-bar">{t(`operatingInstructions.sections.${s}`)}</div>
            <div className={`oi-body${!signs.length ? " no-signs" : right.length ? " both-sides" : ""}`}>
              {left.length > 0 && column(left)}
              <div className="oi-text">
                {plain(p.text?.sections[s]) ? <RichTextView value={p.text?.sections[s]} /> : <span className="oi-empty">{t("operatingInstructions.sheet.empty")}</span>}
              </div>
              {right.length > 0 && column(right)}
            </div>
          </div>
        );
      })}
      <div className="oi-foot">
        <div>
          <div>{t("operatingInstructions.sheet.approved", { name: p.approvedBy ?? "—", date: date(p.approvedAt) })}</div>
        </div>
        <div>
          <div>{t("operatingInstructions.sheet.nextReview", { date: date(p.reviewDueOn) })}</div>
          <div>{t("operatingInstructions.sheet.current")}</div>
        </div>
        <QRCodeSVG value={url} size={64} />
      </div>
    </div>
  );
};
