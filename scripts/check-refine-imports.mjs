// Fails when a file outside platform/packages/core imports @refinedev/* (Refine is encapsulated in the core).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'dist', '.git', 'local']);
const bad = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) continue;
    const rel = path.relative(root, p);
    if (rel.startsWith('platform/packages/core/') || rel.startsWith('scripts/') || rel.startsWith('tools/')) continue;
    if (/(from\s+|import\s*\(|require\s*\()\s*['"]@refinedev\//.test(fs.readFileSync(p, 'utf8'))) bad.push(rel);
  }
};
walk(root);
if (bad.length) { console.error('Refine imported outside @rbp/core:\n' + bad.join('\n')); process.exit(1); }
console.log('refine imports ok');
