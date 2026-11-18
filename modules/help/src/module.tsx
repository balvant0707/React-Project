import { lazy, Suspense, useMemo, type ComponentType, type PropsWithChildren } from 'react';
import { IconHelp } from '@tabler/icons-react';
import { addLocale, defineModule, useRecordSlot } from '@rbp/core';
import locales from './locales.json';
import { HelpButton } from './components/helpDrawer';
import { loadHelpFiles, setHelpLoaders } from './help/sources';

// Help (platform): COMPASS's manual: a help page with search and the context help drawer in
// the header. The chapters come from the modules of the app: each ships src/help/<language>/NN-slug.md and puts the loaders
// into the slot 'help.chapters'; this module brings the general chapters (getting started, profile, administration, FAQ).
addLocale('en', locales.en);
addLocale('de', locales.de);

type Loaders = Record<string, () => Promise<unknown>>;

// Collects every module's chapters, keyed "./<language>/NN-slug.md" as COMPASS's help/content.ts reads them.
const HelpSources = ({ children }: PropsWithChildren) => {
  const slots = useRecordSlot('help.chapters');
  useMemo(() => {
    const all: Loaders = {};
    for (const s of slots) for (const [path, load] of Object.entries((s.value ?? {}) as Loaders)) all[path.replace(/^.*\/help\//, './')] = load;
    setHelpLoaders(all);
  }, [slots]);
  return children;
};

const HelpPage = lazy(async () => {
  const [, m] = await Promise.all([loadHelpFiles(), import('./pages/help/index')]);
  return { default: m.HelpPage as ComponentType };
});
const page = <Suspense fallback={null}><HelpPage /></Suspense>;

export default defineModule({
  key: 'help',
  providers: [HelpSources],
  resources: [{ name: 'help', list: '/help', show: '/help/:chapter', label: 'help.title', icon: <IconHelp size={18} stroke={1.8} />, menuOrder: 1000 }],
  routes: [
    { path: '/help', element: page },
    { path: '/help/:chapter', element: page },
  ],
  headerItems: [{ key: 'help', order: 10, phone: true, element: <HelpButton /> }],
  recordSlots: [{ slot: 'help.chapters', key: 'help', order: 0, value: import.meta.glob('./help/*/*.md', { query: '?raw', import: 'default' }) }],
});
