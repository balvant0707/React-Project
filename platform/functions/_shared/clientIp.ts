// The address of the caller and a hash of it for rate limit bucket keys.
// The first X-Forwarded-For entry is whatever the client sent; the proxies append theirs, so the last one is the
// address the nearest proxy saw. Cloudflare's own header wins when present.
export function clientIp(req: Request): string {
  const forwarded = (req.headers.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return req.headers.get("cf-connecting-ip")?.trim() || forwarded[forwarded.length - 1] || "unknown";
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
