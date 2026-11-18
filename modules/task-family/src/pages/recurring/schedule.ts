// Ported 1:1 from COMPASS (app/src/pages/recurring/schedule.ts).
import type { TFunction } from "i18next";
import type { RuleRow } from "./ruleForm";

// "every 3 months", "yearly", "every 500 operating hours" in the active language.
export const scheduleLabel = (t: TFunction, r: Pick<RuleRow, "schedule_kind" | "interval_count" | "operating_hours_interval">) =>
  r.schedule_kind === "operating_hours"
    ? t("recurring.everyHoursLabel", { count: Number(r.operating_hours_interval ?? 0) })
    : t(`recurring.everyLabel.${r.schedule_kind}`, { count: r.interval_count });
