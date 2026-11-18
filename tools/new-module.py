#!/usr/bin/env python3
"""Creates a module skeleton and wires it into an app.

Usage: python3 tools/new-module.py <key> --requires a,b,c [--app npm] [--deps pkg@ver,...] [--replace oldkey]

Writes modules/<key>/{module.json, package.json, tsconfig.json, src/vite-env.d.ts, src/module.tsx (only if missing)} and adds the
module to apps/<app>: app.config.json, src/modules.ts, package.json, tsconfig.json, plus the root tsconfig.json. --replace drops
another module from that app (not from the repo). Run `npm install` afterwards.
"""
import argparse
import json
import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
BASE_DEPS = {"@rbp/core": "*", "@rbp/ui": "*", "@ant-design/icons": "^5.6.1", "antd": "^5.29.3", "dayjs": "^1.11.13",
             "react": "^19.2.8", "react-router-dom": "^7.18.3"}


def camel(key):
    parts = key.split('-')
    return parts[0] + ''.join(p.title() for p in parts[1:])


def write_json(path, data, inline=False):
    with open(path, 'w') as f:
        json.dump(data, f, indent=None if inline else 2)
        f.write('\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('key')
    ap.add_argument('--requires', default='')
    ap.add_argument('--app', default='npm')
    ap.add_argument('--deps', default='')
    ap.add_argument('--replace', default='')
    a = ap.parse_args()
    requires = [r for r in a.requires.split(',') if r]
    mdir = os.path.join(ROOT, 'modules', a.key)
    os.makedirs(os.path.join(mdir, 'src'), exist_ok=True)
    os.makedirs(os.path.join(mdir, 'sql', 'migrations'), exist_ok=True)
    write_json(os.path.join(mdir, 'module.json'), {"key": a.key, "requires": requires}, inline=True)
    deps = dict(BASE_DEPS)
    for r in requires:
        deps[f'@rbp/module-{r}'] = '*'
    for d in [d for d in a.deps.split(',') if d]:
        name, _, ver = d.rpartition('@') if d.count('@') > (1 if d.startswith('@') else 0) else (d, '', '*')
        deps[name] = ver or '*'
    pkg_path = os.path.join(mdir, 'package.json')
    if os.path.exists(pkg_path):
        old = json.load(open(pkg_path))
        deps = {**old.get('dependencies', {}), **deps}
    write_json(pkg_path, {"name": f"@rbp/module-{a.key}", "version": "0.0.0", "private": True, "type": "module",
                          "exports": {".": "./src/module.tsx", "./src/*": "./src/*"}, "dependencies": deps})
    refs = [{"path": "../../platform/packages/core"}, {"path": "../../platform/packages/ui"}] + [{"path": f"../{r}"} for r in requires]
    write_json(os.path.join(mdir, 'tsconfig.json'), {"extends": "../../tsconfig.base.json",
               "compilerOptions": {"composite": True, "noEmit": False, "emitDeclarationOnly": True, "outDir": "dist"},
               "include": ["src"], "references": refs})
    env = os.path.join(mdir, 'src', 'vite-env.d.ts')
    if not os.path.exists(env):
        open(env, 'w').write('/// <reference types="vite/client" />\n')
    manifest = os.path.join(mdir, 'src', 'module.tsx')
    if not os.path.exists(manifest):
        open(manifest, 'w').write(f"import {{ defineModule }} from '@rbp/core';\n\nexport default defineModule({{ key: '{a.key}', requires: {json.dumps(requires)} }});\n".replace('"', "'"))

    app = os.path.join(ROOT, 'apps', a.app)
    cfg_path = os.path.join(app, 'app.config.json')
    cfg = json.load(open(cfg_path))
    mods = [m for m in cfg['modules'] if m != a.replace]
    if a.key not in mods:
        mods.append(a.key)
    cfg['modules'] = mods
    write_json(cfg_path, cfg, inline=True)

    ts_path = os.path.join(app, 'src', 'modules.ts')
    lines = ["import { resolveModules, type ModuleManifest } from '@rbp/core';"]
    lines += [f"import {camel(m)} from '@rbp/module-{m}';" for m in mods]
    lines += ["", "// Chosen at build time. Keep in sync with app.config.json (tools/compose.mjs --check enforces it).",
              f"export const modules: ModuleManifest[] = resolveModules([{', '.join(camel(m) for m in mods)}]);", ""]
    open(ts_path, 'w').write('\n'.join(lines))

    apkg_path = os.path.join(app, 'package.json')
    apkg = json.load(open(apkg_path))
    d = apkg['dependencies']
    if a.replace:
        d.pop(f'@rbp/module-{a.replace}', None)
    d[f'@rbp/module-{a.key}'] = '*'
    write_json(apkg_path, apkg)

    for tsc in (os.path.join(app, 'tsconfig.json'), os.path.join(ROOT, 'tsconfig.json')):
        t = json.load(open(tsc))
        prefix = '../../modules/' if tsc.startswith(app) else 'modules/'
        refs = t.setdefault('references', [])
        if tsc.startswith(app) and a.replace:
            refs[:] = [r for r in refs if r['path'] != prefix + a.replace]
        if not any(r['path'] == prefix + a.key for r in refs):
            refs.append({"path": prefix + a.key})
        write_json(tsc, t)
    print(f'module {a.key} created and added to apps/{a.app}: {", ".join(mods)}')


if __name__ == '__main__':
    main()
