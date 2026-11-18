import { createThemes } from '@rbp/ui';

// COMPASS (Wilckens CI): dark blue for text, primary buttons and the selected menu entry; dark mode has its own
// steps, not an inversion. Values from the COMPASS app (maintenance_tool/app/src/theme.ts).
const BRAND = '#1a2b3c';

export const themes = createThemes({
  light: {
    token: {
      colorPrimary: BRAND, colorInfo: '#2A78D6', colorLink: '#1D4F91', colorError: '#C8102E',
      colorText: '#1a2b3c', colorTextSecondary: '#46596E', colorTextTertiary: '#5A6B7E',
      borderRadius: 8, colorBorderSecondary: '#E3E8EE', colorBgLayout: '#F5F7F9',
      colorPrimaryBg: '#EEF2F6', colorPrimaryBgHover: '#E3E8EE', colorPrimaryBorder: '#C5CFDA',
      colorPrimaryBorderHover: '#9AAABB', controlItemBgActive: '#E1E7EE', controlItemBgActiveHover: '#D5DDE6',
    },
    layout: { sider: '#FFFFFF', header: '#FFFFFF', body: '#F5F7F9' },
    menu: {
      color: '#2E4157', hoverBackground: '#F5F7F9', hoverColor: BRAND,
      selectedBackground: '#EDF0F4', selectedColor: BRAND,
    },
  },
  dark: {
    token: {
      colorPrimary: '#4F6D8C', colorInfo: '#3987E5', colorLink: '#9CC3F2', colorError: '#FF6B73',
      colorText: '#E8EDF2', colorTextSecondary: '#B4C0CC', colorTextTertiary: '#93A1B0',
      borderRadius: 8, colorBgLayout: '#0F1923', colorBgContainer: '#17232F', colorBgElevated: '#1F2D3B',
      colorBorder: '#3A4C5E', colorBorderSecondary: '#2A3A4A',
      colorPrimaryBg: '#1F2E3E', colorPrimaryBgHover: '#24364A', colorPrimaryBorder: '#3A4C5E',
      colorPrimaryBorderHover: '#4F6D8C', controlItemBgActive: '#2A3D52', controlItemBgActiveHover: '#31475F',
    },
    layout: { sider: '#17232F', header: '#17232F', body: '#0F1923' },
    menu: { color: '#C5CFDA', hoverBackground: '#1F2D3B', selectedBackground: '#24364A', selectedColor: '#FFFFFF' },
  },
});
export const theme = themes.light;
