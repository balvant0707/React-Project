// Ported 1:1 from COMPASS (app/src/components/operatingInstruction/publishedSheet.tsx).
import { Empty, Select, Spin } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InstructionSheet } from "./sheet";
import { useUserMap } from "@rbp/core";
import { useInstruction, useInstructionTexts, useInstructionVersions } from "../../hooks/useOperatingInstructions";
import { textFor, languageName } from "../../lib/operatingInstructions";

// The published version of an instruction as the A4 page in a paper frame, in the reader's language when there is a
// translation (German otherwise), with a language switch. Used next to the list "Mine".
export const PublishedSheet = ({ instructionId }: { instructionId: string }) => {
  const { t, i18n } = useTranslation();
  const users = useUserMap();
  const uiLanguage = i18n.resolvedLanguage ?? "de";
  const { data: row, isLoading } = useInstruction(instructionId);
  const { data: versions } = useInstructionVersions(instructionId);
  const version = (versions ?? []).find((v) => v.status === "published");
  const { data: texts } = useInstructionTexts(version?.id);
  const [picked, setPicked] = useState<string | null>(null);
  const language = picked && (texts ?? []).some((x) => x.language === picked) ? picked : (texts ?? []).some((x) => x.language === uiLanguage) ? uiLanguage : "de";
  const text = textFor(texts, language);

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin /></div>;
  if (!row || !version) return <Empty description={t("operatingInstructions.noVersion")} />;
  return (
    <div>
      {(texts ?? []).length > 1 && (
        <Select
          value={text?.language}
          style={{ minWidth: 160, marginBottom: 8 }}
          onChange={setPicked}
          options={(texts ?? []).map((x) => ({ value: x.language, label: languageName(x.language, uiLanguage) }))}
        />
      )}
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
    </div>
  );
};
