// Ported 1:1 from the NPM tool (supabase/tests/reference_token.test.mjs); only the import paths changed.
// Reference tokens of the mails the app sends (supabase/functions/_shared/referenceToken.ts, no Deno needed):
//   node --test modules/npm-email/tests/reference_token.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { bodyWithToken, findReferenceTokens, newReferenceToken, subjectWithToken } from "../functions/_shared/referenceToken.ts";

test("tokens are random and match the pattern", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const t = newReferenceToken();
    assert.match(t, /^[A-HJ-NP-Z2-9]{10}$/);
    seen.add(t);
  }
  assert.equal(seen.size, 200);
});

test("subject and body get the token once", () => {
  const t = "ABCDEFGH23";
  assert.equal(subjectWithToken("Request", t), "Request [ABCDEFGH23]");
  assert.equal(subjectWithToken("RE: Request [ABCDEFGH23]", t), "RE: Request [ABCDEFGH23]");
  assert.match(bodyWithToken("<p>Hi</p>", t), /<p>Hi<\/p><p[^>]*>Ref: \[ABCDEFGH23\]<\/p>$/);
  assert.equal(bodyWithToken("<p>Ref: [ABCDEFGH23]</p>", t), "<p>Ref: [ABCDEFGH23]</p>");
});

test("finds tokens in order, once, and ignores gateway tags and record numbers", () => {
  const subject = "AW: Offer [EXTERNAL] [SP-2026-0042-A01] [ABCDEFGH23]";
  const body = "ok thanks\n> Ref: [ABCDEFGH23]\n> older [ZZZZ222233]";
  assert.deepEqual(findReferenceTokens(subject, body), ["ABCDEFGH23", "ZZZZ222233"]);
  assert.deepEqual(findReferenceTokens("[abcdefgh23] [SHORT] [ABCDEFGH20] [ABCDEFGH234]"), []);
});
