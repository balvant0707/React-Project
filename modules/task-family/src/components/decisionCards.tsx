// Ported 1:1 from COMPASS (app/src/components/decisionCards.tsx).
import { useTranslation } from "react-i18next";
import type { DecisionRow } from "../hooks/useDecisions";
import { purposeUi } from "../modules/purposes";
import { formatDate } from "@rbp/ui";

// The body of a decision card on the page "To decide". Any task shows the generic card; a task type with a special
// function (task_types.purpose) shows the card of its register entry (modules/purposes.tsx).
const GenericCard = ({ row }: { row: DecisionRow }) => {
  const { t } = useTranslation();
  return (
    <>
      <div>
        {t("decisions.requestedBy", { name: row.created_by_name ?? "—" })}
        {row.asset_name ? ` · ${row.asset_name}` : ""}
        {row.due_date ? ` · ${t("fields.dueDate")}: ${formatDate(row.due_date)}` : ""}
      </div>
    </>
  );
};

export const DecisionCardBody = ({ row }: { row: DecisionRow }) => {
  const Card = purposeUi(row.purpose).DecisionCard;
  return Card ? <Card row={row} fallback={<GenericCard row={row} />} /> : <GenericCard row={row} />;
};
