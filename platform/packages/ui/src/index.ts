import './styles.css';
import type { ThemeConfig } from 'antd';

type AntToken = NonNullable<ThemeConfig['token']>;

/** One colour mode of an app: antd tokens plus the few menu colours the apps set themselves. */
export interface ModeTokens {
  /** antd seed and derived tokens (colorPrimary, colorInfo, colorText, colorPrimaryBg ...). */
  token: AntToken;
  /** Background of the page area, sider and header surfaces. */
  layout?: { body?: string; sider?: string; header?: string };
  menu?: {
    color?: string;
    hoverBackground?: string;
    hoverColor?: string;
    /** Background of the selected entry; 'transparent' = colour change only. */
    selectedBackground?: string;
    selectedColor?: string;
  };
}

/** CI configuration of one app (docs/architecture.md section 6). Every app owns one. */
export interface DesignTokens {
  light: ModeTokens;
  dark?: ModeTokens;
}

// Fixed density of the platform (docs/architecture.md section 6): taken from the NPM tool.
const DENSITY = {
  Card: { bodyPadding: 16, headerPadding: 16 },
  Table: { cellPaddingBlock: 8 },
  Form: { itemMarginBottom: 12, verticalLabelPadding: '0 0 4px' },
} as const;

function build(mode: ModeTokens, dark: boolean): ThemeConfig {
  const { layout, menu } = mode;
  return {
    token: { fontSize: 14, ...mode.token },
    components: {
      ...DENSITY,
      Card: { ...DENSITY.Card, ...(dark ? {} : { boxShadowTertiary: 'none' }) },
      Layout: { siderBg: layout?.sider, headerBg: layout?.header, bodyBg: layout?.body },
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        iconSize: 16,
        itemColor: menu?.color,
        itemHoverBg: menu?.hoverBackground,
        itemHoverColor: menu?.hoverColor,
        itemSelectedBg: menu?.selectedBackground,
        itemSelectedColor: menu?.selectedColor,
      },
    },
  };
}

/** Builds the antd themes of an app: the shared dense component overrides plus the app's colours. */
export function createThemes(tokens: DesignTokens): { light: ThemeConfig; dark: ThemeConfig } {
  return { light: build(tokens.light, false), dark: build(tokens.dark ?? tokens.light, true) };
}

/** Light theme only (an app without a dark mode). */
export function createTheme(tokens: DesignTokens): ThemeConfig {
  return build(tokens.light, false);
}

export { ColorModeProvider, ColorModeContext, useColorMode } from './colorMode';
export { ListTable, ListColumn } from './ListTable';
export { useIsMobile, useIsWide } from './hooks/useIsMobile';
export { useStickyHeaderOffset } from './hooks/useStickyHeaderOffset';
export { useFreezePanes } from './hooks/useFreezePanes';
export { RemoteSelect } from './RemoteSelect';
export { ManageColumnsButton } from './ManageColumnsButton';
export * from './utils/timeZone';
export * from './utils/formatDate';
export * from './utils/formatBytes';
export * from './utils/tableRow';
export * from './excel';
export * from './utils/escapeLike';
export * from './utils/inChunks';
export * from './utils/clearedToNull';
export * from './utils/columnVisibility';
export * from './utils/confirm';
export * from './utils/tableCards';
export * from './utils/useVisualViewport';
export * from './utils/search';
export * from './palette';
export * from './icons';
export * from './FloatingAddButton';
export type { RemoteOption } from './RemoteSelect';
export * from './utils/formatNumber';
export * from './utils/currencies';
export * from './utils/uuid';
export * from './utils/keys';
export * from './utils/emailHtml';
export * from './utils/useGridKeyNav';
export { ViewModeFields } from './ViewModeFields';
export * from './utils/image';
