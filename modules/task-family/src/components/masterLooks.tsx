// Ported 1:1 from COMPASS (app/src/components/masterLooks.tsx).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { useTeams } from "@rbp/core";
import { DEFAULT_ASSET_TYPE_ICON, DEFAULT_GROUPING_ICON, DEFAULT_TASK_TYPE_ICON, IconTile, iconFor } from "@rbp/ui";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { usePalette } from "@rbp/ui";

// Icon and colour of master data (task_types.icon/color, groups.color; asset icons come with assets_overview). The overview views carry only
// the ids; the small master lists are loaded once and looked up here, so no view had to change.

type Look = { icon: string | null; color: string | null; name: string; name_de: string };

// Own small query (not useTaskTypes): that hook lives with the task form, whose editor would land in every list chunk.
const useTaskTypeLooks = () => {
  const { data } = useQuery({
    queryKey: ["task-type-looks"],
    staleTime: 5 * 60_000,
    queryFn: async () => ((await supabaseClient.from("task_types").select("id, name, name_de, icon, color")).data ?? []) as (Look & { id: string })[],
  });
  return useMemo(() => {
    const byId: Record<string, Look> = {};
    for (const x of data ?? []) byId[x.id] = x;
    return byId;
  }, [data]);
};

// The tile of a task type: its icon in its colour (gray until an admin picks one), the name as tooltip.
export const TaskTypeIcon = ({ typeId, size = 32 }: { typeId: string | null | undefined; size?: number }) => {
  const looks = useTaskTypeLooks();
  const look = typeId ? looks[typeId] : undefined;
  return <IconTile icon={iconFor(look?.icon, DEFAULT_TASK_TYPE_ICON)} color={look?.color} size={size} title={look ? localName(look) : undefined} />;
};

// The icon of an asset as the tree shows it: assets_overview.effective_icon (own, else inherited from above, else the
// type's), else the default for a grouping node or an asset. In the text colour:
// assets are told apart by the shape, not by a colour.
export const AssetIcon = ({ icon, grouping, size = 16 }: { icon: string | null | undefined; grouping?: boolean; size?: number }) => {
  const Glyph = iconFor(icon, grouping ? DEFAULT_GROUPING_ICON : DEFAULT_ASSET_TYPE_ICON);
  return (
    <span style={{ display: "inline-flex", verticalAlign: "middle", opacity: 0.8 }}>
      <Glyph size={size} stroke={2} aria-hidden />
    </span>
  );
};

const useTeamColor = () => {
  const { data: groups } = useTeams();
  const { swatch } = usePalette();
  return useMemo(() => {
    const byId: Record<string, string | null> = {};
    for (const g of groups ?? []) byId[g.id] = g.color;
    return (teamId: string | null | undefined) => swatch(teamId ? byId[teamId] : null);
  }, [groups, swatch]);
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

// A person as a round badge in the colour of the team the task belongs to; nobody yet = a dashed circle in that colour.
export const TeamPersonBadge = ({ teamId, personName, teamName }: { teamId: string | null | undefined; personName: string | null | undefined; teamName?: string | null }) => {
  const teamColor = useTeamColor();
  const s = teamColor(teamId);
  const circle = 26;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
      {personName ? (
        <span aria-hidden style={{ width: circle, height: circle, borderRadius: "50%", background: s.dot, color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flex: "none" }}>
          {initials(personName)}
        </span>
      ) : (
        <span aria-hidden style={{ width: circle - 2, height: circle - 2, borderRadius: "50%", border: `1.5px dashed ${s.dot}`, flex: "none" }} />
      )}
      <span style={{ lineHeight: 1.2 }}>
        <span style={{ display: "block" }}>{personName ?? "—"}</span>
        {teamName ? <span style={{ display: "block", fontSize: 11, opacity: 0.7 }}>{teamName}</span> : null}
      </span>
    </span>
  );
};

export const TeamDot = ({ teamId }: { teamId: string | null | undefined }) => {
  const teamColor = useTeamColor();
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: teamColor(teamId).dot, display: "inline-block", flex: "none" }} />;
};
