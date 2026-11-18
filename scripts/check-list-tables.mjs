// Guards the list-page table convention (platform/packages/ui/src/ListTable.tsx): a raw antd `<Table ... sticky={...}>`
// misaligns its sticky header with the body on sparse data, so every sticky table goes through <ListTable>.
// Fails when `sticky=` is used anywhere except the component itself. Taken over from the NPM tool.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'dist', '.git', 'local']);
const allowed = new Set([path.join('platform', 'packages', 'ui', 'src', 'ListTable.tsx')]);
const bad = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const rel = path.relative(root, p);
    if (!rel.endsWith('.tsx') || allowed.has(rel)) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => { if (/\bsticky\s*=/.test(line)) bad.push(`${rel}:${i + 1}`); });
  }
};
walk(root);
if (bad.length) { console.error('Raw sticky table, use <ListTable> from @rbp/ui:\n' + bad.join('\n')); process.exit(1); }
console.log('list tables ok');
