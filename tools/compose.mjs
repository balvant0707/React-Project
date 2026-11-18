#!/usr/bin/env node
// Composes the migrations of one app: platform/sql/migrations + modules/<m>/sql/migrations of the modules
// listed in apps/<app>/app.config.json, ordered by file name (timestamp prefix), written to
// apps/<app>/supabase/migrations (generated, git-ignored).
// Usage: node tools/compose.mjs [--check] [app ...]   (--check validates only and writes nothing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.filter((a) => !a.startsWith('--'));
const apps = (only.length ? only : fs.readdirSync(path.join(root, 'apps'))).filter((a) =>
  fs.existsSync(path.join(root, 'apps', a, 'app.config.json')));

const errors = [];
const sqlFiles = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => ({ name: f, file: path.join(dir, f) })) : [];

for (const app of apps) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'apps', app, 'app.config.json'), 'utf8'));
  const chosen = new Set(cfg.modules);
  const files = sqlFiles(path.join(root, 'platform/sql/migrations')).map((f) => ({ ...f, from: 'platform' }));
  for (const key of cfg.modules) {
    const mdir = path.join(root, 'modules', key);
    const mj = path.join(mdir, 'module.json');
    if (!fs.existsSync(mj)) { errors.push(`${app}: module "${key}" has no modules/${key}/module.json`); continue; }
    const meta = JSON.parse(fs.readFileSync(mj, 'utf8'));
    if (meta.key !== key) errors.push(`${app}: modules/${key}/module.json has key "${meta.key}"`);
    for (const r of meta.requires ?? []) if (!chosen.has(r)) errors.push(`${app}: module "${key}" requires "${r}", not in app.config.json`);
    files.push(...sqlFiles(path.join(mdir, 'sql/migrations')).map((f) => ({ ...f, from: key })));
    // src/modules.ts of the app must import the module package
    const srcModules = fs.readFileSync(path.join(root, 'apps', app, 'src/modules.ts'), 'utf8');
    if (!srcModules.includes(`@rbp/module-${key}`)) errors.push(`${app}: src/modules.ts does not import @rbp/module-${key}`);
  }
  const seen = new Map();
  for (const f of files) {
    if (seen.has(f.name)) errors.push(`${app}: migration ${f.name} exists in ${seen.get(f.name)} and ${f.from}`);
    seen.set(f.name, f.from);
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(f.name)) errors.push(`${app}: migration name "${f.name}" must be <14-digit timestamp>_<name>.sql`);
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  if (!check && !errors.length) {
    const out = path.join(root, 'apps', app, 'supabase/migrations');
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    for (const f of files) fs.copyFileSync(f.file, path.join(out, f.name));
    console.log(`${app}: ${files.length} migration(s) -> apps/${app}/supabase/migrations`);
    // Edge Functions: the platform's and those of the chosen modules (modules/<m>/functions/<name>/), plus the notification texts
    // of the bell (notifications.types of the module locale files) for the push function.
    const fnOut = path.join(root, 'apps', app, 'supabase/functions');
    fs.rmSync(fnOut, { recursive: true, force: true });
    const fnSources = [path.join(root, 'platform/functions'), ...cfg.modules.map((k) => path.join(root, 'modules', k, 'functions'))];
    let fnCount = 0;
    for (const dir of fnSources) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) { fs.cpSync(path.join(dir, name), path.join(fnOut, name), { recursive: true }); fnCount++; }
    }
    const texts = { de: {}, en: {} };
    for (const k of cfg.modules) {
      const lf = path.join(root, 'modules', k, 'src/locales.json');
      if (!fs.existsSync(lf)) continue;
      const loc = JSON.parse(fs.readFileSync(lf, 'utf8'));
      for (const lang of ['de', 'en']) Object.assign(texts[lang], loc[lang]?.notifications?.types ?? {});
    }
    if (fnCount) {
      fs.mkdirSync(path.join(fnOut, '_shared'), { recursive: true });
      fs.writeFileSync(path.join(fnOut, '_shared/notification-texts.json'), JSON.stringify(texts, null, 2));
      console.log(`${app}: ${fnCount} edge function(s) -> apps/${app}/supabase/functions`);
    }
  } else if (check) console.log(`${app}: ${files.length} migration(s), modules ${cfg.modules.join(', ')}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
