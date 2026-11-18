// Ported 1:1 from COMPASS (app/src/offline/reportOutbox.ts).
import { createStore, del, entries, set } from "idb-keyval";

// Outbox of the public QR report form: a report made without reception waits here (IndexedDB, with its photo)
// and is sent when the connection is back. The client id makes a repeated send harmless (the Edge Function
// answers with the ticket that already exists).
const store = createStore("cmms-report-outbox", "reports");

type QueuedReport = {
  id: string;
  token: string;
  title: string;
  // Platform (andon): the type key the reporter picked (empty = an older queued report).
  type?: string;
  description: string;
  reporter_name: string;
  reporter_contact: string;
  photo: Blob | null;
  photoName: string | null;
  queuedAt: number;
};

export const newClientRequestId = () => crypto.randomUUID();

export const queueReport = (report: QueuedReport) => set(report.id, report, store);
export const queuedCount = async () => (await entries(store)).length;

export function buildBody(r: Pick<QueuedReport, "id" | "token" | "title" | "type" | "description" | "reporter_name" | "reporter_contact"> & { photo?: Blob | null; photoName?: string | null; website?: string }) {
  const body = new FormData();
  body.set("token", r.token);
  body.set("title", r.title);
  if (r.type) body.set("type", r.type);
  body.set("description", r.description);
  body.set("reporter_name", r.reporter_name);
  body.set("reporter_contact", r.reporter_contact);
  body.set("website", r.website ?? ""); // honeypot, left empty by humans
  body.set("client_request_id", r.id);
  if (r.photo) body.set("photo", r.photo, r.photoName ?? "photo");
  return body;
}

// Sends everything queued. Returns how many reports were delivered. A report the server rejects for good
// (4xx other than rate limiting) is dropped so it cannot block the queue; network errors and 429/5xx keep it.
export async function flushReportOutbox(endpoint: string): Promise<number> {
  if (!navigator.onLine) return 0;
  let sent = 0;
  for (const [key, value] of await entries<string, QueuedReport>(store)) {
    try {
      const res = await fetch(endpoint, { method: "POST", body: buildBody(value) });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        await del(key, store);
        if (res.ok) sent++;
      }
    } catch {
      break; // still no connection
    }
  }
  return sent;
}
