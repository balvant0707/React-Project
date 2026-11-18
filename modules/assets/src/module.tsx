import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { IconAdjustments, IconSitemap } from '@tabler/icons-react';
import { addLocale, defineModule } from '@rbp/core';
import { TaskTypeSetting } from '@rbp/module-task-family/src/settings/settingsEditors.tsx';
import { registerAssetFeedNames } from './feed/assetNames';
import { registerAssetSentences } from './feed/eventSentences';
import locales from './locales.json';
import './search';

// Assets (COMPASS phase 4): the asset tree with types, attributes, QR labels, documents, the assigned_assets scope; series by
// operating hours. Pages ported 1:1 from COMPASS. The asset page offers the slots
// assets.ticketForm (tickets), assets.itemsTab and assets.maintenanceSummary (items), assets.instructions (people).
addLocale('en', locales.en);
addLocale('de', locales.de);

// Asset names in the history sentences (task moved to an asset, asset moved).
registerAssetFeedNames();
registerAssetSentences();
const NAV = { size: 18, stroke: 1.8 };
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const AssetList = lazyPage(() => import('./pages/assets/list'), 'AssetList');
const AssetShow = lazyPage(() => import('./pages/assets/show'), 'AssetShow');
const AssetLabels = lazyPage(() => import('./pages/assets/labels'), 'AssetLabels');
const AssetTypeList = lazyPage(() => import('./pages/admin/assetTypes/list'), 'AssetTypeList');
const AssetAttributeList = lazyPage(() => import('./pages/admin/assetAttributes/list'), 'AssetAttributeList');

// COMPASS App.tsx: the old flat list URL.
const AssetListRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={`/assets?view=flat${search ? `&${search.slice(1)}` : ""}`} replace />;
};

export default defineModule({
  key: 'assets',
  requires: ['workflows'],
  // Menu as in COMPASS (navigation.tsx, group "Assets").
  resources: [
    // COMPASS's menu group "Assets & items" (items and statistics hang in from the items module).
    { name: 'assets_group', label: 'nav.assetsGroup', icon: <IconSitemap {...NAV} />, menuOrder: -60 },
    { name: 'assets', list: '/assets', show: '/assets/:id', label: 'nav.assets', icon: <IconSitemap {...NAV} />, permission: 'assets.view', parent: 'assets_group', menuOrder: -60 },
    { name: 'asset_types', list: '/admin/asset-types', label: 'configuration.asset_types.title', title: 'configuration.asset_types.title', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'asset_attributes', list: '/admin/asset-attributes', label: 'configuration.asset_attributes.title', title: 'configuration.asset_attributes.title', parent: 'admin_configuration', admin: true, hidden: true },
  ],
  routes: [
    { path: '/assets', element: page(AssetList) },
    { path: '/assets/labels', element: page(AssetLabels) },
    { path: '/assets/list', element: <AssetListRedirect /> },
    { path: '/assets/:id', element: page(AssetShow) },
    { path: '/admin/asset-types', element: page(AssetTypeList) },
    { path: '/admin/asset-attributes', element: page(AssetAttributeList) },
  ],
  configurationCards: [
    { key: 'asset-types', to: '/admin/asset-types', title: 'configuration.asset_types.title', description: 'configuration.asset_types.description', icon: <IconSitemap {...NAV} /> },
    { key: 'asset-attributes', to: '/admin/asset-attributes', title: 'configuration.asset_attributes.title', description: 'configuration.asset_attributes.description', icon: <IconAdjustments {...NAV} /> },
  ],
  // The task pages show the asset field, the asset column and series by operating hours once this module is in the app.
  recordSlots: [
    { slot: 'admin.settings.modules', key: 'assets', order: 0, label: 'nav.assets' },
    { slot: 'admin.settings.editors', key: 'default_asset_task_type_id', order: 0, label: 'appSettings.defaultAssetTaskType', value: { hint: 'appSettings.defaultAssetTaskTypeHint' }, Component: TaskTypeSetting },
    // This module's chapters of the manual (help module, slot help.chapters).
    { slot: 'help.chapters', key: 'assets', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) },
    { slot: 'task-family.module', key: 'assets', order: 0 },
  ],
});
