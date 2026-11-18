import { lazy, Suspense, type ComponentType } from 'react';
import { IconHome } from '@tabler/icons-react';
import { addLocale, defineModule } from '@rbp/core';
import locales from './locales.json';

// COMPASS's start page (~/maintenance_tool/docs/ui-and-navigation.md "Start page"), ported 1:1. Tiles
// and links of tickets, assets, items and leave are gated by those modules' literals.
addLocale('en', locales.en);
addLocale('de', locales.de);

const Home = lazy(async () => ({ default: (await import('./pages/home/index')).Home as ComponentType }));

export default defineModule({
  key: 'home',
  requires: ['task-family', 'messaging'],
  routes: [{ path: '/', element: <Suspense fallback={null}><Home /></Suspense> }],
  // First entry of the menu, as COMPASS's dashboard.
  resources: [{ name: 'home', list: '/', label: 'nav.dashboard', icon: <IconHome size={18} stroke={1.8} />, menuOrder: -100 }],
  recordSlots: [
    // This module's chapters of the manual (help module, slot help.chapters).
    { slot: 'help.chapters', key: 'home', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) },
  ],
});
