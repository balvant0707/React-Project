// Ported 1:1 from COMPASS (app/src/modules/absences/ruleAlert.tsx).
import { Alert } from "antd";
import { useTranslation } from "react-i18next";
import { formatDays, type RuleViolationDay } from "./leave";
import { formatDate } from "@rbp/ui";

// The days on which a period would break the absence rule, one line per team. A warning, never a block.
export const LeaveRuleAlert = ({ rows, own, approved }: { rows: RuleViolationDay[] | undefined; own?: boolean; approved?: boolean }) => {
  const { t } = useTranslation();
  if (!rows?.length) return null;
  const teams = new Map<string, RuleViolationDay[]>();
  for (const r of rows) teams.set(r.team_name, [...(teams.get(r.team_name) ?? []), r]);
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      message={t(approved ? "leave.rule.titleApproved" : own ? "leave.rule.titleOwn" : "leave.rule.title")}
      description={
        <div>
          {[...teams.entries()].map(([team, days]) => (
            <div key={team}>
              <strong>{team}</strong>: {days.slice(0, 6).map((d) => formatDate(d.day)).join(", ")}
              {days.length > 6 ? ` … (+${days.length - 6})` : ""} – {t("leave.rule.detail", { away: formatDays(Math.max(...days.map((d) => d.away))), size: days[0].team_size, allowed: days[0].allowed })}
            </div>
          ))}
          {!approved && <div style={{ marginTop: 4 }}>{t(own ? "leave.rule.hintOwn" : "leave.rule.hint")}</div>}
        </div>
      }
    />
  );
};
