import dayjs from "dayjs";

// Directory row: what `users` offers every signed-in user (~/maintenance_tool/docs/people.md). The birth year is not part of it.
export type PersonRow = {
  id: string;
  name: string | null;
  email: string | null;
  position: string | null;
  photo_url: string | null;
  phone_office: string | null;
  phone_mobile: string | null;
  hire_date: string | null;
  has_left: boolean;
  site: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  // The person hid their birthday (profile): day and month are then empty, HR still reads the date in person_private.
  birthday_hidden: boolean;
  supervisor_user_id: string | null;
  deputy_user_id: string | null;
  has_login: boolean;
  // Sign-in (~/maintenance_tool/docs/username-login.md): the username, how the person signs in, and since when they are locked out.
  username: string;
  sign_in_method: "password" | "sso";
  locked_at: string | null;
};

export const PERSON_COLUMNS =
  "id, name, email, position, photo_url, phone_office, phone_mobile, hire_date, has_left, site, birthday_month, birthday_day, birthday_hidden, supervisor_user_id, deputy_user_id, has_login, username, sign_in_method, locked_at";

// Left the company on or before today. HR sets the exit date, which is private; everybody sees only this flag.
export const hasLeft = (p: Pick<PersonRow, "has_left">) => p.has_left;

export const personName = (p?: Pick<PersonRow, "name" | "email"> | null) => p?.name ?? p?.email ?? "";

// One copy for both apps: the core avatar's initials.
export { initials } from "@rbp/core";

// tel: links want digits and a leading plus only.
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

// "12 March" / "March 12": day and month only, localized. 2000 is a leap year, so 29 February formats.
export const formatBirthday = (month: number, day: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(2000, month - 1, day));

export const yearsSince = (date: string, today = dayjs()) => today.diff(dayjs(date), "year");

type CelebrationKind = "birthday" | "anniversary";
type Celebration = { person: PersonRow; kind: CelebrationKind; day: number; years?: number };

// Birthdays and company anniversaries (whole years, at least one) of the given month, ordered by day.
export const monthCelebrations = (people: PersonRow[], month: number, today = dayjs()): Celebration[] => {
  const out: Celebration[] = [];
  for (const person of people) {
    if (person.birthday_month === month && person.birthday_day) out.push({ person, kind: "birthday", day: person.birthday_day });
    if (person.hire_date && dayjs(person.hire_date).month() + 1 === month) {
      const years = today.year() - dayjs(person.hire_date).year();
      if (years >= 1) out.push({ person, kind: "anniversary", day: dayjs(person.hire_date).date(), years });
    }
  }
  return out.sort((a, b) => a.day - b.day || personName(a.person).localeCompare(personName(b.person)));
};

export type PersonNode = PersonRow & { children: PersonNode[] };

// Reporting lines from supervisor_user_id. Roots = people without a supervisor who have reports; people with
// neither supervisor nor reports are returned separately ("not in the hierarchy").
export const buildPeopleTree = (people: PersonRow[]): { roots: PersonNode[]; detached: PersonRow[] } => {
  const byId = new Map<string, PersonNode>(people.map((p) => [p.id, { ...p, children: [] }]));
  const roots: PersonNode[] = [];
  const detached: PersonRow[] = [];
  for (const node of byId.values()) {
    const parent = node.supervisor_user_id ? byId.get(node.supervisor_user_id) : undefined;
    if (parent) parent.children.push(node);
  }
  const sortByName = (a: PersonNode, b: PersonNode) => personName(a).localeCompare(personName(b));
  for (const node of byId.values()) {
    node.children.sort(sortByName);
    if (node.supervisor_user_id && byId.has(node.supervisor_user_id)) continue;
    if (node.children.length) roots.push(node);
    else detached.push(node);
  }
  roots.sort(sortByName);
  detached.sort((a, b) => personName(a).localeCompare(personName(b)));
  return { roots, detached };
};

// The person and everybody below them in the reporting lines (supervisor_user_id), at any depth.
export const withSubordinates = (people: PersonRow[], rootId: string): Set<string> => {
  const reports = new Map<string, string[]>();
  for (const p of people) if (p.supervisor_user_id) reports.set(p.supervisor_user_id, [...(reports.get(p.supervisor_user_id) ?? []), p.id]);
  const out = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) for (const id of reports.get(queue.pop()!) ?? []) if (!out.has(id)) { out.add(id); queue.push(id); }
  return out;
};
