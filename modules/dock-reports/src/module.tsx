import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { FileDoneOutlined } from '@ant-design/icons';
import { addLocale, defineModule, RecordRedirect } from '@rbp/core';
import { ENTITY_CONFIG } from './entityTypes';
import './fieldLabels';
import { HullEventDockReportButton } from './fleetSlots/hullEventDockReportButton';
import locales from './locales.json';
// Permission sentences of the Grants page; RADAR is English only.
addLocale('en', locales.en);

// NPM dock reports (offline-first editing, daily journal, photos, signatures, PDFs). Pages ported 1:1 from NPM.
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const DockReportList = lazyPage(() => import('./pages/dockReports/list'), 'DockReportList');
const DockReportShow = lazyPage(() => import('./pages/dockReports/show'), 'DockReportShow');

export default defineModule({
  key: 'dock-reports',
  entityTypes: ENTITY_CONFIG,
  requires: ['companies', 'products', 'fleet', 'offers'],
  // Menu as in NPM: after Offers & Orders, before Products.
  resources: [
    { name: 'dock_reports', list: '/dock-reports', show: '/dock-reports/:id', label: ENTITY_CONFIG.dock_reports.pluralLabel, icon: <FileDoneOutlined />, permission: 'dock_reports.view', menuOrder: 52 },
  ],
  routes: [
    { path: '/dock_reports/:id', element: <RecordRedirect to="/dock-reports" /> },
    { path: '/dock-reports', element: page(DockReportList) },
    { path: '/dock-reports/:id', element: page(DockReportShow) },
  ],
  recordSlots: [{ slot: 'hull_events.show.actions', key: 'dock-report', order: 20, Component: HullEventDockReportButton }],
});
