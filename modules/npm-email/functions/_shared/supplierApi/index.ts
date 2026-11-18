// Ported 1:1 from the NPM tool (supabase/functions/_shared/supplierApi/index.ts).
import type { SupplierApiAdapter } from "./types.ts";
import { sqsAdapter } from "./sqs.ts";

// Keep in sync with the check constraint on companies.supplier_api_adapter.
const ADAPTERS: Record<string, SupplierApiAdapter> = { [sqsAdapter.id]: sqsAdapter };

export function getAdapter(id: string | null | undefined): SupplierApiAdapter | null {
  return id ? (ADAPTERS[id] ?? null) : null;
}

// Connection details live in Edge Function secrets, never in the database:
// <ADAPTER>_BASE_URL / <ADAPTER>_API_KEY, optionally overridden per supplier by
// <ADAPTER>_BASE_URL__<SHORT_CODE> / <ADAPTER>_API_KEY__<SHORT_CODE> (companies.short_code).
export function adapterConfig(
  adapterId: string,
  supplierShortCode: string | null,
  env: { get(name: string): string | undefined },
): { baseUrl: string; apiKey: string } | null {
  const prefix = adapterId.toUpperCase();
  const suffix = supplierShortCode ? `__${supplierShortCode.toUpperCase().replace(/[^A-Z0-9]/g, "_")}` : "";
  const baseUrl = (suffix && env.get(`${prefix}_BASE_URL${suffix}`)) || env.get(`${prefix}_BASE_URL`);
  const apiKey = (suffix && env.get(`${prefix}_API_KEY${suffix}`)) || env.get(`${prefix}_API_KEY`);
  return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}
