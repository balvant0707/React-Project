// Ported 1:1 from the NPM tool (supabase/functions/_shared/referenceToken.ts).
// The random reference token of a mail the app sends (subject "[K7M2Q9XAWB]" and "Ref: [...]" at the end of the
// body). It is only looked up in email_threads.reference_token, so a look-alike word such as "[EXTERNAL]" matches
// nothing. It is never derived from a record number, so nobody can guess one; email-webhook uses it as the last way to
// match a reply to its thread. No imports: unit-tested with node (supabase/tests/reference_token.test.mjs).

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Global; matchAll copies the regex, so sharing the instance is safe.
export const REFERENCE_TOKEN_PATTERN = /\[([A-HJ-NP-Z2-9]{10})\]/g;

export function newReferenceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// Tokens in the order they appear, each once.
export function findReferenceTokens(...texts: string[]): string[] {
  return [...new Set(texts.flatMap((t) => [...t.matchAll(REFERENCE_TOKEN_PATTERN)].map((m) => m[1])))];
}

// The same token again at the end of the body: a reply quotes it even when the subject was rewritten.
export function bodyWithToken(bodyHtml: string, token: string): string {
  return bodyHtml.includes(`[${token}]`) ? bodyHtml : `${bodyHtml}<p style="color:#888;font-size:11px">Ref: [${token}]</p>`;
}

export function subjectWithToken(subject: string, token: string): string {
  return subject.includes(`[${token}]`) ? subject : `${subject.trim()} [${token}]`;
}
