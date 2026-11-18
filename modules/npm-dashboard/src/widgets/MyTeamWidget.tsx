// Ported 1:1 from the NPM tool (app/src/widgets/MyTeamWidget.tsx).
import { useEffect, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { Avatar, Tooltip, Typography } from "antd";
import { supabaseClient } from "@rbp/core";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { WidgetCard } from "./WidgetCard";

// Everyone who shares at least one group (team) with me, as an avatar row
// with names on hover. Same notion of "team" the permission scope `team` uses.
export const MyTeamWidget = () => {
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<string[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]);

  useEffect(() => {
    if (!identity?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: mine } = await supabaseClient.from("user_teams").select("team_id, groups:teams(name)").eq("user_id", identity.id);
      const groupIds = (mine ?? []).map((g: any) => g.team_id as string);
      let memberIds: string[] = [];
      if (groupIds.length > 0) {
        const { data: others } = await supabaseClient.from("user_teams").select("user_id").in("team_id", groupIds);
        memberIds = [...new Set((others ?? []).map((m: any) => m.user_id as string))].filter((id) => id !== identity.id);
      }
      const users = await loadUserOptions();
      if (cancelled) return;
      const nameById = new Map(users.map((u) => [u.value, u.label]));
      setMembers(memberIds.map((id) => nameById.get(id) ?? "Unknown").sort((a, b) => a.localeCompare(b)));
      setTeamNames((mine ?? []).map((g: any) => g.groups?.name).filter(Boolean));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [identity?.id]);

  const initials = (name: string) =>
    name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <WidgetCard
      title={teamNames.length > 0 ? `My team - ${teamNames.join(", ")}` : "My team"}
      loading={loading}
      empty={!loading && members.length === 0}
      emptyText="You are not in a team yet"
    >
      <Avatar.Group max={{ count: 10 }} size={36}>
        {members.map((name) => (
          <Tooltip key={name} title={name}>
            <Avatar style={{ background: "#4560DC" }}>{initials(name)}</Avatar>
          </Tooltip>
        ))}
      </Avatar.Group>
      <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
        {members.length} colleague{members.length === 1 ? "" : "s"}
      </Typography.Text>
    </WidgetCard>
  );
};
