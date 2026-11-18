// Every app needs its own identity files (docs/architecture.md section 6): no app may show another app's symbols.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// mail-logo.png: the logo at the top of the app's mails (platform/functions), 600 x 140 or the same aspect ratio.
const required = ['manifest.webmanifest', 'mail-logo.png'];
const oneOf = [['favicon.svg', 'favicon.ico'], ['icon-192.png'], ['icon-512.png']];
const errors = [];
const hashes = new Map();
for (const app of fs.readdirSync(path.join(root, 'apps'))) {
  const dir = path.join(root, 'apps', app, 'branding');
  if (!fs.existsSync(dir)) { errors.push(`${app}: no branding/ folder`); continue; }
  const have = new Set(fs.readdirSync(dir));
  for (const f of required) if (!have.has(f)) errors.push(`${app}: branding/${f} missing`);
  for (const group of oneOf) if (!group.some((f) => have.has(f))) errors.push(`${app}: branding/ needs one of ${group.join(' / ')}`);
  const html = fs.readFileSync(path.join(root, 'apps', app, 'index.html'), 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/)?.[1]?.trim();
  if (!title) errors.push(`${app}: index.html has no <title>`);
  for (const f of have) {
    if (!/\.(png|ico|svg)$/.test(f)) continue;
    const h = createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex');
    if (hashes.has(h)) errors.push(`${app}: branding/${f} is identical to ${hashes.get(h)}`);
    hashes.set(h, `${app}/branding/${f}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8'));
  if (title && manifest.name && !manifest.name.includes(title)) errors.push(`${app}: manifest name "${manifest.name}" does not contain the page title "${title}"`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('branding ok');
