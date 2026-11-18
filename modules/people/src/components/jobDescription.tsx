// Ported 1:1 from COMPASS (app/src/components/jobDescription.tsx).
import { Typography } from "antd";
import { useTranslation } from "react-i18next";
import { REQUIREMENTS_AFTER, SECTIONS, type JobDescriptionVersion } from "../lib/positions";
import { RequirementsView } from "./requirementsList";
import { RichTextView } from "@rbp/module-messaging/src/richText.tsx";
import { useVersionRequirements } from "../hooks/useFitReviews";

// A job description as a document: the sections in order, empty ones left out.
// The requirements are a list (own table), shown after the authority section.
export const JobDescriptionDocument = ({ version }: { version: Pick<JobDescriptionVersion, "id" | (typeof SECTIONS)[number]> }) => {
  const { t } = useTranslation();
  const { data: requirements } = useVersionRequirements(version.id);
  const requirementsBlock = (requirements ?? []).length > 0 && (
    <section key="requirements" style={{ marginBottom: 20 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>{t("positions.sections.requirements")}</Typography.Title>
      <RequirementsView versionId={version.id} />
    </section>
  );
  return (
    <div>
      {SECTIONS.flatMap((s) => [
        ...(version[s]?.trim()
          ? [
              <section key={s} style={{ marginBottom: 20 }}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>{t(`positions.sections.${s}`)}</Typography.Title>
                <RichTextView value={version[s]} />
              </section>,
            ]
          : []),
        ...(s === REQUIREMENTS_AFTER && requirementsBlock ? [requirementsBlock] : []),
      ])}
    </div>
  );
};
