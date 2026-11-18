import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// The user's time zone: `users.time_zone` (set by getIdentity, cached in localStorage), else the device's. Timestamps
// are shown in it (utils/formatDate.ts); plain `date` values are never shifted.

const STORAGE_KEY = "rbp.timeZone";

export const deviceTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const readCached = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

let profileZone: string | null = readCached();
const listeners = new Set<() => void>();

/** The zone the user picked on the profile page, or null when they follow the device. */
export const getProfileTimeZone = () => profileZone;

/** The zone to show times in. */
export const userTimeZone = (): string => profileZone ?? deviceTimeZone();

export const setUserTimeZone = (zone: string | null) => {
  const next = zone || null;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: the setting still holds for this tab
  }
  if (next === profileZone) return;
  profileZone = next;
  listeners.forEach((l) => l());
};

export const subscribeTimeZone = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** An instant as a Dayjs in the user's zone. */
export const inUserZone = (v: string | Date | Dayjs) => dayjs(v).tz(userTimeZone());

/** Now, in the user's zone. */
export const nowInUserZone = () => dayjs().tz(userTimeZone());

/** Today's calendar day (YYYY-MM-DD) in the user's zone - use this, not new Date().toISOString() (UTC). */
export const todayIso = () => nowInUserZone().format("YYYY-MM-DD");

/** "GMT+02:00"-style offset of a zone right now. */
export const zoneOffsetLabel = (zone: string) => {
  const offset = dayjs().tz(zone).utcOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};

/** Every IANA zone the browser knows, for pickers, labelled with the current offset and sorted by it. */
export const timeZoneOptions = (): { value: string; label: string }[] => {
  const zones: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [
    "UTC",
    "Europe/Berlin",
  ];
  const list = zones.includes("UTC") ? zones : ["UTC", ...zones];
  return list
    .map((z) => ({ zone: z, offset: dayjs().tz(z).utcOffset() }))
    .sort((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone))
    .map(({ zone }) => ({ value: zone, label: `(${zoneOffsetLabel(zone)}) ${zone.replace(/_/g, " ")}` }));
};
