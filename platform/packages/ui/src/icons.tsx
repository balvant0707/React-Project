import type { CSSProperties } from "react";
import {
  IconAlertTriangle, IconAtom, IconBarrel, IconBeach, IconBolt, IconBottle, IconBox, IconBrush, IconBucket, IconBuilding,
  IconBuildingFactory2, IconBuildingWarehouse, IconBulb, IconCalendarEvent, IconCar, IconCertificate, IconClipboardCheck,
  IconContainer, IconCpu, IconCylinder, IconDroplet, IconEngine, IconEye, IconFireExtinguisher, IconFlag, IconFlame,
  IconFlask, IconFolder, IconForklift, IconGauge, IconHammer, IconHourglass, IconLadder, IconLeaf, IconListCheck, IconMicroscope,
  IconPackage, IconPaint, IconPlug, IconPrinter, IconPropeller, IconRecycle, IconRoute, IconScale, IconSchool, IconServer,
  IconSettings, IconShieldCheck, IconShoppingCart, IconSitemap, IconSnowflake, IconSpray, IconStack2, IconTarget,
  IconTemperature, IconTicket, IconTool, IconTruck, IconUsers, IconWind, IconGift, IconPlane, IconHome, IconFirstAidKit,
  IconClockHour4,
  type Icon,
} from "@tabler/icons-react";
import { usePalette } from "./palette";

// Icons an admin can give a task type, an asset type or an asset (the key is stored). Tabler with a 2 px stroke, so
// every icon has the same weight. A key that is not in this list falls back to the default of its kind.
export const ICONS: Record<string, Icon> = {
  "tool": IconTool,
  "hammer": IconHammer,
  "settings": IconSettings,
  "alert-triangle": IconAlertTriangle,
  "eye": IconEye,
  "clipboard-check": IconClipboardCheck,
  "list-check": IconListCheck,
  "shield-check": IconShieldCheck,
  "fire-extinguisher": IconFireExtinguisher,
  "ladder": IconLadder,
  "shopping-cart": IconShoppingCart,
  "package": IconPackage,
  "box": IconBox,
  "truck": IconTruck,
  "forklift": IconForklift,
  "car": IconCar,
  "engine": IconEngine,
  "gauge": IconGauge,
  "propeller": IconPropeller,
  "wind": IconWind,
  "bolt": IconBolt,
  "plug": IconPlug,
  "cpu": IconCpu,
  "server": IconServer,
  "printer": IconPrinter,
  "scale": IconScale,
  "temperature": IconTemperature,
  "flame": IconFlame,
  "snowflake": IconSnowflake,
  "droplet": IconDroplet,
  "bottle": IconBottle,
  "barrel": IconBarrel,
  "cylinder": IconCylinder,
  "container": IconContainer,
  "bucket": IconBucket,
  "paint": IconPaint,
  "brush": IconBrush,
  "spray": IconSpray,
  "flask": IconFlask,
  "microscope": IconMicroscope,
  "atom": IconAtom,
  "leaf": IconLeaf,
  "recycle": IconRecycle,
  "bulb": IconBulb,
  "building-factory": IconBuildingFactory2,
  "building": IconBuilding,
  "building-warehouse": IconBuildingWarehouse,
  "folder": IconFolder,
  "stack": IconStack2,
  "sitemap": IconSitemap,
  "route": IconRoute,
  "calendar-event": IconCalendarEvent,
  "hourglass": IconHourglass,
  "certificate": IconCertificate,
  "school": IconSchool,
  "users": IconUsers,
  "beach": IconBeach,
  "flag": IconFlag,
  "target": IconTarget,
  "ticket": IconTicket,
  // absences
  "gift": IconGift,
  "plane": IconPlane,
  "home": IconHome,
  "first-aid": IconFirstAidKit,
  "clock": IconClockHour4,
};
export const ICON_KEYS = Object.keys(ICONS);

export const DEFAULT_TASK_TYPE_ICON = "list-check";
export const DEFAULT_ASSET_TYPE_ICON = "building-factory";
export const DEFAULT_TICKET_QUEUE_ICON = "ticket";
export const DEFAULT_ABSENCE_TYPE_ICON = "beach";
// Default of a grouping node (site, category) without any icon above it.
export const DEFAULT_GROUPING_ICON = "folder";

export const iconFor = (key: string | null | undefined, fallback: string): Icon => ICONS[key ?? ""] ?? ICONS[fallback];

// A coloured tile with an icon (task type in a list, tiles on the dashboard). `color` = palette key; empty = gray.
export const IconTile = ({ icon: Glyph, color, size = 32, title, style }: { icon: Icon; color?: string | null; size?: number; title?: string; style?: CSSProperties }) => {
  const { swatch } = usePalette();
  const s = swatch(color);
  return (
    <span
      title={title}
      aria-label={title}
      role={title ? "img" : undefined}
      style={{ flex: "none", width: size, height: size, borderRadius: Math.round(size / 4), display: "inline-flex", alignItems: "center", justifyContent: "center", background: s.bg, color: s.fg, ...style }}
    >
      <Glyph size={Math.round(size * 0.56)} stroke={2} aria-hidden />
    </span>
  );
};
