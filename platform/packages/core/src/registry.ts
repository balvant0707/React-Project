import type { ModuleManifest } from './module';
import { registerEntityTypes } from './entityTypes.ts';

/** Orders modules by `requires` and fails on a missing or circular dependency. */
export function resolveModules(modules: ModuleManifest[]): ModuleManifest[] {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  if (byKey.size !== modules.length) throw new Error('Duplicate module key');
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: ModuleManifest[] = [];
  const visit = (key: string, from?: string) => {
    const m = byKey.get(key);
    if (!m) throw new Error(`Module "${from}" requires "${key}", which is not in the app's module list`);
    if (done.has(key)) return;
    if (visiting.has(key)) throw new Error(`Circular module dependency at "${key}"`);
    visiting.add(key);
    (m.requires ?? []).forEach((r) => visit(r, key));
    (m.optionalRequires ?? []).filter((r) => byKey.has(r)).forEach((r) => visit(r, key));
    visiting.delete(key);
    done.add(key);
    out.push(m);
  };
  modules.forEach((m) => visit(m.key));
  registerEntityTypes(out);
  return out;
}
