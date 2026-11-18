// Ported 1:1 from COMPASS (app/src/offline/files.ts).
import { supabaseClient } from "@rbp/core";

// Files (PDFs: manuals, inspection protocols) kept on the device for offline reading. The Cache API holds the
// bytes; a small index in localStorage remembers which assets are "available offline" and which paths belong to them.
const CACHE = "compass-pinned-files";
const INDEX_KEY = "compass.offline-pins";

type Index = Record<string, string[]>; // asset id -> storage paths

const readIndex = (): Index => {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "{}") as Index;
  } catch {
    return {};
  }
};
const writeIndex = (index: Index) => {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* storage may be blocked */
  }
};
const urlFor = (path: string) => `/offline-file/${path.split("/").map(encodeURIComponent).join("/")}`;

export const isPinned = (assetId: string) => assetId in readIndex();

export async function getCachedFile(path: string): Promise<Blob | null> {
  try {
    const hit = await (await caches.open(CACHE)).match(urlFor(path));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

async function storeFile(path: string): Promise<boolean> {
  const cache = await caches.open(CACHE);
  if (await cache.match(urlFor(path))) return true;
  const { data, error } = await supabaseClient.storage.from("attachments").download(path);
  if (error || !data) return false;
  await cache.put(urlFor(path), new Response(data, { headers: { "Content-Type": data.type || "application/octet-stream" } }));
  return true;
}

// Marks an asset as available offline and downloads its documents. Returns how many files could not be stored.
export async function pinAsset(assetId: string, paths: string[]): Promise<number> {
  if (paths.length > 0) {
    // Warm the service worker cache with the PDF viewer (pdf.js chunk + worker) so PDFs open offline.
    await Promise.all([import("@rbp/module-messaging/src/pdfPreview.tsx"), fetch("/pdf.worker.min.mjs")]).catch(() => undefined);
  }
  let failed = 0;
  for (const path of paths) if (!(await storeFile(path).catch(() => false))) failed++;
  writeIndex({ ...readIndex(), [assetId]: paths });
  return failed;
}

export async function unpinAsset(assetId: string) {
  const index = readIndex();
  const paths = index[assetId] ?? [];
  delete index[assetId];
  writeIndex(index);
  const stillNeeded = new Set(Object.values(index).flat());
  const cache = await caches.open(CACHE);
  await Promise.all(paths.filter((p) => !stillNeeded.has(p)).map((p) => cache.delete(urlFor(p))));
}

export async function clearPinnedFiles() {
  try {
    localStorage.removeItem(INDEX_KEY);
    await caches.delete(CACHE);
  } catch {
    /* ignore */
  }
}

// Downloads documents that were added since the asset was pinned (called when the asset page loads online).
export async function refreshPinnedAsset(assetId: string, paths: string[]) {
  if (!isPinned(assetId)) return;
  await pinAsset(assetId, paths);
}
