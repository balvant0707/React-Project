import type { Plugin } from 'vite';
export function serviceWorker(options: { appName: string; publicDir?: string; gate?: boolean }): Plugin;
export function pdfWorker(): Plugin;
