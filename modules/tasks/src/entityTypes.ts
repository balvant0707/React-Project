// The record types this module owns (manifest hook `entityTypes`), until 2026-11-13 NPM's central npm-base entityConfig.ts
//. `ENTITY_CONFIG` is what the pages of this module read; the list may also hold lower modules' types.
import type { EntityTypeConfig } from '@rbp/core';

export const ENTITY_CONFIG = {
  tasks: { label: 'Task', pluralLabel: 'Tasks', listPath: '/tasks', notes: true, attachments: false },
} satisfies Record<string, EntityTypeConfig>;
