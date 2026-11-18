// Ported 1:1 from the NPM tool (supabase/functions/_shared/graphMail.ts).
// The Graph calls that turn an email into a sent message: create it as a draft (or as a reply with createReply), add the
// attachments, send it, read the ids of the sent message. No imports, the fetch function is a parameter, so the call
// sequence is unit-tested with a mocked fetch (supabase/tests/graph_mail.test.mjs). trackedMail.ts adds the token and the
// database side.

export const GRAPH = "https://graph.microsoft.com/v1.0";

export type MailAttachment = { name: string; contentType: string; bytes: Uint8Array };

// Graph takes an attachment of up to 3 MB in one request; a bigger one needs an upload session (sent in 4 MB pieces,
// a multiple of 320 KiB as Graph requires). The whole mail may not exceed 25 MB.
export const SIMPLE_ATTACHMENT_MAX = 3 * 1024 * 1024;
export const UPLOAD_CHUNK = 12 * 327_680;
export const MAX_MAIL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type FetchFn = typeof fetch;

export type GraphMailInput = {
  accessToken: string;
  mailboxAddress: string;
  subject: string;
  bodyHtml: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  attachments?: MailAttachment[];
  // Internet message id of the mail answered: the mail is then made with createReply (In-Reply-To / References, same
  // conversation in Outlook); a plain draft when the original cannot be found.
  replyToInternetMessageId?: string;
};

export type GraphSent = { providerMessageId: string | null; internetMessageId: string | null; conversationId: string | null };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function assertGraphOk(res: Response, what: string) {
  if (!res.ok) throw new Error(`Graph ${what} failed: ${res.status} ${await res.text()}`);
}

async function addAttachment(f: FetchFn, url: string, headers: Record<string, string>, a: MailAttachment) {
  if (a.bytes.length <= SIMPLE_ATTACHMENT_MAX) {
    const res = await f(`${url}/attachments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.contentType, contentBytes: toBase64(a.bytes) }),
    });
    await assertGraphOk(res, `attach ${a.name}`);
    return;
  }
  const session = await f(`${url}/attachments/createUploadSession`, {
    method: "POST",
    headers,
    body: JSON.stringify({ AttachmentItem: { attachmentType: "file", name: a.name, size: a.bytes.length, contentType: a.contentType } }),
  });
  await assertGraphOk(session, `start the upload of ${a.name}`);
  const { uploadUrl } = await session.json();
  for (let start = 0; start < a.bytes.length; start += UPLOAD_CHUNK) {
    const end = Math.min(start + UPLOAD_CHUNK, a.bytes.length);
    // The upload URL is pre-authorised: no Authorization header.
    const res = await f(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end - 1}/${a.bytes.length}` },
      body: a.bytes.subarray(start, end),
    });
    await assertGraphOk(res, `upload ${a.name}`);
  }
}

// Throws when the mail could not be sent. A draft that was created but not sent is deleted again.
export async function sendViaGraph(input: GraphMailInput, f: FetchFn = fetch): Promise<GraphSent> {
  const base = `${GRAPH}/users/${encodeURIComponent(input.mailboxAddress)}/messages`;
  // Immutable ids stay the same when the sent mail moves to the Sent Items folder.
  const headers = { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json", Prefer: 'IdType="ImmutableId"' };
  const recipients = (list: string[]) => list.map((address) => ({ emailAddress: { address } }));
  const content = {
    subject: input.subject,
    body: { contentType: "HTML", content: input.bodyHtml },
    toRecipients: recipients(input.to),
    ccRecipients: recipients(input.cc),
    bccRecipients: recipients(input.bcc ?? []),
  };

  let draft: any = null;
  if (input.replyToInternetMessageId) {
    try {
      const filter = encodeURIComponent(`internetMessageId eq '${input.replyToInternetMessageId.replace(/'/g, "''")}'`);
      const found = await f(`${base}?$filter=${filter}&$select=id&$top=1`, { headers });
      const original = found.ok ? (await found.json()).value?.[0]?.id : null;
      if (original) {
        const reply = await f(`${base}/${encodeURIComponent(original)}/createReply`, { method: "POST", headers, body: "{}" });
        if (reply.ok) {
          const replyDraft = await reply.json();
          // The reply draft brings the threading headers; its text, subject and recipients are replaced by ours.
          const patched = await f(`${base}/${encodeURIComponent(replyDraft.id)}`, { method: "PATCH", headers, body: JSON.stringify(content) });
          if (patched.ok) draft = await patched.json();
          else await f(`${base}/${encodeURIComponent(replyDraft.id)}`, { method: "DELETE", headers }).catch(() => undefined);
        }
      }
    } catch (err) {
      console.warn("sendViaGraph: createReply failed, sending a plain mail", err);
    }
  }
  if (!draft) {
    const created = await f(base, { method: "POST", headers, body: JSON.stringify(content) });
    await assertGraphOk(created, "create draft");
    draft = await created.json();
  }

  const draftUrl = `${base}/${encodeURIComponent(draft.id)}`;
  try {
    for (const a of input.attachments ?? []) await addAttachment(f, draftUrl, headers, a);
    const sent = await f(`${draftUrl}/send`, { method: "POST", headers });
    await assertGraphOk(sent, "send");
  } catch (err) {
    await f(draftUrl, { method: "DELETE", headers }).catch(() => undefined);
    throw err;
  }
  // Read the ids again from the sent message: the draft's may be empty or change on send. Best effort - the draft's
  // values stay when the sent message cannot be read yet.
  let final = draft;
  try {
    const res = await f(`${draftUrl}?$select=internetMessageId,conversationId`, { headers });
    if (res.ok) final = { ...draft, ...(await res.json()) };
  } catch { /* keep the draft's ids */ }
  if (!final.internetMessageId) console.warn("sendViaGraph: no internetMessageId for", draft.id, "- replies can only be matched by conversation or token");
  return { providerMessageId: draft.id ?? null, internetMessageId: final.internetMessageId ?? null, conversationId: final.conversationId ?? null };
}
