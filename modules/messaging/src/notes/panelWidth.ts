// Moved from npm-base into messaging on 2026-11-13; from the NPM tool (app/src/utils/panelWidth.ts). Hand-owned now.
// Resizable side panels (notes panel, inbox list) remember their width in a cookie across sessions.
type PanelWidth = { cookie: string; def: number; min: number; max: number };

const getCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
};

export const clampPanelWidth = ({ min, max }: PanelWidth, width: number) => Math.min(max, Math.max(min, width));

export const readSavedPanelWidth = (panel: PanelWidth): number => {
  const saved = getCookie(panel.cookie);
  const parsed = saved ? parseInt(saved, 10) : NaN;
  return Number.isFinite(parsed) ? clampPanelWidth(panel, parsed) : panel.def;
};

export const savePanelWidth = ({ cookie }: PanelWidth, width: number) => {
  document.cookie = `${cookie}=${encodeURIComponent(String(width))}; max-age=${60 * 60 * 24 * 365}; path=/`;
};
