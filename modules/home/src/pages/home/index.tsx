// Ported 1:1 from COMPASS (app/src/pages/home/index.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useGetIdentity } from "@rbp/core";
import { usePageBannerTitle, usePageBannerSubtitle } from "@rbp/core";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { IconBeach, IconBuildingFactory2, IconCake, IconCalendarEvent, IconChecks, IconCirclePlus, IconHelp, IconListCheck, IconMessageCircle, IconPackage, IconTicket, IconUsers, type Icon } from "@tabler/icons-react";
import { Badge, theme as antdTheme } from "antd";
import { CI_RED } from "@rbp/ui";
import { IconTile } from "@rbp/ui";
import { usePermissions } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useDecisionCount } from "@rbp/module-task-family/src/hooks/useDecisions.ts";
import { hasLeft, personName } from "@rbp/module-messaging/src/lib/people.ts";
import { PersonAvatar } from "@rbp/core";
import { HomeGlance } from "./homeGlance";
import { HomeTasks } from "./homeTasks";
import { HomeNews } from "./homeNews";

// The start page ("Home", ~/maintenance_tool/docs/ui-and-navigation.md "Start page"): a greeting, quick links, my tasks and the news of the
// groups I follow.

const GREETINGS = 5;

// The salutation follows the browser clock: good morning from 4 to 11, hello until 18, good evening until midnight and
// hello again in the night (a night shift is greeted neither "good evening" nor "good night", a farewell in German).
const salutationKey = (hour: number): string => (hour >= 4 && hour < 11 ? "morning" : hour >= 18 ? "evening" : "day");

// Day and month of birthdays are public in the directory (users.birthday_month/day); people who left are left out.
const useBirthdayPeople = () => {
  const { data: people } = usePeople();
  const today = dayjs();
  return (people ?? []).filter((p) => !hasLeft(p) && p.birthday_month === today.month() + 1 && p.birthday_day === today.date());
};
const STORAGE_KEY = "compass.greeting";

// One line out of the list per day and session (a new day or a new browser session draws again), never the one shown
// last. Storage can be blocked: then a plain random pick.
const pickGreeting = (): number => {
  const today = dayjs().format("YYYY-MM-DD");
  try {
    const [day, current] = (sessionStorage.getItem(STORAGE_KEY) ?? "").split(":");
    if (day === today && current) return Number(current);
    const last = Number(localStorage.getItem(STORAGE_KEY) ?? -1);
    let n = Math.floor(Math.random() * GREETINGS);
    while (n === last) n = Math.floor(Math.random() * GREETINGS);
    sessionStorage.setItem(STORAGE_KEY, `${today}:${n}`);
    localStorage.setItem(STORAGE_KEY, String(n));
    return n;
  } catch {
    return Math.floor(Math.random() * GREETINGS);
  }
};

// Quick access is one row, never more: as many tiles as fit the width, the most important first (the order of the list
// below). A phone shows 4 to 6, a wide screen up to all of them.
const MIN_TILE = { phone: 76, desktop: 130 } as const;
const GAP = 8;
const PHONE_TILES = { min: 4, max: 6 } as const;

const useElementWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

type QuickLink = { key: string; label: string; to: string; icon: Icon; show: boolean; count?: number };

