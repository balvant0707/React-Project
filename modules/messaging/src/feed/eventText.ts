import type { TFunction } from "i18next";
import { formatDate, formatDateTime } from "@rbp/ui";

// Lookups used to turn ids inside event metadata into names.
export type FeedContext = {
  userName: (id: string | null | undefined) => string;
  teamName: (id: string | null | undefined) => string;
  /** Names a module looks up for its events (registerFeedNames in useFeedContext.ts), e.g. ('assets', id); the id itself or "—" when unknown. */
  name: (kind: string, id: string | null | undefined) => string;
};

type Meta = Record<string, any>;
// `actor` is the display name or "System"; `author` the author's name or null (no author, e.g. a public QR report).
export type EventSentence = (t: TFunction, meta: Meta, actor: string, ctx: FeedContext, author: string | null) => string;

// System events store only event_type + metadata + author; the sentence is built here. The generic `field_changed` event
// (log_field_changes in the database) is handled by the platform; a module that writes its own event types registers the
// sentence builder for them (registerEventSentence) and may name its fields (registerFieldLabels).
const sentences = new Map<string, EventSentence>();
export const registerEventSentence = (eventType: string, build: EventSentence) => void sentences.set(eventType, build);

const fieldLabels = new Map<string, (field: string) => string | undefined>();
export const registerFieldLabels = (entityType: string, label: (field: string) => string | undefined) => void fieldLabels.set(entityType, label);

// One module's frontend field labels per record type ({ vessels: { imo: "IMO" } }): registers them for the history lines
// (registerFieldLabels) and returns the labels with their typed lookup, which falls back to the raw field name (a label typo'd
// or not yet added then degrades to something legible instead of crashing). From NPM's fieldLabels.ts.
export function defineFieldLabels<const T extends Record<string, Record<string, string>>>(labels: T) {
  for (const [entityType, fields] of Object.entries(labels)) registerFieldLabels(entityType, (field) => fields[field]);
  const fieldLabel = <R extends keyof T>(resource: R, field: keyof T[R] & string): string => (labels[resource] as Record<string, string>)[field] ?? field;
  return { FIELD_LABELS: labels, fieldLabel };
}

const humanize = (field: string) => field.replace(/_id$/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// timestamptz as jsonb text ("2026-11-05T14:22:31.123+00:00") and plain dates ("2026-11-05").
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const valueText = (t: TFunction, value: unknown, label: unknown) => {
  if (typeof label === "string" && label) return label;
  if (value === null || value === undefined || value === "") return t("feed.empty");
  if (value === true || value === "true") return t("common.yes");
  if (value === false || value === "false") return t("common.no");
  if (typeof value === "string" && INSTANT.test(value)) return formatDateTime(value);
  if (typeof value === "string" && DATE_ONLY.test(value)) return formatDate(value);
  return String(value);
};

export function eventSentence(t: TFunction, eventType: string, meta: Meta, actor: string | null, ctx: FeedContext, entityType = ""): string {
  const who = actor ?? t("feed.system");
  if (eventType === "field_changed") {
    const name = fieldLabels.get(entityType)?.(meta.field) ?? humanize(String(meta.field ?? ""));
    return t("feed.events.field_changed", {
      actor: who, field: name, old: valueText(t, meta.old, meta.old_label), new: valueText(t, meta.new, meta.new_label),
    });
  }
  const custom = sentences.get(eventType);
  if (custom) return custom(t, meta, who, ctx, actor);
  return t(`feed.events.${eventType}`, { actor: who, defaultValue: `${who}: ${humanize(eventType)}`, ...meta });
}
