// History sentences of the asset events and of a task's asset (COMPASS app/src/components/feed/eventText.ts, the asset cases),
// registered with the messaging module; asset names from the name source 'assets' (assetNames.ts).
import type { TFunction } from "i18next";
import { registerEventSentence } from "@rbp/module-messaging/src/feed/eventText.ts";

/** A status change in words (assets and tickets). */
export const statusChanged = (t: TFunction, meta: Record<string, any>, who: string) => {
  const status = (code?: string) => (code ? t(`status.${code}`, { defaultValue: code }) : "—");
  return t("feed.events.status_changed", { actor: who, old: status(meta.old), new: status(meta.new) });
};

export const registerAssetSentences = () => {
  const on = registerEventSentence;
  on("task_asset_changed", (t, meta, who, ctx) => t("feed.events.asset_changed", { actor: who, asset: meta.new_asset_id ? ctx.name("assets", meta.new_asset_id) : "—" }));
  on("asset_created", (t, _meta, who) => t("feed.events.asset_created", { actor: who }));
  on("asset_moved", (t, meta, who, ctx) => t("feed.events.asset_moved", { actor: who, parent: meta.new_parent_asset_id ? ctx.name("assets", meta.new_parent_asset_id) : t("feed.root") }));
  on("asset_status_changed", (t, meta, who) => statusChanged(t, meta, who));
  on("asset_operating_hours_changed", (t, meta, who) => t("feed.events.asset_operating_hours_changed", { actor: who, new: meta.new ?? "—" }));
  on("asset_responsible_changed", (t, meta, who, ctx) => t("feed.events.asset_responsible_changed", { actor: who, user: meta.new_user_id ? ctx.userName(meta.new_user_id) : "—" }));
};
