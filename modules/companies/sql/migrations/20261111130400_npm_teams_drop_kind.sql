-- teams.kind is replaced by the team use owner_associate (20261111130200); every reader moved to owner_associate_teams /
-- team_uses (companies: 20261111130300).
drop index if exists public.teams_kind_idx;
alter table public.teams drop column kind;
