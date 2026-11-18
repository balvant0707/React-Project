import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { IconInbox, IconTicket } from '@tabler/icons-react';
import { addLocale, defineModule } from '@rbp/core';
import { registerTicketSentences } from './feed/eventSentences';
import locales from './locales.json';
import reportLocales from './reportLocales.json';
import andonLocales from './andonLocales.json';
import './search';
import { TicketFormModal } from './pages/tickets/ticketForm';

// Tickets (COMPASS phase 4): ticket queues and types, tickets (internal and from the public QR form), conversion to a task,
// statistics. Pages ported 1:1 from COMPASS. The ticket form goes into the asset page
// (slot assets.ticketForm) and the start page (task-family.start.ticketForm).
addLocale('en', locales.en);
addLocale('de', locales.de);
// The QR report form's texts: apart because the form is a public page that the code gate serves in its public entry (reportLocales.json).
addLocale('en', reportLocales.en);
addLocale('de', reportLocales.de);
// The platform's own texts (kiosk fields of a ticket type); locales.json is generated from COMPASS, so they live apart.
addLocale('en', andonLocales.en);
addLocale('de', andonLocales.de);

// COMPASS's history sentences for the ticket events.
registerTicketSentences();
const NAV = { size: 18, stroke: 1.8 };
const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const TicketList = lazyPage(() => import('./pages/tickets/list'), 'TicketList');
const TicketShow = lazyPage(() => import('./pages/tickets/show'), 'TicketShow');
const TicketQueueList = lazyPage(() => import('./pages/admin/ticketQueues/list'), 'TicketQueueList');
const AndonKiosk = lazyPage(() => import('./pages/kiosk/index'), 'AndonKiosk');
const PublicReport = lazyPage(() => import('./pages/report/index'), 'PublicReport');

export default defineModule({
  key: 'tickets',
  requires: ['assets'],
  resources: [
    { name: 'tickets', list: '/tickets', show: '/tickets/:id', label: 'nav.tickets', icon: <IconTicket {...NAV} />, permission: 'tickets.view', parent: 'work_group', menuOrder: -77 },
    { name: 'ticket_queues', list: '/admin/ticket-queues', label: 'configuration.ticket_queues.title', title: 'configuration.ticket_queues.title', parent: 'admin_configuration', admin: true, hidden: true },
  ],
  routes: [
    { path: '/tickets', element: page(TicketList) },
    { path: '/tickets/:id', element: page(TicketShow) },
    { path: '/admin/ticket-queues', element: page(TicketQueueList) },
    // The shopfloor PC's andon board: signed in as the PC's device user, no shell (docs/andon.md).
    { path: '/andon', element: page(AndonKiosk), layout: 'print' },
    // The QR sticker's form: no sign-in, no shell; talks only to the Edge Function public-ticket-report.
    { path: '/report/:token', element: page(PublicReport), layout: 'public' },
  ],
  configurationCards: [
    { key: 'ticket-queues', to: '/admin/ticket-queues', title: 'configuration.ticket_queues.title', description: 'configuration.ticket_queues.description', icon: <IconInbox {...NAV} /> },
  ],
  recordSlots: [
    // This module's chapters of the manual (help module, slot help.chapters).
    { slot: 'help.chapters', key: 'tickets', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) },
    { slot: 'task-family.module', key: 'tickets', order: 0 },
    { slot: 'task-family.start.ticketForm', key: 'tickets', order: 0, Component: TicketFormModal },
    { slot: 'assets.ticketForm', key: 'tickets', order: 0, Component: TicketFormModal },
  ],
});
