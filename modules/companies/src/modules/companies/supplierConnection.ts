// Ported 1:1 from the NPM tool (app/src/modules/companies/supplierConnection.ts).
import { useEffect, useState } from "react";
import { supabaseClient } from "@rbp/core";

// companies.supplier_connection_method (migration 20261027140000): how availability requests reach a supplier.
export type SupplierConnectionMethod = "in_app" | "email" | "api";

export const SUPPLIER_CONNECTION_OPTIONS: { value: SupplierConnectionMethod; label: string }[] = [
  { value: "in_app", label: "In app (handed over to a colleague)" },
  { value: "email", label: "Email" },
  { value: "api", label: "API" },
];

// Keep in sync with the check constraint on companies.supplier_api_adapter.
export const SUPPLIER_API_ADAPTER_OPTIONS = [{ value: "scms_sqs", label: "SCMS-SQS (Nipsea)" }];

export type SupplierConnection = { method: SupplierConnectionMethod | null; adapter: string | null };

// Whether the API buttons apply: an adapter is set and the supplier is not switched to another way of asking.
export const usesSupplierApi = (connection: SupplierConnection | null | undefined) =>
  !!connection?.adapter && (connection.method == null || connection.method === "api");

// The supplier's connection method and API adapter. A page that already has it passes it as `provided` (null while
// it is still loading) so the same company row is not fetched again by every component that needs it.
export function useSupplierConnection(supplierId: string | null | undefined, provided?: SupplierConnection | null): SupplierConnection | null {
  const [fetched, setFetched] = useState<SupplierConnection | null>(null);
  const skip = provided !== undefined;
  useEffect(() => {
    setFetched(null);
    if (skip || !supplierId) return;
    let cancelled = false;
    supabaseClient
      .from("companies")
      .select("supplier_connection_method, supplier_api_adapter")
      .eq("id", supplierId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const row = data as { supplier_connection_method: SupplierConnectionMethod | null; supplier_api_adapter: string | null } | null;
        setFetched(row ? { method: row.supplier_connection_method ?? null, adapter: row.supplier_api_adapter ?? null } : null);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, skip]);
  return skip ? provided : fetched;
}
