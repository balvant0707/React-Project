// From the NPM tool (app/src/utils/emailHtml.ts), until 2026-11-13 ported into npm-base; now one copy in the platform.
// HTML for outgoing emails built in the browser (availability requests, transport mails).

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Blank-line separated paragraphs of plain text -> <p> blocks, single line breaks kept.
export const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
