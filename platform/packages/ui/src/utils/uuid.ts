// From the NPM tool (app/src/utils/uuid.ts), until 2026-11-13 ported into npm-base; now one copy in the platform.
// Client-side UUIDv7 generation - needed only for offline-created rows
// (dock report daily entries/photos/signatures/areas while disconnected,
// see pages/dockReports/offline/). Every table in this app already defaults
// its `id` to `uuid_generate_v7()` server-side; this is the same layout
// (48-bit unix ms timestamp, version 7, variant bits, remaining bits
// random), generated here so an offline row gets its FINAL id immediately
// instead of a temporary local key that would need remapping every foreign
// key that points to it once the row finally reaches the server.
export function uuidv7(): string {
  const ts = Date.now();
  const bytes = new Uint8Array(16);
  bytes[0] = Math.floor(ts / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ts / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ts / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ts / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  const rand = crypto.getRandomValues(new Uint8Array(10));
  bytes[6] = 0x70 | (rand[0] & 0x0f); // version 7
  bytes[7] = rand[1];
  bytes[8] = 0x80 | (rand[2] & 0x3f); // variant 10
  bytes[9] = rand[3];
  bytes[10] = rand[4];
  bytes[11] = rand[5];
  bytes[12] = rand[6];
  bytes[13] = rand[7];
  bytes[14] = rand[8];
  bytes[15] = rand[9];

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
