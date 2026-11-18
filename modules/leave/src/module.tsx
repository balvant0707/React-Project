import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { IconBeach, IconCalendarOff, IconId } from '@tabler/icons-react';
import { addLocale, defineModule } from '@rbp/core';
import { registerPurposeUi } from '@rbp/module-task-family/src/modules/purposes.tsx';
import { registerLeaveSentences } from './feed/eventSentences';
import locales from './locales.json';
import { AbsenceDecisionCard } from './modules/absences/decisionCard';
import { LeavePanel } from './modules/absences/taskPanel';
import { useInvalidateLeave } from './modules/absences/useLeave';

// Leave (COMPASS phase 4): absences with their types, leave requests as tasks of the purpose "leave", the team planner and its
// rules, public holidays per site. Pages ported 1:1 from COMPASS.
addLocale('en', locales.en);
addLocale('de', locales.de);

// The purpose "leave" on the generic task pages (COMPASS modules/purposes.tsx, entry leave).
registerPurposeUi('leave', { DecisionCard: AbsenceDecisionCard, TaskPanel: LeavePanel }, useInvalidateLeave);

// COMPASS's history sentences for the leave events.
registerLeaveSentences();
const NAV = { size: 18, stroke: 1.8 };
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const LeavePage = lazyPage(() => import('./modules/absences/leavePage'), 'LeavePage');
const AbsenceTypeList = lazyPage(() => import('./modules/absences/typesAdmin'), 'AbsenceTypeList');
const HolidaysPage = lazyPage(() => import('./pages/admin/holidays/index'), 'HolidaysPage');

export default defineModule({
  key: 'leave',
  requires: ['workflows'],
  // Everybody who may request leave sees the page (all COMPASS roles hold leave.create.created).
  resources: [
    // COMPASS's menu group "People" (declared by people and leave alike: either may be in an app without the other).
    { name: 'people_group', label: 'nav.peopleGroup', icon: <IconId {...NAV} />, menuOrder: -50 },
    { name: 'leave', list: '/leave', label: 'leave.title', icon: <IconBeach {...NAV} />, permission: 'leave.create', parent: 'people_group', menuOrder: -46 },
    { name: 'absence_types', list: '/admin/absence-types', label: 'configuration.absence_types.title', title: 'configuration.absence_types.title', parent: 'admin_configuration', admin: true, hidden: true },
    { name: 'holidays', list: '/admin/holidays', label: 'configuration.holidays.title', title: 'configuration.holidays.title', parent: 'admin_configuration', admin: true, hidden: true },
  ],
  routes: [
    { path: '/leave', element: page(LeavePage) },
    { path: '/admin/absence-types', element: page(AbsenceTypeList) },
    { path: '/admin/holidays', element: page(HolidaysPage) },
  ],
  configurationCards: [
    { key: 'absence-types', to: '/admin/absence-types', title: 'configuration.absence_types.title', description: 'configuration.absence_types.description', icon: <IconBeach {...NAV} /> },
    { key: 'holidays', to: '/admin/holidays', title: 'configuration.holidays.title', description: 'configuration.holidays.description', icon: <IconCalendarOff {...NAV} /> },
  ],
  recordSlots: [
    { slot: 'admin.settings.modules', key: 'leave', order: 0, label: 'appSettings.leave' },
    { slot: 'admin.settings.editors', key: 'leave_max_absent_pct', order: 0, label: 'appSettings.leaveMaxAbsentPct', value: { hint: 'appSettings.leaveMaxAbsentPctHint' } },
    { slot: 'admin.settings.editors', key: 'leave_min_allowed_absent', order: 0, label: 'appSettings.leaveMinAllowedAbsent', value: { hint: 'appSettings.leaveMinAllowedAbsentHint' } },
    // This module's chapters of the manual (help module, slot help.chapters).
    { slot: 'help.chapters', key: 'leave', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) },
    { slot: 'task-family.module', key: 'leave', order: 0 },
  ],
});
