import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { IconAlertTriangle, IconBriefcase, IconCertificate, IconId } from '@tabler/icons-react';
import { addLocale, defineModule } from '@rbp/core';
import { LanguagesSetting } from './settings/languagesSetting';
import locales from './locales.json';
import './search';
import { AssetInstructions } from './pages/operatingInstructions/parts';

// People (COMPASS phase 4): the directory with HR data, org chart, positions and job descriptions, fit reviews, trainings and
// sessions, operating instructions. Pages ported 1:1 from COMPASS; the print views run
// without the shell (layout 'print'). Puts an asset's operating instructions into the asset page (slot assets.instructions).
addLocale('en', locales.en);
addLocale('de', locales.de);

const NAV = { size: 18, stroke: 1.8 };
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const PeoplePage = lazyPage(() => import('./pages/people/index'), 'PeoplePage');
const PersonShow = lazyPage(() => import('./pages/people/show'), 'PersonShow');
const PhoneListPrint = lazyPage(() => import('./pages/people/phoneListPrint'), 'PhoneListPrint');
const FitReviewPage = lazyPage(() => import('./pages/people/fitReview'), 'FitReviewPage');
const FitReviewPrint = lazyPage(() => import('./pages/people/fitReviewPrint'), 'FitReviewPrint');
const PositionList = lazyPage(() => import('./pages/positions/index'), 'PositionList');
const PositionShow = lazyPage(() => import('./pages/positions/show'), 'PositionShow');
const VersionEditor = lazyPage(() => import('./pages/positions/versionEditor'), 'VersionEditor');
const PositionPrint = lazyPage(() => import('./pages/positions/print'), 'PositionPrint');
const TrainingsPage = lazyPage(() => import('./pages/trainings/index'), 'TrainingsPage');
const TrainingSessionShow = lazyPage(() => import('./pages/trainings/sessionShow'), 'TrainingSessionShow');
const TrainingSessionPrint = lazyPage(() => import('./pages/trainings/sessionPrint'), 'TrainingSessionPrint');
const OperatingInstructionList = lazyPage(() => import('./pages/operatingInstructions/index'), 'OperatingInstructionList');
const OperatingInstructionShow = lazyPage(() => import('./pages/operatingInstructions/show'), 'OperatingInstructionShow');
const InstructionVersionEditor = lazyPage(() => import('./pages/operatingInstructions/versionEditor'), 'InstructionVersionEditor');
const OperatingInstructionPrint = lazyPage(() => import('./pages/operatingInstructions/print'), 'OperatingInstructionPrint');

export default defineModule({
  key: 'people',
  requires: ['assets'],
  // Menu as in COMPASS (navigation.tsx, group "People"); the directory is open to everybody.
  resources: [
    // COMPASS's menu group "People" (declared by people and leave alike: either may be in an app without the other).
    { name: 'people_group', label: 'nav.peopleGroup', icon: <IconId {...NAV} />, menuOrder: -50 },
    { name: 'people', list: '/people', show: '/people/:id', label: 'people.title', icon: <IconId {...NAV} />, parent: 'people_group', menuOrder: -50 },
    { name: 'positions', list: '/positions', show: '/positions/:id', label: 'positions.title', icon: <IconBriefcase {...NAV} />, permission: 'job_descriptions.view', parent: 'people_group', menuOrder: -49 },
    { name: 'trainings', list: '/trainings', label: 'trainings.title', icon: <IconCertificate {...NAV} />, permission: 'trainings.view', parent: 'people_group', menuOrder: -48 },
    { name: 'operating_instructions', list: '/operating-instructions', show: '/operating-instructions/:id', label: 'operatingInstructions.title', icon: <IconAlertTriangle {...NAV} />, permission: 'operating_instructions.view', parent: 'people_group', menuOrder: -47 },
  ],
  routes: [
    { path: '/people', element: page(PeoplePage) },
    { path: '/people/org', element: <Navigate to="/people?view=org" replace /> },
    { path: '/people/:id', element: page(PersonShow) },
    { path: '/people/:id/fit-review', element: page(FitReviewPage) },
    { path: '/positions', element: page(PositionList) },
    { path: '/positions/:id', element: page(PositionShow) },
    { path: '/positions/:id/versions/:versionId', element: page(VersionEditor) },
    { path: '/trainings', element: page(TrainingsPage) },
    { path: '/trainings/sessions/:id', element: page(TrainingSessionShow) },
    { path: '/operating-instructions', element: page(OperatingInstructionList) },
    { path: '/operating-instructions/:id', element: page(OperatingInstructionShow) },
    { path: '/operating-instructions/:id/versions/:versionId', element: page(InstructionVersionEditor) },
    { path: '/positions/:id/print', element: page(PositionPrint), layout: 'print' },
    { path: '/operating-instructions/:id/print', element: page(OperatingInstructionPrint), layout: 'print' },
    { path: '/trainings/sessions/:id/print', element: page(TrainingSessionPrint), layout: 'print' },
    { path: '/people/phone-list', element: page(PhoneListPrint), layout: 'print' },
    { path: '/people/:id/fit-review/print', element: page(FitReviewPrint), layout: 'print' },
  ],
  recordSlots: [
    { slot: 'admin.settings.modules', key: 'people', order: 0, label: 'appSettings.operatingInstructions' },
    { slot: 'admin.settings.editors', key: 'operating_instruction_languages', order: 0, label: 'appSettings.instructionLanguages', value: { hint: 'appSettings.instructionLanguagesHint' }, Component: LanguagesSetting },
    // This module's chapters of the manual (help module, slot help.chapters).
    { slot: 'help.chapters', key: 'people', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) },
    { slot: 'task-family.module', key: 'people', order: 0 },
    { slot: 'assets.instructions', key: 'people', order: 0, Component: AssetInstructions },
  ],
});
