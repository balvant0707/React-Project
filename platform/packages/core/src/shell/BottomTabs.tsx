import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { theme as antdTheme, type GlobalToken } from "antd";
import { useThemedLayoutContext } from "@refinedev/antd";
import { useTranslation } from "react-i18next";
import { IconHome, IconMenu2, IconSearch } from "@tabler/icons-react";
import { useIsMobile } from "@rbp/ui";
import { useShell } from "./ShellContext";

// Taken over from COMPASS components/bottomTabs.tsx. Phone: Home, the tabs the modules contribute (phoneTabs: tasks, messages ...),
// More (opens the menu) and Search on the far right. Every tab is a page, not a dialog. A detail page with an ActionBar takes
// the place of the tabs.

import { BOTTOM_TABS_HEIGHT } from "@rbp/ui";
export { BOTTOM_TABS_HEIGHT };

// How many hiders are mounted (an ActionBar, the focused search field); the tabs hide while there is one.
let actionBars = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notify = () => listeners.forEach((fn) => fn());

// Called by the ActionBar while it is shown on a phone, and by the search page while its field has the keyboard.
export function useHideBottomTabs(active: boolean) {
  useEffect(() => {
    if (!active) return;
    actionBars += 1;
    notify();
    return () => {
      actionBars -= 1;
      notify();
    };
  }, [active]);
}

// The bars pinned to the bottom of a phone (the tabs and the ActionBar): a real bar over the whole width with a line on
// top. Its background reaches the screen edge (the bottom border is as wide as --bar-gap in index.css, which keeps the
// content clear of the home bar).
export const bottomBarStyle = (token: GlobalToken): React.CSSProperties => ({
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  // Below the menu drawer, dialogs and the full-screen conversation (messages), which cover it.
  zIndex: 50,
  background: token.colorBgContainer,
  borderTop: `1px solid ${token.colorBorderSecondary}`,
  borderBottom: `var(--bar-gap) solid ${token.colorBgContainer}`,
});

const ICON = { size: 22, stroke: 1.8 } as const;

// A tap on the magnifier focuses a hidden field at once (iOS opens the keyboard only for a focus inside the tap
// itself); the search page takes the focus over when it mounts. Already on the page, the event refocuses its field.
export const FOCUS_SEARCH_EVENT = "rbp:focus-search";
let searchRequested = false;
export const takeSearchFocusRequest = () => {
  const requested = searchRequested;
  searchRequested = false;
  return requested;
};
const focusProxy = () => {
  const proxy = document.getElementById("search-focus-proxy") as HTMLInputElement | null;
  proxy?.focus({ preventScroll: true });
};

export const BottomTabs = () => {
  const isMobile = useIsMobile();
  const replaced = useSyncExternalStore(subscribe, () => actionBars > 0);
  if (!isMobile || replaced) return null;
  return <Tabs />;
};

const Tabs = () => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { pathname } = useLocation();
  const { setMobileSiderOpen } = useThemedLayoutContext();
  const { phoneTabs } = useShell();

  const color = (active: boolean) => (active ? token.colorPrimary : token.colorTextSecondary);
  const cell = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: BOTTOM_TABS_HEIGHT,
    color: color(active),
    fontSize: 11,
    fontWeight: active ? 600 : 400,
    lineHeight: 1.2,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  });
  const label = (text: string) => <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>;
  const tab = (to: string, active: boolean, icon: ReactNode, text: string) => (
    <Link to={to} style={cell(active)} aria-current={active ? "page" : undefined}>
      {icon}
      {label(text)}
    </Link>
  );

  return (
    <nav
      data-bottom-bar
      aria-label={t("nav.tabs.label")}
      style={{
        ...bottomBarStyle(token),
        display: "flex",
        alignItems: "stretch",
        padding: "0 6px",
      }}
    >
      {tab("/", pathname === "/", <IconHome {...ICON} />, t("nav.dashboard"))}
      {[...phoneTabs].sort((x, y) => x.order - y.order).map((item) => {
        const active = pathname.startsWith(item.to);
        return <Fragment key={item.key}>{tab(item.to, active, item.icon({ ...ICON, color: color(active) }), t(item.label, { defaultValue: item.label }))}</Fragment>;
      })}
      <button type="button" style={cell(false)} onClick={() => setMobileSiderOpen(true)}>
        <IconMenu2 {...ICON} />
        {label(t("nav.tabs.more"))}
      </button>
      <Link
        to="/search"
        style={cell(pathname.startsWith("/search"))}
        aria-current={pathname.startsWith("/search") ? "page" : undefined}
        onClick={() => {
          searchRequested = true;
          focusProxy();
          window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
        }}
      >
        <IconSearch {...ICON} />
        {label(t("nav.tabs.search"))}
      </Link>
      {/* 16 px: iOS zooms into a focused field with smaller text. */}
      <input id="search-focus-proxy" aria-hidden tabIndex={-1} style={{ position: "fixed", bottom: 0, left: 0, width: 1, height: 1, opacity: 0, fontSize: 16, border: 0, padding: 0, pointerEvents: "none" }} />
    </nav>
  );
};
