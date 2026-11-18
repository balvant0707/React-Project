import { userLabel, type UserRow } from "@rbp/core";

// Mentions are stored as "@[user:<uuid>]" tokens inside the comment text (the database parses the same token into
// message_mentions); a team mention is "@[team:<uuid>]" and reaches every member of the conversation's team
// (~/maintenance_tool/docs/messaging.md "Team mentions"). The editor works with readable "@Name" text instead.

export const MENTION_TOKEN = /@\[(user|team):([0-9a-fA-F-]{36})\]/g;

type MentionKind = "user" | "team";
export type MentionCandidate = { id: string; name: string; kind?: MentionKind };

// Editor text -> stored text. Longest names first so "@Anna Weber" is not cut short by "@Anna".
export function toStoredBody(display: string, candidates: MentionCandidate[]): string {
  let out = display;
  const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}(?![\\p{L}\\p{N}])`, "gu"), `@[${c.kind ?? "user"}:${c.id}]`);
  }
  return out;
}

// The core's userLabel (name, else email), "?" when a user has neither.
export const userDisplayName = (u: Pick<UserRow, "name" | "email">) => userLabel(u) || "?";

// Stored text -> editor text, plus the candidates so re-saving converts back. groupName resolves team mentions.
export function toDisplayBody(
  stored: string,
  users: Map<string, UserRow>,
  groupName: (id: string) => string | undefined = () => undefined,
): { text: string; candidates: MentionCandidate[] } {
  const candidates = new Map<string, MentionCandidate>();
  const text = stored.replace(MENTION_TOKEN, (_, kind: MentionKind, id: string) => {
    const user = kind === "user" ? users.get(id) : undefined;
    const name = kind === "team" ? groupName(id) ?? "?" : user ? userDisplayName(user) : "?";
    candidates.set(`${kind}:${id}`, { id, name, kind });
    return `@${name}`;
  });
  return { text, candidates: [...candidates.values()] };
}

type BodyPart = { type: "text"; value: string } | { type: "mention"; userId: string; kind: MentionKind };

export function splitBody(stored: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let last = 0;
  for (const m of stored.matchAll(MENTION_TOKEN)) {
    if (m.index! > last) parts.push({ type: "text", value: stored.slice(last, m.index) });
    parts.push({ type: "mention", userId: m[2], kind: m[1] as MentionKind });
    last = m.index! + m[0].length;
  }
  if (last < stored.length) parts.push({ type: "text", value: stored.slice(last) });
  return parts;
}

// Stored text after an edit: the mentions the message had, people newly typed as "@Name" and, if the writer may
// mention it, the conversation's team. The database refuses a team mention it does not allow.
export function editedBody(
  original: string,
  text: string,
  users: Map<string, UserRow>,
  groupName: (id: string) => string | undefined,
  team: { team_id: string; name: string } | null | undefined,
): string {
  const { candidates } = toDisplayBody(original, users, groupName);
  const people = [...users.values()].filter((u) => text.includes(`@${userDisplayName(u)}`)).map((u) => ({ id: u.id, name: userDisplayName(u), kind: "user" as const }));
  const teams = team && text.includes(`@${team.name}`) ? [{ id: team.team_id, name: team.name, kind: "team" as const }] : [];
  return toStoredBody(text.trim(), [...candidates, ...people, ...teams]);
}
