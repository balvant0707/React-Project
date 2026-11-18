// Compares two secrets (dispatch tokens, the service-role key, webhook client states) without stopping at the first
// differing byte. Use this for every secret check in an Edge Function; never `===`.
export const sameSecret = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};
