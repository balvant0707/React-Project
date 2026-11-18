// Emits sw.js with the list of build files to precache and a build id (so a new build installs a new worker).
// Taken over from COMPASS vite.config.ts. Use: plugins: [react(), serviceWorker({ appName: 'COMPASS', publicDir: 'branding' })]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const PDF_WORKER = '/pdf.worker.min.mjs';

export function serviceWorker({ appName, publicDir = 'public', gate = false }) {
  return {
    name: 'rbp-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      // The PDF viewer (pdf.js chunk + worker, ~1.5 MB) is not precached on every phone: it is cached the first time it is used.
      const isPdfChunk = (f) => {
        const item = bundle[f];
        return item.type === 'chunk' && Object.keys(item.modules).some((m) => m.includes('pdfjs-dist') || m.includes('react-pdf'));
      };
      let built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !isPdfChunk(f) && `/${f}` !== PDF_WORKER).map((f) => `/${f}`);
      const publicFiles = readdirSync(publicDir).filter((f) => f !== 'pdf.worker.min.mjs').map((f) => `/${f}`);

      // Code gate (docs/code-gate.md): the Pages Function serves the JS and CSS under /static/ only with the gate cookie, except
      // what the public entry needs (sign-in pages). That set is the entry chunk and everything it imports statically. The service
      // worker precaches only the public files on install (it has no cookie yet); the others are listed in a gated file it fetches
      // after sign-in ('warm-gated' message).
      let gatedList = null;
      if (gate) {
        const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
        const byName = new Map(chunks.map((c) => [c.fileName, c]));
        const open = new Set();
        const visit = (name) => {
          const chunk = byName.get(name);
          if (!chunk || open.has(name)) return;
          open.add(name);
          chunk.imports.forEach(visit);
          for (const css of chunk.viteMetadata?.importedCss ?? []) open.add(css);
        };
        chunks.filter((c) => c.isEntry).forEach((c) => visit(c.fileName));
        const publicBuilt = built.filter((f) => open.has(f.slice(1)) || !/\.(js|mjs|css)$/.test(f));
        const gatedBuilt = built.filter((f) => !publicBuilt.includes(f));
        const buildId = createHash('sha256').update(gatedBuilt.join('|')).digest('hex').slice(0, 12);
        gatedList = `/static/precache-gated-${buildId}.json`;
        this.emitFile({ type: 'asset', fileName: gatedList.slice(1), source: JSON.stringify(gatedBuilt) });
        this.emitFile({ type: 'asset', fileName: '_gate.json', source: JSON.stringify({ public: [...open].map((f) => `/${f}`) }) });
        built = publicBuilt;
      }

      const files = ['/', ...built, ...publicFiles];
      const template = readFileSync(fileURLToPath(new URL('../sw/sw.js', import.meta.url)), 'utf8');
      const build = createHash('sha256').update(files.join('|') + (gatedList ?? '') + template).digest('hex').slice(0, 12);
      const source = template.replace('__APP__', appName.toLowerCase()).replace('__BUILD__', build).replace('__PRECACHE__', JSON.stringify(files)).replace('__GATED_LIST__', JSON.stringify(gatedList));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// The pdf.js worker as a static /pdf.worker.min.mjs (messaging pdfPreview.tsx), served untouched in dev (Vite's HMR client
// would break it) and emitted by the build, from react-pdf's own pdfjs-dist. After COMPASS scripts/copy-pdf-worker.mjs.
export function pdfWorker() {
  const require = createRequire(import.meta.url);
  const file = () => {
    const fromReactPdf = createRequire(require.resolve('react-pdf'));
    return readFileSync(fromReactPdf.resolve('pdfjs-dist/build/pdf.worker.min.mjs'));
  };
  let build = false;
  return {
    name: 'rbp-pdf-worker',
    configResolved(config) {
      build = config.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use(PDF_WORKER, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(file());
      });
    },
    buildStart() {
      // Every build, also `vite build --watch`; the dev server hands the file out itself.
      if (!build) return;
      this.emitFile({ type: 'asset', fileName: PDF_WORKER.slice(1), source: file() });
    },
  };
}
