import { lazy, Suspense, type ComponentType } from 'react';
import { addLocale, defineModule } from '@rbp/core';
import { SettingOutlined } from '@ant-design/icons';
import { OwnerAssociateField, ShortCodeField } from './components/userAdminFields';
import { ENTITY_CONFIG } from './entityTypes';
import './search';
import locales from './locales.json';
// Permission sentences of the Grants page; RADAR is English only.
addLocale('en', locales.en);

// NPM companies (customers, suppliers, makers, yards ...; tenant-independent) with their owner associate roles: the database slice
// and the loaders other modules use (modules/companies/*). The company list and page show fleet numbers, so they live in the
// fleet module (docs/module-dependencies.md rule 6: integration code lives in the upper module).
// Owner Associates (NPM's tenants: teams with an owner_associate_teams row, SQL 20261110100000_npm_core_delta.sql), their admin
// page (Admin > Configuration) and NPM's person fields on Admin > Users, moved here from npm-base on 2026-11-13
//. The countries table (SQL) and its loaders are here too.
const AdminTenantList = lazy(async () => ({ default: (await import('./pages/admin/tenants/list')).TenantList as ComponentType }));

export default defineModule({
  key: 'companies',
  entityTypes: ENTITY_CONFIG,
  requires: ['messaging'],
  // NPM's person fields on Admin > Users (short code, default Owner Associate).
  recordSlots: [
    { slot: 'admin.users.fields', key: 'short-code', order: 10, value: { column: 'short_code', label: 'Short code' }, Component: ShortCodeField },
    { slot: 'admin.users.fields', key: 'owner-associate', order: 20, value: { column: 'default_team_id', label: 'Default Owner Associate' }, Component: OwnerAssociateField },
  ],
  resources: [{ name: 'tenants', list: '/admin/tenants', label: 'Tenants', title: 'Tenants', parent: 'admin_configuration', admin: true, hidden: true }],
  routes: [{ path: '/admin/tenants', element: <Suspense fallback={null}><AdminTenantList /></Suspense> }],
  configurationCards: [
    { key: 'tenants', to: '/admin/tenants', title: 'Tenants', description: 'Our own selling entities (NPMEU, NPMTR, NPMME, ...) used on specifications, orders and users.', icon: <SettingOutlined /> },
  ],
});
