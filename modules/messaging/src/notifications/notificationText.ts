import type { TFunction } from "i18next";

type NotificationLike = {
  type: string;
  title: string;
  body?: string | null;
  params?: Record<string, unknown> | null;
};

// Notifications store an English fallback text plus `type` and `params`; the UI renders them
// through i18n (`notifications.types.<type>`), falling back to the stored English title.
export function notificationTitle(t: TFunction, n: NotificationLike): string {
  return t(`notifications.types.${n.type}`, { defaultValue: n.title, ...(n.params ?? {}) });
}
