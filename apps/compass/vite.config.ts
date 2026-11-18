import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { pdfWorker, serviceWorker } from '@rbp/core/vite';

// publicDir is the app's own branding folder: favicons, icons, manifest.
export default defineConfig(({ mode }) => ({
  plugins: [react(), pdfWorker(), serviceWorker({ appName: 'COMPASS', publicDir: 'branding', gate: loadEnv(mode, '.', 'VITE_').VITE_GATE === '1' })],
  publicDir: 'branding',
  build: { assetsDir: 'static' }, // /assets would collide with app routes of asset modules
  server: { port: 5273, strictPort: true },
}));
