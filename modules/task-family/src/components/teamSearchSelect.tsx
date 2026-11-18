// Ported 1:1 from COMPASS (app/src/components/teamSearchSelect.tsx).
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { RemoteSelect, type RemoteOption } from "@rbp/ui";

export type TeamUse = "tasks" | "filters";

const LIMIT = 20;
// A search term is text, not a pattern.
const likeTerm = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

// Server-side team search for the pickers and filters (teams made by people can be many; no picker loads them all).
// Without a term the teams the person belongs to are offered, with a term every team switched on for this use is searched.
export const searchTeams = (use: TeamUse) => async (term: string): Promise<RemoteOption[]> => {
  const typed = term.trim();
  if (!typed) {
    const { data: session } = await supabaseClient.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return [];
    const { data } = await supabaseClient
      .from("user_teams")
      // Platform: a team's uses are rows of team_uses (COMPASS: the flags groups.usable_for_*).
      .select("teams!inner(id, name, team_uses!inner(use))")
      .eq("user_id", me)
      .eq("teams.team_uses.use", use)
      .limit(100);
    return ((data ?? []) as unknown as { teams: { id: string; name: string } }[])
      .map((r) => ({ value: r.teams.id, label: r.teams.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, LIMIT);
  }
  const { data } = await supabaseClient.from("teams").select("id, name, team_uses!inner(use)").eq("team_uses.use", use).ilike("name", `%${likeTerm(typed)}%`).order("name").limit(LIMIT);
  return (data ?? []).map((g) => ({ value: g.id as string, label: g.name as string }));
};

// Names of teams already chosen (a saved value, the URL), whatever their switches say.
export const loadTeamLabels = async (ids: string[]): Promise<RemoteOption[]> => {
  if (!ids.length) return [];
  const { data } = await supabaseClient.from("teams").select("id, name").in("id", ids);
  return (data ?? []).map((g) => ({ value: g.id as string, label: g.name as string }));
};

// A team picker that searches on the server as you type (RemoteSelect); works as a Form.Item child and as a controlled input.
export const TeamSearchSelect = (props: {
  use: TeamUse;
  value?: string;
  onChange?: (value: string | undefined) => void;
  allowClear?: boolean;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}) => {
  const { t } = useTranslation();
  const { use, placeholder, ...rest } = props;
  return <RemoteSelect minChars={0} loadOptions={searchTeams(use)} loadLabels={loadTeamLabels} placeholder={placeholder ?? t("teams.searchPlaceholder")} {...rest} />;
};
