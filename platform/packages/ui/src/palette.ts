import { useContext } from "react";
import { ColorModeContext } from "./colorMode";

// The colours of the app (~/maintenance_tool/docs/ui-and-navigation.md "Icons and colours"): the Wilckens CI frame (dark blue, red only
// for the brand and for attention); own colours carry a meaning (status, priority, teams, task types) and have their
// own steps for light and dark mode. The database stores only the key (task_types.color, groups.color).

export const CI_NAVY = "#1a2b3c";
export const CI_RED = "#ed1c29";

export const COLOR_KEYS = ["gray", "navy", "blue", "sky", "teal", "green", "amber", "orange", "red", "pink", "violet"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

// fg = text and icon on bg (tinted background, at least 4.5:1); dot = the solid mark (dots, bars, avatars).
type Swatch = { fg: string; bg: string; dot: string };

const LIGHT: Record<ColorKey, Swatch> = {
  gray: { fg: "#3B4452", bg: "#EEF0F3", dot: "#8792A2" },
  navy: { fg: CI_NAVY, bg: "#E3E8EE", dot: CI_NAVY },
  blue: { fg: "#1D4F91", bg: "#E3EEFB", dot: "#2A78D6" },
  sky: { fg: "#075985", bg: "#DCEEF8", dot: "#0369A1" },
  teal: { fg: "#0F5F59", bg: "#DDF3EF", dot: "#0F766E" },
  green: { fg: "#166534", bg: "#DCF2E2", dot: "#15803D" },
  amber: { fg: "#854D0E", bg: "#FDF3D8", dot: "#EDA100" },
  orange: { fg: "#9A3412", bg: "#FDEBE2", dot: "#EB6834" },
  red: { fg: "#C8102E", bg: "#FDE8E9", dot: CI_RED },
  pink: { fg: "#9D174D", bg: "#FBE4EF", dot: "#BE185D" },
  violet: { fg: "#3F2FA8", bg: "#ECE9FB", dot: "#6250D6" },
};

const DARK: Record<ColorKey, Swatch> = {
  gray: { fg: "#C5CFDA", bg: "#273340", dot: "#8792A2" },
  navy: { fg: "#E8EDF2", bg: "#24364A", dot: "#9AAABB" },
  blue: { fg: "#9CC3F2", bg: "#1B3354", dot: "#3987E5" },
  sky: { fg: "#7CC4EE", bg: "#12304A", dot: "#38A3DC" },
  teal: { fg: "#6FD6C8", bg: "#123A36", dot: "#2BB3A3" },
  green: { fg: "#7DD39A", bg: "#143322", dot: "#3DAA62" },
  amber: { fg: "#F2C866", bg: "#3A2E10", dot: "#C98500" },
  orange: { fg: "#F5A585", bg: "#3D2418", dot: "#D95926" },
  red: { fg: "#FF8A8F", bg: "#3D1A1E", dot: CI_RED },
  pink: { fg: "#F49AC4", bg: "#3D1A2C", dot: "#EC6FA8" },
  violet: { fg: "#C3BCF5", bg: "#2A2550", dot: "#9085E9" },
};

const swatchFor = (key: string | null | undefined, mode: "light" | "dark"): Swatch => {
  const set = mode === "dark" ? DARK : LIGHT;
  return set[(key && key in set ? key : "gray") as ColorKey];
};

// The swatch of a colour key in the current colour mode; unknown or empty keys are gray.
export const usePalette = () => {
  const { mode } = useContext(ColorModeContext);
  return { mode, swatch: (key: string | null | undefined) => swatchFor(key, mode) };
};

// Status codes of tasks, tickets and assets. Waiting states are warm, finished ones green, closed and cancelled gray.
export const STATUS_COLOR: Record<string, ColorKey> = {
  open: "gray",
  in_progress: "blue",
  waiting_for_approval: "orange",
  waiting_for_procurement: "amber",
  waiting_for_delivery: "sky",
  waiting_for_requester: "orange",
  converted_to_task: "violet",
  resolved: "green",
  done: "green",
  closed: "gray",
  cancelled: "gray",
  active: "green",
  inactive: "gray",
  decommissioned: "red",
};
// Flags shown next to a status: blocked by a subtask (violet, so red stays for what is late) and overdue.
export const BLOCKED_COLOR: ColorKey = "violet";

export const PRIORITY_LEVEL: Record<string, { bars: number; color: ColorKey }> = {
  low: { bars: 1, color: "gray" },
  normal: { bars: 2, color: "blue" },
  high: { bars: 3, color: "orange" },
  urgent: { bars: 4, color: "red" },
};
