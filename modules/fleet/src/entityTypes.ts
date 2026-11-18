// The record types this module owns (manifest hook `entityTypes`), until 2026-11-13 NPM's central npm-base entityConfig.ts
//. `ENTITY_CONFIG` is what the pages of this module read; the list may also hold lower modules' types.
import type { EntityTypeConfig } from '@rbp/core';

import { ENTITY_CONFIG as COMPANY_TYPES } from '@rbp/module-companies/src/entityTypes.ts';
export const ENTITY_CONFIG = {
  vessels: { label: 'Vessel', pluralLabel: 'Fleet', listPath: '/vessels', notes: true, attachments: true },
  hull_events: { label: 'Hull Event', pluralLabel: 'Hull Events', listPath: '/hull-events', notes: true, attachments: true },
  newbuilding_projects: { label: 'Newbuilding Project', pluralLabel: 'Newbuilding', listPath: '/newbuildings', notes: true, attachments: true },
  companies: COMPANY_TYPES.companies,
} satisfies Record<string, EntityTypeConfig>;
