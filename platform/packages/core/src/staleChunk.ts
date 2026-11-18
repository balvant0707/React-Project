// From COMPASS app/src/main.tsx (changed: storage key; installed by importing @rbp/core). After a deploy an open tab asks
// for chunks that are gone: reload once; the time stamp stops a reload loop on a really broken chunk.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'rbp-chunk-reload';
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(key) ?? 0);
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // No session storage: reload anyway, the loop guard is lost.
  }
  if (Date.now() - last < 10_000) return;
  event.preventDefault();
  window.location.reload();
});

export {};
