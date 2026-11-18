import { supabaseClient } from "../supabase";

// Lists show dozens of private photos (avatars, item thumbnails) at once: collect the paths requested in the same tick
// and sign them with one request per bucket. A failed request resolves every waiter of its batch with null (the
// caller shows a placeholder or the offline copy); none is left hanging.
export const SIGNED_URL_EXPIRES_IN = 3600;

export function signedUrlBatcher(bucket: string, expiresIn = SIGNED_URL_EXPIRES_IN) {
  let queue = new Map<string, ((url: string | null) => void)[]>();

  const flush = async () => {
    const batch = queue;
    queue = new Map();
    let urls = new Map<string, string>();
    try {
      const { data } = await supabaseClient.storage.from(bucket).createSignedUrls([...batch.keys()], expiresIn);
      urls = new Map((data ?? []).flatMap((row) => (row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : [])));
    } catch {
      // Every waiter of this batch gets null below.
    }
    for (const [path, waiters] of batch) for (const resolve of waiters) resolve(urls.get(path) ?? null);
  };

  return (path: string) =>
    new Promise<string | null>((resolve) => {
      if (queue.size === 0) setTimeout(() => void flush(), 10);
      queue.set(path, [...(queue.get(path) ?? []), resolve]);
    });
}
