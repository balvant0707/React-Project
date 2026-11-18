import { addLocale, startApp } from '@rbp/core/gate';
import { PublicReport } from '@rbp/module-tickets/src/pages/report/index.tsx';
import reportLocales from '@rbp/module-tickets/src/reportLocales.json';
import { themes } from './theme';
import { brand } from './brand';

// The QR report form needs no sign-in (layout 'public' of the tickets module): behind the code gate it is part of the public
// entry, so its texts (only the form's, not all of the tickets module's) are added here; the module adds the same ones when the app loads.
addLocale('en', reportLocales.en);
addLocale('de', reportLocales.de);

startApp({
  appName: 'COMPASS', themes, brand,
  publicRoutes: [{ path: '/report/:token', element: <PublicReport /> }],
  // Offline use: restore the device cache before the first render. Not persisted: the whole asset tree, signed URLs and PDF
  // blobs (the pinned asset files have their own cache, wiped with this one). Imported here, not at the top, because
  // @rbp/core is the whole app: behind the code gate it may only be loaded once the gate is open.
  prepare: async () => {
    const { restoreOfflineCache } = await import('@rbp/core');
    await restoreOfflineCache({
      key: 'compass-query-cache',
      notPersisted: ['assets-overview-all', 'signed-url', 'pdf-blob'],
      onClear: () => import('@rbp/module-task-family/src/offline/files.ts').then((m) => m.clearPinnedFiles()),
    });
  },
  loadApp: () => import('./app'),
});
