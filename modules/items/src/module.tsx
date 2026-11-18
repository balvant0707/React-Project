import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { IconChartBar, IconPackage } from '@tabler/icons-react';
import { addLocale, defineModule } from '@rbp/core';
import { registerItemSentences } from './feed/eventSentences';
import locales from './locales.json';
import './search';
import { TaskItems } from './components/taskItems';
import { ItemUsageModal, useNeedsItemUsage } from './components/taskItemParts';
import { AssetItemsTab } from './components/assetItems';
import { MaintenanceSummary } from './components/maintenanceSummary';

// Items (COMPASS phase 4): items with suppliers and prices, stock and its locations, material lines of tasks and series,
// ordering tasks, the items of an asset, the maintenance statistics. Pages ported 1:1 from COMPASS
//. Fills the task pages' material slots and the asset page's parts tab and summary.
addLocale('en', locales.en);
addLocale('de', locales.de);

// COMPASS's history sentences for the material order events of a task.
registerItemSentences();
const NAV = { size: 18, stroke: 1.8 };
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const ItemsPage = lazyPage(() => import('./pages/items/index'), 'ItemsPage');
const ItemShow = lazyPage(() => import('./pages/items/show'), 'ItemShow');
const LocationShow = lazyPage(() => import('./pages/items/locationShow'), 'LocationShow');
const LocationLabels = lazyPage(() => import('./pages/items/locationLabels'), 'LocationLabels');
const MaintenanceStatistics = lazyPage(() => import('./pages/maintenance/statistics'), 'MaintenanceStatistics');

export default defineModule({
  key: 'items',
  requires: ['tickets'],
  // Menu as in COMPASS (navigation.tsx, group "Assets"); statistics open with any asset literal (accessControlProvider.ts).
  resources: [
    { name: 'items', list: '/items', show: '/items/:id', label: 'items.title', icon: <IconPackage {...NAV} />, permission: 'items.view', parent: 'assets_group', menuOrder: -59 },
    { name: 'statistics', list: '/maintenance/statistics', label: 'nav.statistics', icon: <IconChartBar {...NAV} />, permission: 'assets.view', parent: 'assets_group', menuOrder: -58 },
  ],
  routes: [
    { path: '/items', element: page(ItemsPage) },
    { path: '/items/locations/labels', element: page(LocationLabels) },
    { path: '/items/locations/:id', element: page(LocationShow) },
    { path: '/items/:id', element: page(ItemShow) },
    { path: '/maintenance/statistics', element: page(MaintenanceStatistics) },
  ],
  recordSlots: [
    // This module's chapters of the manual (help module, slot help.chapters).
    { slot: 'help.chapters', key: 'items', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) },
    { slot: 'task-family.module', key: 'items', order: 0 },
    { slot: 'task-family.taskItems', key: 'items', order: 0, Component: TaskItems },
    { slot: 'task-family.taskItemParts', key: 'items', order: 0, value: { useNeedsItemUsage, ItemUsageModal } },
    { slot: 'assets.itemsTab', key: 'items', order: 0, Component: AssetItemsTab },
    { slot: 'assets.maintenanceSummary', key: 'items', order: 0, Component: MaintenanceSummary },
  ],
});
