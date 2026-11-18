// Copied from COMPASS app/src/lib/masterData.ts. Changes: the platform's i18next instance; localName also reads the platform
// roles' `translations` (they have no `name_de`).
import i18n from "i18next";
import type { TFunction } from "i18next";

// Task types, route steps and roles carry two names: `name` (English) and `name_de` (German), both edited by an admin.
// The one matching the user's language is shown. Views expose the pair as `<thing>_name` / `<thing>_name_de`.
type Named = { name: string; name_de: string };

const german = () => (i18n.resolvedLanguage ?? i18n.language ?? "").startsWith("de");

/** Picks the name for the current language; when that one is empty, the other language's name is shown. */
export const pickName = (name: string | null | undefined, nameDe: string | null | undefined) => {
  const [first, second] = german() ? [nameDe, name] : [name, nameDe];
  return first?.trim() || second?.trim() || "";
};

/** Name of a row that has `name` / `name_de`; an empty string for no row. */
export const localName = (row: (Partial<Named> & { translations?: Record<string, string> | null }) | null | undefined) =>
  pickName(row?.name, row?.name_de ?? row?.translations?.de);

// A task type's short description: the built-in English text of a standard type shows in the user's language.
export const taskTypeShortDescription = (t: TFunction, type: { key: string; short_description: string | null }) => {
  const key = `masterData.taskTypeDescriptions.${type.key}`;
  return type.short_description && type.short_description === t(key, { lng: "en", defaultValue: "" }) ? t(key) : type.short_description;
};

/** Copy of the rows sorted by their name in the current language (for pick lists). */
export const sortByName = <T extends Partial<Named>>(rows: readonly T[] | null | undefined): T[] =>
  [...(rows ?? [])].sort((a, b) => localName(a).localeCompare(localName(b), german() ? "de" : "en", { sensitivity: "base" }));

