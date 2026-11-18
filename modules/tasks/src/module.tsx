import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { ApartmentOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { addLocale, defineModule } from '@rbp/core';
import locales from './locales.json';
import { registerTaskSentences } from './feed/eventSentences';
import { ENTITY_CONFIG } from './entityTypes';
import './search';
import { CompanyTasks, HullEventTasks, OrderTasks, SpecificationTasks } from './components/recordTasks';
import { RoleTaskTypesCell, copyRoleTaskTypes } from './components/roleTaskTypes';

// Tasks (COMPASS task engine on the platform, NPM WP 13): task list and page, a Tasks tab on the records of the app
// (record slots offered by the record modules; this module imports none of them). Generic: requires no domain module.
addLocale('en', locales.en);
addLocale('de', locales.de);
// COMPASS's history sentences for the task events (both apps).
registerTaskSentences();

const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const TaskList = lazyPage(() => import('./pages/tasks/list'), 'TaskList');
const TaskShow = lazyPage(() => import('./pages/tasks/show'), 'TaskShow');
const TaskTypeList = lazyPage(() => import('./pages/admin/taskTypes/list'), 'TaskTypeList');
const TaskTypeEdit = lazyPage(() => import('./pages/admin/taskTypes/edit'), 'TaskTypeEdit');

export default defineModule({
  key: 'tasks',
  requires: [],
  entityTypes: ENTITY_CONFIG,
  resources: [
    { name: 'tasks', list: '/tasks', show: '/tasks/:id', label: 'Tasks', icon: <CheckSquareOutlined />, permission: 'tasks.view', menuOrder: -80 },
    // Task types and routes (COMPASS Admin > Task types): the admin, or a holder of task_types.edit (own types / all).
    { name: 'task_types', list: '/admin/task-types', show: '/admin/task-types/:id', label: 'Task types', title: 'Task types', parent: 'admin_configuration', admin: true, permission: 'task_types.edit', hidden: true },
  ],
  routes: [
    { path: '/tasks', element: page(TaskList) },
    { path: '/tasks/:id', element: page(TaskShow) },
    { path: '/admin/task-types', element: page(TaskTypeList) },
    { path: '/admin/task-types/:id', element: page(TaskTypeEdit) },
  ],
  configurationCards: [
    { key: 'task-types', to: '/admin/task-types', title: 'Task types', description: 'Kinds of tasks and their routes: steps, who works each step, the decisions.', icon: <ApartmentOutlined /> },
  ],
  // Slot names are offered by the record pages (offers: specifications.tabs, orders.tabs; fleet: companies.tabs,
  // hull_events.show.sections). In an app without those modules the slots are simply never asked for.
  recordSlots: [
    { slot: 'specifications.tabs', key: 'tasks', order: 50, label: 'Tasks', Component: SpecificationTasks },
    { slot: 'orders.tabs', key: 'tasks', order: 50, label: 'Tasks', Component: OrderTasks },
    { slot: 'companies.tabs', key: 'tasks', order: 50, label: 'Tasks', Component: CompanyTasks },
    { slot: 'hull_events.show.sections', key: 'tasks', order: 50, Component: HullEventTasks },
    // Admin > Roles: the task types a role may start (COMPASS roles page).
    { slot: 'admin.roles.columns', key: 'task-types', order: 10, label: 'admin.roleTaskTypes', Component: RoleTaskTypesCell },
    { slot: 'admin.roles.copy', key: 'task-types', order: 10, value: copyRoleTaskTypes },
  ],
});
