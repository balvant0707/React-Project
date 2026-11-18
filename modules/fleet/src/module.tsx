import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { ApartmentOutlined, BuildOutlined, CompassOutlined, RocketOutlined, ToolOutlined } from '@ant-design/icons';
import { addLocale, defineModule, RecordRedirect } from '@rbp/core';
import { SettingOutlined } from '@ant-design/icons';
import { ENTITY_CONFIG } from './entityTypes';
import './fieldLabels';
import { buildInFiltersUrl } from '@rbp/module-companies/src/utils/crossFilterNav.ts';
import './search';
import locales from './locales.json';
// Permission sentences of the Grants page; RADAR is English only.
addLocale('en', locales.en);

// NPM fleet: vessels, hull events, newbuildings, shipyards and the company list/page with their fleet numbers.
// Pages are ported 1:1 from the NPM tool; loaded lazily like in the NPM App.tsx.
// Slots this module's pages offer to the modules above it (RecordSlotItem, docs/module-dependencies.md rule 6):
//   vessels.tabs               tabs on a saved vessel's page; Component gets { vesselId }
//   vessels.timeline           value: VesselTimelineSource (pages/vessels/vesselTimeline.tsx), extra dated timeline entries
//   hull_events.show.actions   header buttons of the hull event page; Component gets { hullEventId, eventTypeCode }
//   hull_events.show.sections  below the details of a DD/NB/SS hull event; Component gets { hullEventId }
const lazyNamed = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;

const CompanyList = lazyNamed(() => import('./pages/companies/list'), 'CompanyList');
const CompanyEdit = lazyNamed(() => import('./pages/companies/edit'), 'CompanyEdit');
const VesselList = lazyNamed(() => import('./pages/vessels/list'), 'VesselList');
const VesselEdit = lazyNamed(() => import('./pages/vessels/edit'), 'VesselEdit');
const HullEventList = lazyNamed(() => import('./pages/hullEvents/list'), 'HullEventList');
const HullEventShow = lazyNamed(() => import('./pages/hullEvents/show'), 'HullEventShow');
const HullEventEdit = lazyNamed(() => import('./pages/hullEvents/edit'), 'HullEventEdit');
const NewbuildingList = lazyNamed(() => import('./pages/newbuildings/list'), 'NewbuildingList');
const NewbuildingShow = lazyNamed(() => import('./pages/newbuildings/show'), 'NewbuildingShow');
const ShipyardList = lazyNamed(() => import('./pages/shipyards/list'), 'ShipyardList');

// Sidebar "World Fleet" link: the vessels list prefiltered to the active, larger commercial fleet (the plain /vessels route
// stays unfiltered). 1:1 from the NPM App.tsx.
const WORLD_FLEET_URL = buildInFiltersUrl('/vessels', [
  { field: 'status', values: ['In Service/Commission', 'In Service'] },
  {
    field: 'ship_type_group',
    values: ['Container', 'Bulk Carrier', 'Cruise', 'Gas Carrier', 'General Cargo', 'Passenger / Ferry', 'Ro-Ro / Vehicle Carrier', 'Tanker'],
  },
]) + '&filters[2][field]=deadweight_tonnage&filters[2][operator]=gte&filters[2][value]=3000&pageSize=100&currentPage=1&sorters[0][field]=name&sorters[0][order]=asc';

// Sidebar "Companies" link: the company list prefiltered to average DWT >= 1000 (gte, as the filter bar shows and clears only
// gte/lte), keeping the list's default group-company filter and DWT sort (URL filters replace the list's initial ones).
// The plain /companies route stays unfiltered.
const COMPANIES_URL = '/companies?filters[0][field]=is_group_company&filters[0][operator]=eq&filters[0][value]=true'
  + '&filters[1][field]=dwt_average&filters[1][operator]=gte&filters[1][value]=1000'
  + '&pageSize=100&currentPage=1&sorters[0][field]=dwt_sum&sorters[0][order]=desc';

