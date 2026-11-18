import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { inUserZone } from "./timeZone";

// COMPASS pages format with the locale's "L" / "LL" / "LT" (COMPASS utils/formatDate.ts extends dayjs the same way).
dayjs.extend(localizedFormat);

export const DATE_FORMAT = "DD.MM.YYYY";

// A `date` column arrives as "YYYY-MM-DD": a calendar day, shown as is. Anything longer is a timestamptz (an
// instant) and is shown in the user's time zone (users.time_zone, utils/timeZone.ts) - otherwise a note written
// at 23:30 in Singapore would carry the previous day for a reader in Europe and the wrong day for its writer.
const isPlainDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export const formatDate = (v?: string | null) => (v ? (isPlainDate(v) ? dayjs(v) : inUserZone(v)).format(DATE_FORMAT) : "—");

export const formatDateTime = (v?: string | null) => (v ? inUserZone(v).format(`${DATE_FORMAT} HH:mm`) : "—");

/** An instant in the user's zone with a custom format, e.g. "D MMM YYYY, HH:mm". */
export const formatInstant = (v: string | null | undefined, format: string) => (v ? inUserZone(v).format(format) : "—");

// Hull events are month-grain (day always the 1st - see hull_events.event_date)
// so they're displayed as MM/YYYY rather than a full day-level date.
export const formatMonthYear = (v?: string | null) => (v ? dayjs(v).format("MM/YYYY") : "—");

// "X months ago" for a past date, relative to today. Rounds down to whole
// months, same as dayjs().diff(v, "month")'s default truncation.
export const formatMonthsAgo = (v?: string | null) => {
  if (!v) return null;
  const months = dayjs().diff(dayjs(v), "month");
  if (months <= 0) return "this month";
  return `${months} month${months === 1 ? "" : "s"} ago`;
};

// "in X months" for a future date, relative to today.
export const formatMonthsToGo = (v?: string | null) => {
  if (!v) return null;
  const months = dayjs(v).diff(dayjs(), "month");
  if (months <= 0) return "this month";
  return `in ${months} month${months === 1 ? "" : "s"}`;
};
