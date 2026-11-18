// run: node --experimental-strip-types platform/packages/core/src/registry.test.mjs
import assert from 'node:assert/strict';
import { resolveModules } from './registry.ts';
const m = (key, requires) => ({ key, requires });
assert.deepEqual(resolveModules([m('b', ['a']), m('a')]).map((x) => x.key), ['a', 'b']);
assert.throws(() => resolveModules([m('a', ['x'])]), /requires "x"/);
assert.throws(() => resolveModules([m('a', ['b']), m('b', ['a'])]), /Circular/);
assert.throws(() => resolveModules([m('a'), m('a')]), /Duplicate/);
assert.deepEqual(resolveModules([{ key: 'b', optionalRequires: ['a'] }, m('a')]).map((x) => x.key), ['a', 'b'], 'optional comes first');
assert.deepEqual(resolveModules([{ key: 'b', optionalRequires: ['missing'] }]).map((x) => x.key), ['b'], 'missing optional is fine');
console.log('registry ok');
