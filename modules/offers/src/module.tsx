import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { FileTextOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { addLocale, defineModule } from '@rbp/core';
import { SettingOutlined } from '@ant-design/icons';
import { ENTITY_CONFIG } from './entityTypes';
import './fieldLabels';
import { HullEventOrdersButton, HullEventSpecifications, seastockTimelineSource } from './fleetSlots/fleetSlots';
import './search';
import locales from './locales.json';
// Permission sentences of the Grants page; RADAR is English only.
addLocale('en', locales.en);

// NPM specifications, offers and orders, transports, availability, handover.
// It puts its parts into the fleet pages through the slots fleet offers (modules/fleet/src/module.tsx).
const lazyNamed = <P extends object>(load: () => Promise<Record<string, unknown>>, name: string) => {
  const C = lazy(async () => ({ default: (await load())[name] as ComponentType<P> }));
  return (props: P) => <Suspense fallback={null}><C {...props} /></Suspense>;
};
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const SpecificationList = lazyPage(() => import('./pages/specifications/list'), 'SpecificationList');
const SpecificationShow = lazyPage(() => import('./pages/specifications/show'), 'SpecificationShow');
const OrderList = lazyPage(() => import('./pages/orders/list'), 'OrderList');
const OrderShow = lazyPage(() => import('./pages/orders/show'), 'OrderShow');
const SeastockOffersPanel = lazyNamed<{ vesselId: string }>(() => import('./pages/vessels/seastockOffersPanel'), 'SeastockOffersPanel');
const VesselOrdersPanel = lazyNamed<{ vesselId: string }>(() => import('./pages/vessels/vesselOrdersPanel'), 'VesselOrdersPanel');

// NPM configuration pages of this module (Admin > Configuration cards, admin only like in NPM).
const AdminPortList = lazy(async () => ({ default: (await import('./pages/admin/ports/list')).PortList as ComponentType }));
const AdminSpecAreaList = lazy(async () => ({ default: (await import('./pages/admin/specAreas/list')).SpecAreaList as ComponentType }));
const AdminDefaultSupplierList = lazy(async () => ({ default: (await import('./pages/admin/defaultSuppliers/list')).DefaultSupplierList as ComponentType }));

export default defineModule({
  key: 'offers',
  entityTypes: ENTITY_CONFIG,
  requires: ['companies', 'products', 'fleet'],
  // Menu as in NPM: after Shipyards, before Products (menuOrder 100). Pages ported 1:1; the email parts
  // go through emailBridge/emailBridge.tsx (filled by the email module).
  resources: [
    { name: 'ports', list: '/admin/ports', label: 'Ports', title: 'Ports', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'spec_areas', list: '/admin/spec-areas', label: 'Areas', title: 'Areas', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'default_suppliers', list: '/admin/default-suppliers', label: 'Default suppliers', title: 'Default suppliers', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'specifications', list: '/specifications', show: '/specifications/:id', label: ENTITY_CONFIG.specifications.pluralLabel, icon: <FileTextOutlined />, permission: 'specifications.view', menuOrder: 50 },
    { name: 'orders', list: '/orders', show: '/orders/:id', label: 'Offers & Orders', icon: <ShoppingCartOutlined />, permission: 'orders.view', menuOrder: 51 },
  ],
  routes: [
    { path: '/admin/ports', element: <Suspense fallback={null}><AdminPortList /></Suspense> },
    { path: '/admin/spec-areas', element: <Suspense fallback={null}><AdminSpecAreaList /></Suspense> },
    { path: '/admin/default-suppliers', element: <Suspense fallback={null}><AdminDefaultSupplierList /></Suspense> },
    { path: '/specifications', element: page(SpecificationList) },
    { path: '/specifications/:id', element: page(SpecificationShow) },
    { path: '/orders', element: page(OrderList) },
    { path: '/orders/:id', element: page(OrderShow) },
  ],
  recordSlots: [
    { slot: 'vessels.tabs', key: 'seastock', order: 10, label: 'Seastock Offers', Component: SeastockOffersPanel },
    { slot: 'vessels.tabs', key: 'orders', order: 20, label: 'Orders', Component: VesselOrdersPanel },
    { slot: 'vessels.timeline', key: 'seastock', order: 10, value: seastockTimelineSource },
    { slot: 'hull_events.show.actions', key: 'orders', order: 10, Component: HullEventOrdersButton },
    { slot: 'hull_events.show.sections', key: 'specifications', order: 10, Component: HullEventSpecifications },
  ],
  configurationCards: [
    { key: 'ports', to: '/admin/ports', title: 'Ports', description: 'Ports with their country and continent - picking one on an offer fills both.', icon: <SettingOutlined /> },
    { key: 'spec-areas', to: '/admin/spec-areas', title: 'Areas', description: 'Hull areas used on Drydock specifications - immersion and antifouling zone.', icon: <SettingOutlined /> },
    { key: 'default-suppliers', to: '/admin/default-suppliers', title: 'Default suppliers', description: 'The supplier an offer gets by default for its delivery country, per Owner Associate.', icon: <SettingOutlined /> },
  ],
});
