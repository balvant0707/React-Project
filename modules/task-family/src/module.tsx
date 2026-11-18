import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { IconCalendar, IconCheckbox, IconRoute, IconCirclePlus, IconFlag, IconListCheck, IconRepeat, IconTarget } from '@tabler/icons-react';
import { addLocale, defineModule } from '@rbp/core';
import { FallbackRoleSetting, TaskTypeSetting } from './settings/settingsEditors';
import { registerTaskFamilySentences } from './feed/eventSentences';
import locales from './locales.json';
import './search';
import { ChecklistOutboxStarter } from './queryClient';
import { DecisionsNavIcon } from './components/decisionsNavIcon';
import { ReminderSettings } from './pages/profile/reminders';

// Task family (COMPASS WP T2): COMPASS's own task pages with checklists, recurring series, goals, initiatives and buckets,
// costs, effort, reminders, planning board and decisions. Its /tasks routes and the 'tasks' resource replace those of the
// tasks module (the later module wins, RefineRoot lastByKey); an app without this module keeps the tasks module's pages.
addLocale('en', locales.en);
addLocale('de', locales.de);
// COMPASS's offline banner names the checklist queue (the core's sentence is the NPM tool's generic one).
addLocale('en', { offline: { banner: "You're offline. Saved data is shown. Worksheet entries and photos are kept on this device and sent later; everything else needs a connection." } });
addLocale('de', { offline: { banner: 'Du bist offline. Es werden gespeicherte Daten angezeigt. Arbeitsblatt-Eingaben und Fotos werden auf dem Gerät gespeichert und später gesendet; alles andere braucht eine Verbindung.' } });

const NAV = { size: 18, stroke: 1.6 };
// COMPASS's history sentences for goals and checklists (the task events come with the tasks module).
registerTaskFamilySentences();
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const TaskList = lazyPage(() => import('./pages/tasks/list'), 'TaskList');
const TaskShow = lazyPage(() => import('./pages/tasks/show'), 'TaskShow');
const GoalList = lazyPage(() => import('./pages/goals/list'), 'GoalList');
const GoalShow = lazyPage(() => import('./pages/goals/show'), 'GoalShow');
const InitiativeList = lazyPage(() => import('./pages/initiatives/list'), 'InitiativeList');
const PlanningBoard = lazyPage(() => import('./pages/planning/board'), 'PlanningBoard');
const DecisionsPage = lazyPage(() => import('./pages/decisions/index'), 'DecisionsPage');
const RecurringList = lazyPage(() => import('./pages/recurring/list'), 'RecurringList');
const ChecklistTemplateList = lazyPage(() => import('./pages/checklists/list'), 'ChecklistTemplateList');
const StartPage = lazyPage(() => import('./pages/start/index'), 'StartPage');
// COMPASS's full task type editor (checklists, step items, looks; purposes and hooks with workflows, item mode with items):
// replaces the tasks module's editor, which leaves these parts out (the later module wins).
// One task type list for both apps (the tasks module's, COMPASS's page); the editor stays COMPASS's full one.
const TaskTypeList = lazyPage(() => import('@rbp/module-tasks/src/pages/admin/taskTypes/list.tsx'), 'TaskTypeList');
const TaskTypeEdit = lazyPage(() => import('./pages/admin/taskTypes/edit'), 'TaskTypeEdit');

