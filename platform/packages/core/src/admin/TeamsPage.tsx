// Admin > Teams, after COMPASS pages/admin/groups/list.tsx: the list of teams; a row opens the shared team dialog
// (teams/TeamDialog.tsx: members, settings, owners, the uses modules register, delete). A use with a managed_path is a fixed tag linking to its module page.
import { useState } from "react";
import { Button, Input, Table, Tag, Tooltip } from "antd";
import { Link } from "react-router-dom";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ListTable } from "@rbp/ui";
import { supabaseClient } from "../supabase";
import { useTeams, useUsers } from "../directory";
import { TeamDialog } from "../teams/TeamDialog";

type Team = { id: string; name: string; description: string | null; color: string | null };

export const TeamsPage = () => {
  const { t } = useTranslation();
  const { data: users } = useUsers();
  const { data: directory } = useTeams();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [search, setSearch] = useState("");

  const { data: teams, isLoading } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: async () => ((await supabaseClient.from("teams").select("id, name, description, color").order("name")).data ?? []) as Team[],
  });
  const { data: owners } = useQuery({
    queryKey: ["admin-team-owners"],
    queryFn: async () => ((await supabaseClient.from("team_owners").select("team_id, user_id")).data ?? []) as { team_id: string; user_id: string }[],
  });
  const { data: useRegistry } = useQuery({
    queryKey: ["team-use-registry"],
    queryFn: async () => ((await supabaseClient.from("team_use_registry").select("use, description, managed_path").order("use")).data ?? []) as { use: string; description: string | null; managed_path: string | null }[],
  });
  const labelOfUse = (u: { use: string; description: string | null }) => t(`admin.teamUse.${u.use}`, { defaultValue: u.description ?? u.use });
  const usesOf = (teamId: string) => directory?.find((d) => d.id === teamId)?.uses ?? [];
  // Short label in the list, the registry's full sentence as tooltip.
  const TeamUseTags = ({ teamId }: { teamId: string }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 0", minWidth: 220, maxWidth: 380 }}>{(useRegistry ?? []).filter((u) => usesOf(teamId).includes(u.use)).map((u) => {
      const tag = <Tag color={u.managed_path ? "blue" : undefined} style={{ marginInlineEnd: 4 }}>{labelOfUse(u)}</Tag>;
      return (
        <Tooltip key={u.use} title={u.description}>
          {u.managed_path ? <Link to={u.managed_path} onClick={(e) => e.stopPropagation()}>{tag}</Link> : tag}
        </Tooltip>
      );
    })}</div>
  );

  const needle = search.trim().toLowerCase();
  const shown = needle ? (teams ?? []).filter((r) => r.name.toLowerCase().includes(needle)) : teams;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <Input allowClear prefix={<SearchOutlined />} placeholder={t("common.searchByName")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>{t("admin.newTeam")}</Button>
      </div>
      <ListTable<Team> dataSource={shown} loading={isLoading} rowKey="id" pagination={false} onRow={(r) => ({ onClick: () => setEditing(r.id), style: { cursor: "pointer" } })}>
        <Table.Column dataIndex="name" title={t("fields.name")} render={(v: string) => <b>{v}</b>} />
        <Table.Column dataIndex="description" title={t("admin.description")} render={(v) => v ?? "—"} />
        <Table.Column title={t("admin.owners")} render={(_, r: Team) => (owners ?? []).filter((o) => o.team_id === r.id).map((o) => users?.find((u) => u.id === o.user_id)?.name ?? "?").join(", ") || "—"} />
        {(useRegistry ?? []).length > 0 && <Table.Column title={t("admin.teamUses")} render={(_, r: Team) => <TeamUseTags teamId={r.id} />} />}
      </ListTable>
      <TeamDialog teamId={editing} tab="settings" onClose={() => setEditing(null)} />
    </>
  );
};
