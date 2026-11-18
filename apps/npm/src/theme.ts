import { createThemes } from '@rbp/ui';

// RADAR (NPM tool) CI. Values from the NPM app (npm_tool/app/src/theme.ts).
const BRAND = '#2952E3';

export const themes = createThemes({
  light: {
    token: { colorPrimary: BRAND, borderRadius: 6, colorBorderSecondary: '#EDEDED' },
    layout: { sider: '#FFFFFF', header: '#FFFFFF', body: '#FAFAFA' },
    menu: {
      color: 'rgba(0, 0, 0, 0.65)', hoverBackground: '#F5F5F5', hoverColor: 'rgba(0, 0, 0, 0.88)',
      selectedBackground: 'transparent', selectedColor: BRAND,
    },
  },
  dark: {
    token: { colorPrimary: BRAND, borderRadius: 6 },
    menu: { selectedBackground: 'transparent', selectedColor: '#7B93FF' },
  },
});
export const theme = themes.light;
