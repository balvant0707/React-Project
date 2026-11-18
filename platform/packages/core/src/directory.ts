// Reference lists every module needs (people, teams, roles) and the signed-in user's rights. Taken over from the COMPASS
// hooks (useDirectory, usePermissions, useMe); groups became teams, the team uses come from team_uses.
import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from './supabase';
import { useIdentity } from './hooks';

export type UserRow = { id: string; name: string | null; email: string | null; photo_url?: string | null; locked_at?: string | null };
export const userLabel = (user?: Pick<UserRow, 'name' | 'email'> | null) => user?.name ?? user?.email ?? '';

export type TeamRow = { id: string; name: string; color: string | null; uses: string[] };
type RoleRow = { id: string; name: string; translations: Record<string, string> | null };

/** People offered in a picker: everybody but the locked. `keep` = the value(s) already chosen, so an existing assignment stays visible. */
export const usersFor = <T extends { id: string; locked_at?: string | null }>(users: T[] | undefined, keep?: string | string[] | null) => {
  const kept = new Set(Array.isArray(keep) ? keep : keep ? [keep] : []);
  return (users ?? []).filter((u) => !u.locked_at || kept.has(u.id));
};

/** Teams offered in a picker for the given use (all of them still resolve names via useTeams). */
export const teamsFor = (teams: TeamRow[] | undefined, use: string, keep?: string | null) =>
  (teams ?? []).filter((t) => t.uses.includes(use) || t.id === keep);

const staleTime = 5 * 60_000;

/** People who can sign in (assignees, owners). People without a login are not offered; see useUserMap for everybody. */
export function useUsers() {
  return useQuery({
    queryKey: ['directory', 'users'], staleTime,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('users').select('id, name, email, locked_at').eq('has_login', true).order('name');
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['directory', 'teams'], staleTime,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('teams').select('id, name, color, team_uses(use)').order('name');
      if (error) throw error;
      return (data ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color, uses: ((t.team_uses ?? []) as { use: string }[]).map((u) => u.use) })) as TeamRow[];
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['directory', 'roles'], staleTime,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('roles').select('id, name, translations').order('name');
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ['directory', 'team-members'], staleTime,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('user_teams').select('user_id, team_id');
      if (error) throw error;
      return (data ?? []) as { user_id: string; team_id: string }[];
    },
  });
}

/** Names (and photo paths) of everybody, also people without a login or whose account was removed (they stay on old records). */
export function useUserMap() {
  const { data } = useQuery({
    queryKey: ['directory', 'users-all'], staleTime,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('users').select('id, name, email, photo_url').order('name');
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });
  return new Map((data ?? []).map((u) => [u.id, u]));
}

/** The signed-in user's permission literals (with the implied ones). The admin holds none by itself: content comes from roles. */
export function usePermissions() {
  const { data } = useQuery({
    queryKey: ['my-permissions'], staleTime: 60_000,
    queryFn: async () => {
      const [{ data: admin }, { data: held }] = await Promise.all([supabaseClient.rpc('is_admin'), supabaseClient.rpc('my_permissions')]);
      return { admin: admin === true, held: (held ?? []) as string[] };
    },
  });
  const has = (literal: string) => !!data && data.held.includes(literal);
  /** Any literal starting with this prefix, e.g. 'tasks.create.'. */
  const hasAny = (prefix: string) => !!data && data.held.some((k) => k.startsWith(prefix));
  return { has, hasAny, admin: !!data?.admin, ready: !!data };
}

/** The administration a role can be given; the admin always has it. */
export function useAdminDelegation() {
  const { has, admin } = usePermissions();
  return { canManageUsers: admin || has('users.manage'), canManageTeams: admin || has('teams.manage') };
}

/** The signed-in user's team ids. */
export function useMyTeamIds() {
  const { identity } = useIdentity();
  const { data } = useQuery({
    queryKey: ['my-teams', identity?.id], enabled: !!identity?.id, staleTime,
    queryFn: async () => {
      const { data: rows } = await supabaseClient.from('user_teams').select('team_id').eq('user_id', identity!.id);
      return (rows ?? []).map((r) => r.team_id as string);
    },
  });
  return data ?? [];
}
/** The signed-in user's id and team ids. From COMPASS's useMe (app/src/hooks/useMe.ts, until 2026-11-12 a copy in
 * task-family); changed: built on useIdentity and useMyTeamIds, and without COMPASS's role ids, deputies and the flags taken
 * from role names (isAdmin, isHr) - nothing read them but the people page, which asks for the permission people.edit. */
export function useMe() {
  const { identity } = useIdentity();
  return { userId: identity?.id, teamIds: useMyTeamIds() };
}
export type EntityType = string;
