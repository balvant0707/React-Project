import type { ComponentType } from "react";

// A record card in a message is stored as "[[<kind>:<uuid>]]" inside the text (COMPASS: task cards, ~/maintenance_tool/docs/messaging.md).
// The card shows what the reader may see of the record: the database decides through the row policy. A module that has
// such records (tasks, assets ...) registers its kind here: how to search it, how to draw the card.
export interface RecordCardType {
  kind: string;
  /** Singular name for the "Link ..." button. */
  label: string;
  search: (term: string) => Promise<{ value: string; label: string }[]>;
  Card: ComponentType<{ id: string }>;
}

const types = new Map<string, RecordCardType>();
export const registerRecordCard = (type: RecordCardType) => void types.set(type.kind, type);
export const recordCardTypes = () => [...types.values()];
export const recordCardType = (kind: string) => types.get(kind);

export const CARD_TOKEN = /\[\[([a-z_]+):([0-9a-fA-F-]{36})\]\]/g;
export const cardToken = (kind: string, id: string) => `[[${kind}:${id}]]`;
/** Splits a text at its cards: [text, kind, id, text, kind, id, ..., text]. */
export const splitCards = (body: string) => body.split(new RegExp(CARD_TOKEN.source, "g"));
