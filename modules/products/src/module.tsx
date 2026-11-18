import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { DollarOutlined, InboxOutlined } from '@ant-design/icons';
import { addLocale, defineModule } from '@rbp/core';
import { SettingOutlined } from '@ant-design/icons';
import './fieldLabels';
import './search';
import locales from './locales.json';
// Permission sentences of the Grants page; RADAR is English only.
addLocale('en', locales.en);

// NPM products, packagings and cost prices. Pages are ported 1:1 from the NPM tool.
const lazyNamed = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;

const ProductList = lazyNamed(() => import('./pages/products/list'), 'ProductList');
const ProductEdit = lazyNamed(() => import('./pages/products/edit'), 'ProductEdit');
const CostPriceImport = lazyNamed(() => import('./pages/admin/costPriceImport'), 'CostPriceImport');

// NPM configuration pages of this module (Admin > Configuration cards, admin only like in NPM).
const AdminCoefficientCurveList = lazy(async () => ({ default: (await import('./pages/admin/coefficientCurves/list')).CoefficientCurveList as ComponentType }));

export default defineModule({
  key: 'products',
  requires: ['companies'],
  resources: [
    { name: 'coefficient_curves', list: '/admin/coefficient-curves', label: 'Coefficient curves', title: 'Coefficient curves', parent: 'admin_configuration', admin: true, hidden: true },
    // Open to every signed-in user like in NPM; writes need products.edit/create/delete (RLS).
    // NPM menu: after the fleet, specifications, orders and dock reports, before Admin.
    { name: 'products', list: '/products', show: '/products/:id', label: 'Products', icon: <InboxOutlined />, menuOrder: 100 },
    // Configuration page (NPM: admin only); hidden, reached through its card.
    { name: 'cost_price_import', list: '/admin/cost-price-import', label: 'Cost price import', title: 'Cost price import', parent: 'admin_configuration', admin: true, hidden: true },
  ],
  routes: [
    { path: '/admin/coefficient-curves', element: <Suspense fallback={null}><AdminCoefficientCurveList /></Suspense> },
    { path: '/products', element: page(ProductList) },
    { path: '/products/:id', element: page(ProductEdit) },
    { path: '/admin/cost-price-import', element: page(CostPriceImport) },
  ],
  configurationCards: [
    { key: 'coefficient-curves', to: '/admin/coefficient-curves', title: 'Coefficient curves', description: 'Speed and temperature curves feeding the DFT proposal calculation.', icon: <SettingOutlined /> },
    {
      key: 'cost_price_import',
      to: '/admin/cost-price-import',
      title: 'Cost price import',
      description: 'Upload a supplier price list (IATP export) to add dated cost prices to existing packagings.',
      icon: <DollarOutlined style={{ fontSize: 28 }} />,
    },
  ],
});
