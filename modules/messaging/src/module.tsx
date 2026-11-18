import { addLocale, defineModule } from '@rbp/core';
import { NotificationBell, NotificationsPage } from './notifications/NotificationBell';
import { NotificationToaster } from './notifications/NotificationToaster';
import { MessagesPage } from './pages/MessagesPage';
import { MessagesNavIcon } from './chats/navIcon';
import locales from './locales.json';
import './styles.css';
import './search';
import { IconMessageCircle } from '@tabler/icons-react';
import { Badge } from 'antd';
import { useInboxUnread } from './hooks/useMessages';
import { NotesPanelProvider } from './notes/notesPanelContext';
import { NotesPanel } from './notes/notesPanel';
import { NotesHeaderButton } from './notes/notesHeaderButton';

addLocale('en', locales.en);
addLocale('de', locales.de);

export { registerRecordCard } from './feed/cards';
export type { RecordCardType } from './feed/cards';
export { registerEventSentence, registerFieldLabels } from './feed/eventText';
export { registerFeedNames } from './feed/useFeedContext';
export { registerEntityIcon } from './lib/entityIcons';
export { ActivityFeed } from './feed/activityFeed';
export { PanelChat, StickyPanelChat } from './feed/panelChat';
export { RecordChatButton } from './feed/recordChatButton';
// The record notes panel beside the page (state, frame, header button), from NPM; a page opts in with useEntityNotes (detail) or
// useListNotes (list), so an app whose pages never call them shows nothing of it.
export { useEntityNotes, useListNotes, useNotesPanel } from './notes/notesPanelContext';

// Messaging UI of the platform (the database part lives in the platform core): notifications, conversations (direct, group,
// team posts, record chats), polls, reactions. Record modules use ActivityFeed / PanelChat / RecordChatButton and register
// what is theirs: card kinds, event sentences, record icons.
// The Messages tab of the phone's bottom bar with the number of conversations that have something unread.
const MessagesTabIcon = ({ size, stroke, color }: { size: number; stroke: number; color: string }) => {
  const unread = useInboxUnread();
  return <Badge count={unread} size="small" overflowCount={99} offset={[4, 0]}><IconMessageCircle size={size} stroke={stroke} color={color} /></Badge>;
};

export default defineModule({
  key: 'messaging',
  providers: [NotesPanelProvider],
  contentAside: NotesPanel,
  routes: [
    { path: '/notifications', element: <NotificationsPage /> },
    { path: '/messages', element: <MessagesPage /> },
    { path: '/messages/:id', element: <MessagesPage /> },
  ],
  resources: [
    { name: 'messages', list: '/messages', show: '/messages/:id', label: 'nav.messages', icon: <MessagesNavIcon />, menuOrder: -95 },
    { name: 'notifications', list: '/notifications', label: 'Notifications', hidden: true },
  ],
  phoneTabs: [{ key: 'messages', order: 20, to: '/messages', label: 'nav.messages', icon: (props) => <MessagesTabIcon {...props} /> }],
  headerItems: [
    { key: 'notes', order: 5, element: <NotesHeaderButton /> },
    { key: 'notifications', order: 20, phone: true, element: <><NotificationBell /><NotificationToaster /></> },
  ],
  // The manual's chapter on messages (copied 1:1 from COMPASS app/src/help/<language>/17-messages.md; help module, slot help.chapters).
  recordSlots: [{ slot: 'help.chapters', key: 'messaging', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) }],
});
