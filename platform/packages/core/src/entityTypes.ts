import type { EntityTypeConfig, ModuleManifest } from './module';

// Registry of the record types the loaded modules own (manifest hook `entityTypes`). Filled once by RefineRoot; read by the notes
// panel and the list helpers, which know a record only by its entity type key. From NPM's central entityConfig.ts, which now
// lives per module.
const types = new Map<string, EntityTypeConfig>();

export const registerEntityTypes = (modules: ModuleManifest[]) => {
  for (const m of modules) for (const [key, config] of Object.entries(m.entityTypes ?? {})) types.set(key, config);
};

export const getEntityType = (key: string): EntityTypeConfig | undefined => types.get(key);

/** Like getEntityType, but a key no loaded module registered logs a warning in development (a typo or a missing `entityTypes` entry would otherwise just switch notes and attachments off). */
export const requireEntityType = (key: string): EntityTypeConfig | undefined => {
  const config = types.get(key);
  if (!config && import.meta.env?.DEV) console.warn(`Entity type "${key}" is not registered by any module (manifest hook entityTypes).`);
  return config;
};