export const Home = () => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const perms = usePermissions();
  const { data: identity } = useGetIdentity<{ id?: string; name?: string | null }>();
  const firstName = identity?.name?.trim().split(/\s+/)[0];
  const [greeting] = useState(pickGreeting);
  const [salutation] = useState(() => salutationKey(dayjs().hour()));
  const isMobile = useIsMobile();
  const [rowRef, rowWidth] = useElementWidth();
  const birthdays = useBirthdayPeople();
  const myBirthday = birthdays.some((p) => p.id === identity?.id);
  const colleagues = birthdays.filter((p) => p.id !== identity?.id);
  // The banner upper-cases its title; a greeting reads better in sentence case. Memoized (the banner hooks re-run on a new node).
  const salutationText = firstName ? t(`home.salutation.${salutation}`, { name: firstName }) : t(`home.salutationAnonymous.${salutation}`);
  const bannerTitle = useMemo(() => <span style={{ textTransform: "none" }}>{salutationText}</span>, [salutationText]);
  const tagline = myBirthday ? t("home.birthdayMine") : t(`home.greetings.g${greeting + 1}`);
  const today = dayjs().format("dddd, LL");
  const bannerSubtitle = useMemo(() => `${today} · ${tagline}`, [today, tagline]);
  usePageBannerTitle(bannerTitle);
  usePageBannerSubtitle(bannerSubtitle);

  // Every entry the person may use; the grid shows as many as fit the width (a wide screen shows them all in one row).
  const { data: decisionCount } = useDecisionCount();
  const decisions = decisionCount ?? 0;
  const may = (prefix: string) => perms.ready && perms.hasAny(prefix);
  const links: QuickLink[] = [
    { key: "tasks", label: t("home.links.tasks"), to: "/tasks", icon: IconListCheck, show: true },
    { key: "start", label: t("home.links.start"), to: "/start", icon: IconCirclePlus, show: true },
    // Only when something waits for me, with the number.
    { key: "decisions", label: t("dashboard.decisions"), to: "/decisions", icon: IconChecks, show: decisions > 0, count: decisions },
    { key: "people", label: t("home.links.people"), to: "/people?focus=search", icon: IconUsers, show: true },
    { key: "messages", label: t("nav.messages"), to: "/messages", icon: IconMessageCircle, show: true },
    // Without leave rights the tile is the manual.
    { key: "leave", label: t("home.links.leave"), to: "/leave", icon: IconBeach, show: may("leave.view.") },
    { key: "help", label: t("home.links.help"), to: "/help", icon: IconHelp, show: perms.ready && !perms.hasAny("leave.view.") },
    { key: "planning", label: t("nav.planning"), to: "/planning", icon: IconCalendarEvent, show: may("tasks.view.") },
    { key: "assets", label: t("nav.assets"), to: "/assets", icon: IconBuildingFactory2, show: may("assets.view.") },
    { key: "items", label: t("items.title"), to: "/items", icon: IconPackage, show: may("items.view") },
    { key: "tickets", label: t("nav.tickets"), to: "/tickets", icon: IconTicket, show: may("tickets.view.") },
  ];

  // How many tiles fit into one row (before the width is known, the phone minimum).
  const fit = Math.floor((rowWidth + GAP) / ((isMobile ? MIN_TILE.phone : MIN_TILE.desktop) + GAP));
  const limit = isMobile ? Math.min(Math.max(fit, PHONE_TILES.min), PHONE_TILES.max) : Math.max(fit, 1);
  const tiles = links.filter((l) => l.show).slice(0, rowWidth ? limit : PHONE_TILES.min);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Platform: the greeting is the app's page banner (title + subtitle), not a second banner card under it. */}
      {colleagues.length > 0 && (
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px", borderRadius: 12, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}` }}
        >
          <IconCake size={22} stroke={1.8} color={CI_RED} aria-hidden />
          <span style={{ fontWeight: 600 }}>{t("home.birthdaysToday")}</span>
          {colleagues.map((p) => (
            <Link key={p.id} to={`/people/${p.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: token.colorText }}>
              <PersonAvatar person={p} size={26} />
              {personName(p)}
            </Link>
          ))}
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>{t("home.quickAccess")}</h2>
        <div ref={rowRef} style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length || 1}, minmax(0, 1fr))`, gap: GAP }}>
          {tiles.map((l) => (
            <Link
              key={l.key}
              to={l.to}
              title={l.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: isMobile ? 6 : 8,
                padding: isMobile ? "10px 2px" : "16px 8px",
                textAlign: "center",
                color: token.colorText,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 12,
                fontWeight: 500,
                fontSize: isMobile ? 11 : 14,
                lineHeight: 1.2,
                minWidth: 0,
              }}
            >
              <Badge count={l.count ?? 0} overflowCount={99} offset={[-2, 2]} size={isMobile ? "small" : "default"}>
                <IconTile icon={l.icon} color="red" size={isMobile ? 34 : 44} style={{ borderRadius: 22 }} />
              </Badge>
              <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <HomeTasks />
      <HomeGlance />
      <HomeNews />
    </div>
  );
};
