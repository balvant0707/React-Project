// Ported 1:1 from COMPASS (supabase/functions/public-ticket-report/index.ts).
// Public QR-scan ticket form backend. No login: anyone who scans the sticker on a machine can
// report a problem. Deliberately narrow:
//   GET  ?token=<qr token>  -> the asset's name and the types the page may offer (key + name, nothing else; platform: no location)
//   POST multipart form     -> inserts ONE ticket (+ optional photo); no read/update path exists
//                              (optional client_request_id makes a repeated send of a queued report idempotent)
// Abuse protection: rate limit per token and per IP (public_report_rate_limit_hit), a honeypot
// field, strict size/type validation. Runs with the service role; verify_jwt is off in config.toml.
import { createClient } from "npm:@supabase/supabase-js@2";
import { clientIp, sha256 } from "../_shared/clientIp.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const RATE_WINDOW_SECONDS = 3600;
const MAX_PER_TOKEN = 30;
const MAX_PER_IP = 20;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// The declared MIME type comes from the client: check the file's first bytes too.
async function looksLikeImage(file: File) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  switch (file.type) {
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8;
    case "image/png": return b[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/heic": return ascii(4, 8) === "ftyp";
    default: return false;
  }
}

// Opening the form (GET) only counts against the IP: a busy machine's sticker is scanned far more often than
// reports are sent, and anyone who has seen the sticker could otherwise use up the token's budget and block reports.
async function allowed(token: string, req: Request, countToken: boolean) {
  const [byToken, byIp] = await Promise.all([
    countToken
      ? supabase.rpc("public_report_rate_limit_hit", {
        p_bucket_key: `token:${await sha256(token)}`,
        p_window_seconds: RATE_WINDOW_SECONDS,
        p_max_requests: MAX_PER_TOKEN,
      })
      : Promise.resolve({ data: true }),
    supabase.rpc("public_report_rate_limit_hit", {
      p_bucket_key: `ip:${await sha256(clientIp(req))}`,
      p_window_seconds: RATE_WINDOW_SECONDS,
      p_max_requests: MAX_PER_IP,
    }),
  ]);
  return byToken.data === true && byIp.data === true;
}

const validToken = (token: unknown): token is string =>
  typeof token === "string" && /^[0-9a-f]{64}$/.test(token);

const clean = (value: FormDataEntryValue | null, max: number) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

// Platform (andon): the types the no-login page may offer. Opt-in per type (ticket_types.public_report, default off), always of the
// Maintenance queue (the queue every QR report goes to). Only what the page needs leaves this function.
async function publicTypes() {
  const { data } = await supabase
    .from("ticket_types")
    .select("key, name, name_de, default_priority, ticket_queues!inner(key)")
    .eq("ticket_queues.key", "maintenance")
    .eq("active", true)
    .eq("public_report", true)
    .order("sort_order");
  return data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token");
      if (!validToken(token)) return json({ error: "not_found" }, 404);
      if (!(await allowed(token, req, false))) return json({ error: "rate_limited" }, 429);
      const { data } = await supabase
        .from("assets")
        .select("name, status")
        .eq("qr_code_token", token)
        .maybeSingle();
      if (!data || data.status === "decommissioned") return json({ error: "not_found" }, 404);
      const types = (await publicTypes()).map((x) => ({ key: x.key, name: x.name, name_de: x.name_de }));
      return json({ asset: { name: data.name }, types });
    }

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const form = await req.formData();
    const token = form.get("token");
    if (!validToken(token)) return json({ error: "not_found" }, 404);

    // Honeypot: a human never sees this field. Pretend success, store nothing.
    if (clean(form.get("website"), 200)) return json({ ok: true });

    if (!(await allowed(token, req, true))) return json({ error: "rate_limited" }, 429);

    // Platform (andon): the reporter picks a type. Without one (a report queued by an older page) it is an incident. A type must be
    // one the page may offer; an unknown one (switched off since the report was queued) falls back to an incident, so a queued report
    // is never rejected for it (the outbox drops rejected reports).
    const typeKey = clean(form.get("type"), 60);
    const type = typeKey ? (await publicTypes()).find((x) => x.key === typeKey) : undefined;
    const title = clean(form.get("title"), 200) ?? type?.name ?? null;
    const description = clean(form.get("description"), 4000);
    if (!title) return json({ error: "title_required" }, 400);

    const photo = form.get("photo");
    let photoFile: File | null = null;
    if (photo instanceof File && photo.size > 0) {
      if (!PHOTO_TYPES[photo.type]) return json({ error: "photo_type" }, 400);
      if (photo.size > MAX_PHOTO_BYTES) return json({ error: "photo_too_large" }, 400);
      if (!(await looksLikeImage(photo))) return json({ error: "photo_type" }, 400);
      photoFile = photo;
    }

    const { data: asset } = await supabase
      .from("assets")
      .select("id, status")
      .eq("qr_code_token", token)
      .maybeSingle();
    if (!asset || asset.status === "decommissioned") return json({ error: "not_found" }, 404);

    // A phone without reception queues the report and may send it twice: the client id makes it idempotent.
    const requestId = clean(form.get("client_request_id"), 36);
    if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) {
      const { data: existing } = await supabase
        .from("tickets")
        .select("ticket_number")
        .eq("client_request_id", requestId)
        .maybeSingle();
      if (existing) return json({ ok: true, ticket_number: existing.ticket_number });
    }

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        client_request_id: requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : null,
        asset_id: asset.id,
        type: type?.key ?? "incident",
        ...(type?.default_priority ? { priority: type.default_priority } : {}),
        source: "qr_public",
        title,
        description,
        reporter_name: clean(form.get("reporter_name"), 100),
        reporter_contact: clean(form.get("reporter_contact"), 200),
      })
      .select("id, ticket_number")
      .single();
    if (error || !ticket) {
      console.error("ticket insert failed", error);
      return json({ error: "server_error" }, 500);
    }

    if (photoFile) {
      const path = `tickets/${ticket.id}/${crypto.randomUUID()}.${PHOTO_TYPES[photoFile.type]}`;
      const upload = await supabase.storage.from("attachments").upload(path, photoFile, {
        contentType: photoFile.type,
      });
      if (!upload.error) {
        // Show the photo inside the ticket's first feed entry (the "ticket created" event).
        const { data: entry } = await supabase
          .from("activity_events")
          .select("id")
          .eq("entity_type", "tickets")
          .eq("entity_id", ticket.id)
          .eq("event_type", "ticket_created")
          .maybeSingle();
        const { error: attachError } = await supabase.from("attachments").insert({
          entity_type: "tickets",
          entity_id: ticket.id,
          event_id: entry?.id ?? null,
          storage_path: path,
          file_name: `photo.${PHOTO_TYPES[photoFile.type]}`,
          mime_type: photoFile.type,
          size_bytes: photoFile.size,
          uploaded_by_user_id: null,
        });
        if (attachError) console.error("photo attachment failed", attachError);
      } else {
        console.error("photo upload failed", upload.error);
      }
    }

    return json({ ok: true, ticket_number: ticket.ticket_number });
  } catch (err) {
    console.error(err);
    return json({ error: "server_error" }, 500);
  }
});
