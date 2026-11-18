import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { MailOutlined } from '@ant-design/icons';
import { addLocale, defineModule } from '@rbp/core';
import './emailRegistration';
import locales from './locales.json';
import { InboxNavIcon } from './components/inboxNavIcon';
import { MailRedirect } from './mailRedirect';
import { GraphTransportFields } from './components/graphTransportFields';
import { SignatureSettings } from './components/signatureSettings';

// NPM email: mailboxes over Microsoft Graph, threads linked to records, shared drafts, the Mail page (/inbox) and the Emails
// tab / document email of offers and orders (via offers' emailBridge).
addLocale('en', locales.en);

const lazyPage = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));
const page = (C: ComponentType): ReactNode => <Suspense fallback={null}><C /></Suspense>;
const InboxList = lazyPage(() => import('./pages/inbox/index'), 'InboxList');
const MailboxList = lazyPage(() => import('./pages/admin/mailboxes/list'), 'MailboxList');

export default defineModule({
  key: 'npm-email',
  requires: ['companies', 'products', 'fleet', 'offers', 'messaging'],
  resources: [
    // Sidebar "Mail": NPM's Notes page reduced to the email threads (one messaging page in RADAR: the platform's Messages,
    // decided 2026-11-10). Route, folder and component names keep "inbox" (links in notifications: /inbox?thread=...).
    { name: 'inbox', list: '/inbox', label: 'Mail', icon: <InboxNavIcon />, permission: 'mail.access', menuOrder: -90 },
    { name: 'mailboxes', list: '/admin/mailboxes', label: 'Mailboxes', title: 'Mailboxes', parent: 'admin_configuration', admin: true, hidden: true },
  ],
  routes: [
    { path: '/inbox', element: page(InboxList) },
    { path: '/mail', element: <MailRedirect /> },
    { path: '/admin/mailboxes', element: page(MailboxList) },
  ],
  // NPM's profile card for the email signature (seeded into new mails and replies).
  profileSections: [{ key: 'email-signature', order: 40, Component: SignatureSettings }],
  // The sender mailbox when the platform's mails go through Graph (core Email settings page).
  recordSlots: [{ slot: 'admin.email.transport', key: 'graph', order: 10, Component: GraphTransportFields }],
  configurationCards: [
    { key: 'mailboxes', to: '/admin/mailboxes', title: 'Mailboxes', description: 'Shared and personal mailboxes connected through Microsoft Graph.', icon: <MailOutlined /> },
  ],
});