// NPM configuration pages of this module (Admin > Configuration cards, admin only like in NPM).
const AdminShipTypeGroupList = lazy(async () => ({ default: (await import('./pages/admin/shipTypeGroups/list')).ShipTypeGroupList as ComponentType }));

export default defineModule({
  key: 'fleet',
  entityTypes: ENTITY_CONFIG,
  requires: ['companies', 'products'],
  // Menu order and labels as in the NPM App.tsx. Vessels, companies and shipyards are open to everyone; hull events and
  // newbuildings need a view literal in any scope (NPM accessControlProvider).
  resources: [
    { name: 'ship_type_groups', list: '/admin/ship-type-groups', label: 'Ship type groups', title: 'Ship type groups', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'companies', list: '/companies', show: '/companies/:id', label: ENTITY_CONFIG.companies.pluralLabel, icon: <ApartmentOutlined />, menuLink: COMPANIES_URL },
    // Menu/breadcrumb label "World Fleet"; the list page's own title stays ENTITY_CONFIG.vessels.pluralLabel ("Fleet").
    { name: 'vessels', list: '/vessels', show: '/vessels/:id', label: 'World Fleet', icon: <RocketOutlined />, menuLink: WORLD_FLEET_URL },
    {
      name: 'hull_events', list: '/hull-events', show: '/hull-events/:id', create: '/hull-events/new', edit: '/hull-events/:id/edit',
      label: ENTITY_CONFIG.hull_events.pluralLabel, icon: <CompassOutlined />, permission: 'hull_events.view',
    },
    // Newbuilding projects (table newbuilding_projects) have their own permission module (newbuildings.*).
    { name: 'newbuildings', list: '/newbuildings', show: '/newbuildings/:id', label: 'Newbuilding', icon: <BuildOutlined />, permission: 'newbuildings.view' },
    { name: 'shipyards', list: '/shipyards', label: 'Shipyards', icon: <ToolOutlined /> },
  ],
  routes: [
    { path: '/admin/ship-type-groups', element: <Suspense fallback={null}><AdminShipTypeGroupList /></Suspense> },
    { path: '/companies', element: page(CompanyList) },
    { path: '/companies/:id', element: page(CompanyEdit) },
    { path: '/vessels', element: page(VesselList) },
    { path: '/vessels/:id', element: page(VesselEdit) },
    // Links the database builds from the entity type ('/hull_events/<id>', conversation_link / notifications).
    { path: '/hull_events/:id', element: <RecordRedirect to="/hull-events" /> },
    { path: '/newbuilding_projects/:id', element: <RecordRedirect to="/newbuildings" /> },
    { path: '/hull-events', element: page(HullEventList) },
    { path: '/hull-events/new', element: page(HullEventEdit) },
    { path: '/hull-events/:id', element: page(HullEventShow) },
    { path: '/hull-events/:id/edit', element: page(HullEventEdit) },
    { path: '/newbuildings', element: page(NewbuildingList) },
    { path: '/newbuildings/:id', element: page(NewbuildingShow) },
    { path: '/shipyards', element: page(ShipyardList) },
  ],
  // The companies list reads companies_list(p_ship_type_groups) while its Ship Type chip is set (NPM dataProvider.ts).
  listRpcs: {
    companies_overview: { rpc: 'companies_list', argFilters: { ship_type_groups: 'p_ship_type_groups' } },
    vessels_overview: {
      rpc: 'vessels_list',
      argFilters: {},
      orKeyArgs: { companyRoles: 'p_any', group_owner: 'p_owner', ship_manager: 'p_ship_manager', technical_manager: 'p_technical_manager', operator: 'p_operator' },
    },
    hull_events_overview: { rpc: 'hull_events_list', argFilters: {}, orKeyArgs: { companyAny: 'p_company' } },
  },
  configurationCards: [
    { key: 'ship-type-groups', to: '/admin/ship-type-groups', title: 'Ship type groups', description: 'Group the many SeaWeb ship types into coarser categories for lists and filters.', icon: <SettingOutlined /> },
  ],
});
