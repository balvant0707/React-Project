// The record types this module owns (manifest hook `entityTypes`), until 2026-11-13 NPM's central npm-base entityConfig.ts
//. `ENTITY_CONFIG` is what the pages of this module read; the list may also hold lower modules' types.
import type { EntityTypeConfig } from '@rbp/core';

export const ENTITY_CONFIG = {
  companies: { label: 'Company', pluralLabel: 'Companies', listPath: '/companies', notes: true, attachments: true },
  tenants: { label: 'Tenant', pluralLabel: 'Tenants', listPath: null, notes: true, attachments: false },
} satisfies Record<string, EntityTypeConfig>;
