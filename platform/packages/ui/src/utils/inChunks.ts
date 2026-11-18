// PostgREST limits: a URL of ~8 KB (`.in("id", [...])` over ~200 uuids fails as a network error) and max_rows = 1000
// per response (the rest is silently dropped).

const CHUNK_SIZE = 100;

// Runs one query per chunk of `ids` and concatenates the rows.
export async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>,
  size = CHUNK_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  for (const results of await Promise.all(chunks.map((chunk) => run(chunk)))) rows.push(...(results.data ?? []));
  return rows;
}

const PAGE = 1000;

// Reads every page of an ordered query (the order must be total, or pages can
// overlap / skip rows).
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
