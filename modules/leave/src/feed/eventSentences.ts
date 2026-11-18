// History sentences of the leave events (COMPASS app/src/components/feed/eventText.ts, the leave cases), registered with the
// messaging module.
import { formatDate } from "@rbp/ui";
import { registerEventSentence } from "@rbp/module-messaging/src/feed/eventText.ts";

export const registerLeaveSentences = () => {
  registerEventSentence("leave_adjusted", (t, meta, who) =>
    t("feed.events.leave_adjusted", { actor: who, from: formatDate(meta.new_from_date), to: formatDate(meta.new_to_date), days: meta.new_days }));
  registerEventSentence("leave_withdrawn", (t, _meta, who) => t("feed.events.leave_withdrawn", { actor: who }));
};
