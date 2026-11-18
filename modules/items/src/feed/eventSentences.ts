// History sentences of a task's material orders (COMPASS app/src/components/feed/eventText.ts, the items cases), registered
// with the messaging module.
import { registerEventSentence } from "@rbp/module-messaging/src/feed/eventText.ts";

const KEYS = { items_ordered: "feed.events.items_ordered", items_arrived: "feed.events.items_arrived", items_order_cancelled: "feed.events.items_order_cancelled" };

export const registerItemSentences = () => {
  for (const [type, key] of Object.entries(KEYS)) {
    registerEventSentence(type, (t, meta, who) => t(key, { actor: who, count: meta.count, number: meta.task_number, title: meta.title }));
  }
};
