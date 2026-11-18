import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd';
import type { Locale } from 'antd/es/locale';

// Taken over from COMPASS contexts/colorMode.tsx (superset of the NPM one): stored mode, antd algorithm, and the
// surface colour behind the browser's status area. The themes come from the app (createThemes), the antd locale from core.

type Mode = 'light' | 'dark';
interface ColorModeContextType { mode: Mode; toggleMode: () => void }

export const ColorModeContext = createContext<ColorModeContextType>({ mode: 'light', toggleMode: () => {} });
export const useColorMode = () => useContext(ColorModeContext);

const STORAGE_KEY = 'rbp.colorMode';

export interface ColorModeProviderProps extends PropsWithChildren {
  themes: { light: ThemeConfig; dark: ThemeConfig };
  /** antd locale (pagination, date pickers, validation texts). */
  locale?: Locale;
}

export function ColorModeProvider({ themes, locale, children }: ColorModeProviderProps) {
  const [mode, setMode] = useState<Mode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const current = themes[mode];
  const layout = (current.components as { Layout?: { headerBg?: string } } | undefined)?.Layout;
  const surface = layout?.headerBg ?? (mode === 'dark' ? '#141414' : '#ffffff');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    // The page behind the header and the browser's status area follow the app's mode, not the phone's: with
    // viewport-fit=cover iOS tints the top by this colour.
    document.documentElement.style.background = surface;
    document.documentElement.style.colorScheme = mode;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = surface;
    document.head.appendChild(meta);
  }, [mode, surface]);

  return (
    <ColorModeContext.Provider value={{ mode, toggleMode: () => setMode((p) => (p === 'light' ? 'dark' : 'light')) }}>
      <ConfigProvider
        locale={locale}
        theme={{ ...current, algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
}
