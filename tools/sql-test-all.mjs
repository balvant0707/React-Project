#!/usr/bin/env node
// Runs the SQL tests that belong to one app: platform/sql/tests plus modules/<m>/sql/tests of every module in
// apps/<app>/app.config.json. A test file may say in its first lines
//   -- requires: <module>, <module>     skipped unless the app has all of them
//   -- apps: <app>, <app>               skipped on other apps (a test that needs an app's seed data)
// Perf probes (*_perf.sql, *_lists.sql) are listed, not run (tools/perf.sh, or --perf here).
// Usage: node tools/sql-test-all.mjs <app> [--list] [--perf] [name-filter]      (npm run test:sql -- <app>)
// Runs each file through tools/sql-test.sh against the local stack (supabase start in apps/<app>, db reset first).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [app, filter] = args.filter((a) => !a.startsWith('--'));
if (!app || !fs.existsSync(path.join(root, 'apps', app, 'app.config.json'))) {
  console.error('usage: node tools/sql-test-all.mjs <app> [--list] [--perf] [name-filter]'); process.exit(2);
}
const modules = JSON.parse(fs.readFileSync(path.join(root, 'apps', app, 'app.config.json'), 'utf8')).modules;
const header = (file, key) => {
  const line = fs.readFileSync(file, 'utf8').split('\n', 20).find((l) => l.startsWith(`-- ${key}:`));
  return line ? line.slice(key.length + 4).split(',').map((s) => s.trim()).filter(Boolean) : [];
};
const sources = [['platform', path.join(root, 'platform/sql/tests')], ...modules.map((m) => [m, path.join(root, 'modules', m, 'sql/tests')])];
const run = [], perf = [], skipped = [];
for (const [owner, dir] of sources) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const file = path.join(dir, f);
    if (filter && !`${owner}/${f}`.includes(filter)) continue;
    const apps = header(file, 'apps'), requires = header(file, 'requires').filter((r) => !modules.includes(r));
    if (apps.length && !apps.includes(app)) { skipped.push(`${owner}/${f} (apps: ${apps.join(', ')})`); continue; }
    if (requires.length) { skipped.push(`${owner}/${f} (requires ${requires.join(', ')})`); continue; }
    (/_(perf|lists)\.sql$/.test(f) && !flags.has('--perf') ? perf : run).push({ owner, f, file });
  }
}
if (flags.has('--list')) {
  for (const t of run) console.log(`run   ${t.owner}/${t.f}`);
  for (const t of perf) console.log(`perf  ${t.owner}/${t.f}`);
  for (const s of skipped) console.log(`skip  ${s}`);
  process.exit(0);
}
const failed = [];
for (const t of run) {
  const r = spawnSync('bash', [path.join(root, 'tools/sql-test.sh'), app, t.file], { encoding: 'utf8' });
  const ok = r.status === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t.owner}/${t.f}`);
  if (!ok) { failed.push(t); console.log((r.stdout + r.stderr).split('\n').slice(-8).map((l) => '       ' + l).join('\n')); }
}
console.log(`\n${run.length - failed.length}/${run.length} passed on ${app}; ${perf.length} perf probe(s) and ${skipped.length} test(s) skipped (--list shows them)`);
process.exit(failed.length ? 1 : 0);
