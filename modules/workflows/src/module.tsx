import { addLocale, defineModule } from '@rbp/core';
import locales from './locales.json';

addLocale('en', locales.en);
addLocale('de', locales.de);

// Workflows (COMPASS phase 4): task type purposes ("special functions") and workflow hooks. No pages of its own: the task type
// editor (task-family) shows the purpose and hook fields once this module marks itself in the slot task-family.module.
export default defineModule({
  key: 'workflows',
  requires: ['task-family'],
  recordSlots: [{ slot: 'task-family.module', key: 'workflows', order: 0 }],
});