export default defineModule({
  key: 'task-family',
  requires: ['tasks', 'messaging'],
  providers: [ChecklistOutboxStarter],
  // Menu as in COMPASS (navigation.tsx): decisions on top, then goals, initiatives, tasks, planning, recurring.
  resources: [
    // COMPASS's start page: the task types (and, with the tickets module, the ticket queues) one may start.
    { name: 'start', list: '/start', label: 'nav.start', icon: <IconCirclePlus {...NAV} />, menuOrder: -97 },
    { name: 'decisions', list: '/decisions', label: 'decisions.title', icon: <DecisionsNavIcon />, menuOrder: -90 },
    // COMPASS's menu group "Goals & tasks" (tickets hang in from the tickets module).
    { name: 'work_group', label: 'nav.workGroup', icon: <IconListCheck {...NAV} />, menuOrder: -85 },
    { name: 'goals', list: '/goals', show: '/goals/:id', label: 'nav.goals', icon: <IconTarget {...NAV} />, permission: 'goals.view', parent: 'work_group', menuOrder: -85 },
    { name: 'initiatives', list: '/initiatives', label: 'nav.initiatives', icon: <IconFlag {...NAV} />, permission: 'initiatives.view', parent: 'work_group', menuOrder: -84 },
    { name: 'tasks', list: '/tasks', show: '/tasks/:id', label: 'nav.tasks', icon: <IconListCheck {...NAV} />, permission: 'tasks.view', parent: 'work_group', menuOrder: -80 },
    { name: 'planning', list: '/planning', label: 'nav.planning', icon: <IconCalendar {...NAV} />, permission: 'tasks.view', parent: 'work_group', menuOrder: -79 },
    { name: 'recurring', list: '/recurring', label: 'nav.recurring', icon: <IconRepeat {...NAV} />, permission: 'recurring_tasks.view', parent: 'work_group', menuOrder: -76 },
    // COMPASS keeps task types in the admin menu (the tasks module puts them under Configuration).
    { name: 'task_types', list: '/admin/task-types', show: '/admin/task-types/:id', label: 'configuration.task_types.title', title: 'configuration.task_types.title', icon: <IconRoute {...NAV} />, parent: 'admin', admin: true, permission: 'task_types.edit' },
    { name: 'checklists', list: '/checklists', label: 'nav.checklists', title: 'nav.checklists', icon: <IconCheckbox {...NAV} />, parent: 'admin', admin: true, permission: 'checklist_templates.edit' },
  ],
  routes: [
    { path: '/tasks', element: page(TaskList) },
    { path: '/tasks/:id', element: page(TaskShow) },
    { path: '/goals', element: page(GoalList) },
    { path: '/goals/:id', element: page(GoalShow) },
    { path: '/initiatives', element: page(InitiativeList) },
    { path: '/planning', element: page(PlanningBoard) },
    { path: '/decisions', element: page(DecisionsPage) },
    { path: '/recurring', element: page(RecurringList) },
    { path: '/checklists', element: page(ChecklistTemplateList) },
    { path: '/start', element: page(StartPage) },
    { path: '/admin/task-types', element: page(TaskTypeList) },
    { path: '/admin/task-types/new', element: page(TaskTypeEdit) },
    { path: '/admin/task-types/:id', element: page(TaskTypeEdit) },
  ],
  // COMPASS's phrase lists (item categories and units, document types, ...; Admin > Configuration > Phrases).
  configurationCards: [
  ],
  // Profile: which task reminders one gets (COMPASS pages/profile/reminders.tsx).
  profileSections: [{ key: 'task-reminders', order: 30, Component: ReminderSettings }],
  phoneTabs: [{ key: 'tasks', order: 10, to: '/tasks', label: 'nav.tasks', icon: (props) => <IconListCheck {...props} /> }],
  recordSlots: [
    // Settings page (core): COMPASS's labels and pickers for the task settings (pages/admin/settings in COMPASS).
    { slot: 'admin.settings.modules', key: 'tasks', order: 0, label: 'nav.tasks' },
    { slot: 'admin.settings.editors', key: 'default_due_days', order: 0, label: 'appSettings.defaultDueDays', value: { hint: 'appSettings.defaultDueDaysHint' } },
    { slot: 'admin.settings.editors', key: 'default_task_type_id', order: 0, label: 'appSettings.defaultTaskType', value: { hint: 'appSettings.defaultTaskTypeHint' }, Component: TaskTypeSetting },
    { slot: 'admin.settings.editors', key: 'default_fallback_role_id', order: 0, label: 'appSettings.defaultFallbackRole', value: { hint: 'appSettings.defaultFallbackRoleHint' }, Component: FallbackRoleSetting },
    // This module's chapters of the manual (help module, slot help.chapters).
    { slot: 'help.chapters', key: 'task-family', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) },
  ],
});
