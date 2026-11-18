import type { AccessControlProvider } from "@refinedev/core";
import { supabaseClient } from "../supabase";

// Coarse UI gating only (menu entries, admin routes): row level security in the database is the real boundary. Resources
// carry their rule in meta (from the module manifest):
//   permission  a literal the user must hold ("tasks.view.all"), or one without its scope ("hull_events.view" = any scope); no literal = open
//   admin       an administration page: the Admin always, anybody else only with the delegated literal in `permission`
// The Admin holds no content literal by itself (admin administers, content comes from roles).
type Cache = { isAdmin: boolean; held: Set<string> } | null;
let cache: Promise<Cache> | null = null;

const load = (): Promise<Cache> =>
  (cache ??= (async () => {
    const [{ data: admin }, { data: held }] = await Promise.all([supabaseClient.rpc("is_admin"), supabaseClient.rpc("my_permissions")]);
    return { isAdmin: admin === true, held: new Set((held ?? []) as string[]) };
  })().catch(() => {
    cache = null;
    return null;
  }));

export const resetAccessCache = () => {
  cache = null;
};

export const accessControlProvider: AccessControlProvider = {
  can: async ({ params }) => {
    const meta = (params?.resource as { meta?: { permission?: string; admin?: boolean } } | undefined)?.meta;
    if (!meta || (!meta.permission && !meta.admin)) return { can: true };
    const me = await load();
    if (!me) return { can: false, reason: "unknown" };
    if (meta.admin && me.isAdmin) return { can: true };
    // A literal without a scope ('hull_events.view') matches any scope the user holds, like NPM's holdsAction().
    const p = meta.permission;
    return { can: !!p && (me.held.has(p) || [...me.held].some((k) => k.startsWith(`${p}.`))) };
  },
  options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
};
