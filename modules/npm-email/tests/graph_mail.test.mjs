// Ported 1:1 from the NPM tool (supabase/tests/graph_mail.test.mjs); only the import paths changed.
/* global Response */
// The Graph call sequence of an app mail and the draft ownership rule (supabase/functions/_shared/graphMail.ts, draftAccess.ts):
//   node --test modules/npm-email/tests/graph_mail.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { sendViaGraph, SIMPLE_ATTACHMENT_MAX, UPLOAD_CHUNK } from "../functions/_shared/graphMail.ts";
import { usableAsNewComposition } from "../functions/_shared/draftAccess.ts";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// Mock fetch: `routes` is a list of [predicate(method, url), handler]; every call is logged as "METHOD path".
function mockFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url: String(url), body: init.body, headers: init.headers });
    for (const [match, handler] of routes) if (match(method, String(url))) return handler(init);
    return json({ error: "no route" }, 404);
  };
  return { f, calls };
}
const is = (m, part) => (method, url) => method === m && url.includes(part);

const base = { accessToken: "tok", mailboxAddress: "box@example.com", subject: "Hi [REF]", bodyHtml: "<p>x</p>", to: ["a@b.c"], cc: [] };

test("plain mail: create draft, send, read ids again", async () => {
  const { f, calls } = mockFetch([
    [(m, u) => m === "POST" && u.endsWith("/messages"), () => json({ id: "D1", internetMessageId: "<old@x>", conversationId: "C0" })],
    [is("POST", "/send"), () => new Response(null, { status: 202 })],
    [is("GET", "$select=internetMessageId"), () => json({ internetMessageId: "<new@x>", conversationId: "C1" })],
  ]);
  const r = await sendViaGraph(base, f);
  assert.deepEqual(r, { providerMessageId: "D1", internetMessageId: "<new@x>", conversationId: "C1" });
  assert.deepEqual(calls.map((c) => c.method), ["POST", "POST", "GET"]);
  assert.match(calls[0].headers.Prefer, /ImmutableId/);
});

test("reply: createReply then PATCH with our content", async () => {
  const { f, calls } = mockFetch([
    [is("GET", "$filter="), () => json({ value: [{ id: "ORIG" }] })],
    [is("POST", "/ORIG/createReply"), () => json({ id: "R1" })],
    [is("PATCH", "/R1"), () => json({ id: "R1", internetMessageId: "<r@x>", conversationId: "C" })],
    [is("POST", "/R1/send"), () => new Response(null, { status: 202 })],
    [is("GET", "$select=internetMessageId"), () => json({ internetMessageId: "<r@x>", conversationId: "C" })],
  ]);
  const r = await sendViaGraph({ ...base, replyToInternetMessageId: "<o'rig@x>" }, f);
  assert.equal(r.providerMessageId, "R1");
  assert.ok(calls[0].url.includes(encodeURIComponent("internetMessageId eq '<o''rig@x>'")), "quote is escaped");
  assert.deepEqual(JSON.parse(calls.find((c) => c.method === "PATCH").body).subject, "Hi [REF]");
});

test("reply: original not found falls back to a plain draft", async () => {
  const { f, calls } = mockFetch([
    [is("GET", "$filter="), () => json({ value: [] })],
    [(m, u) => m === "POST" && u.endsWith("/messages"), () => json({ id: "D2" })],
    [is("POST", "/D2/send"), () => new Response(null, { status: 202 })],
  ]);
  const r = await sendViaGraph({ ...base, replyToInternetMessageId: "<gone@x>" }, f);
  assert.equal(r.providerMessageId, "D2");
  assert.ok(!calls.some((c) => c.url.includes("createReply")));
});

test("reply: failed PATCH deletes the reply draft and sends a plain mail", async () => {
  const { f, calls } = mockFetch([
    [is("GET", "$filter="), () => json({ value: [{ id: "ORIG" }] })],
    [is("POST", "/ORIG/createReply"), () => json({ id: "R1" })],
    [is("PATCH", "/R1"), () => json({}, 500)],
    [is("DELETE", "/R1"), () => new Response(null, { status: 204 })],
    [(m, u) => m === "POST" && u.endsWith("/messages"), () => json({ id: "D3" })],
    [is("POST", "/D3/send"), () => new Response(null, { status: 202 })],
  ]);
  const r = await sendViaGraph({ ...base, replyToInternetMessageId: "<o@x>" }, f);
  assert.equal(r.providerMessageId, "D3");
  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/R1")));
});

test("attachments: small one inline, big one through an upload session in chunks", async () => {
  const small = { name: "s.txt", contentType: "text/plain", bytes: new Uint8Array(10) };
  const bigSize = SIMPLE_ATTACHMENT_MAX + 1;
  const big = { name: "b.bin", contentType: "application/octet-stream", bytes: new Uint8Array(bigSize) };
  const { f, calls } = mockFetch([
    [(m, u) => m === "POST" && u.endsWith("/messages"), () => json({ id: "D4" })],
    [is("POST", "/D4/attachments/createUploadSession"), () => json({ uploadUrl: "https://upload.example/u1" })],
    [is("POST", "/D4/attachments"), () => json({})],
    [is("PUT", "upload.example"), () => json({})],
    [is("POST", "/D4/send"), () => new Response(null, { status: 202 })],
  ]);
  await sendViaGraph({ ...base, attachments: [small, big] }, f);
  const puts = calls.filter((c) => c.method === "PUT");
  assert.equal(puts.length, Math.ceil(bigSize / UPLOAD_CHUNK));
  assert.equal(puts[0].headers["Content-Range"], `bytes 0-${Math.min(UPLOAD_CHUNK, bigSize) - 1}/${bigSize}`);
  assert.ok(!puts[0].headers.Authorization, "upload URL gets no bearer token");
  assert.equal(JSON.parse(calls.find((c) => c.url.endsWith("/D4/attachments")).body)["@odata.type"], "#microsoft.graph.fileAttachment");
});

test("failed send deletes the draft and throws", async () => {
  const { f, calls } = mockFetch([
    [(m, u) => m === "POST" && u.endsWith("/messages"), () => json({ id: "D5" })],
    [is("POST", "/D5/send"), () => json({}, 500)],
    [is("DELETE", "/D5"), () => new Response(null, { status: 204 })],
  ]);
  await assert.rejects(() => sendViaGraph(base, f), /send failed/);
  assert.ok(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/D5")));
});

test("a draft is usable as a new composition only in its own mailbox and when it is no thread reply", () => {
  assert.equal(usableAsNewComposition({ email_thread_id: null, mailbox_id: "m1" }, "m1"), true);
  assert.equal(usableAsNewComposition({ email_thread_id: "t", mailbox_id: "m1" }, "m1"), false);
  assert.equal(usableAsNewComposition({ email_thread_id: null, mailbox_id: "m2" }, "m1"), false);
  assert.equal(usableAsNewComposition(null, "m1"), false);
});
