// Ported 1:1 from the NPM tool (supabase/functions/_shared/supplierApi/types.ts).
// Supplier-neutral request model + the adapter contract. One adapter per supplier API
// (see ~/npm_tool/docs/supplier-api-integration.md); several suppliers can share an adapter. The
// Edge Function builds a NeutralEnquiry from our tables and hands it to the adapter
// picked by companies.supplier_api_adapter, which maps it to the vendor payload.

export type OrderType = "DD" | "SS" | "Other";

export type NeutralLine = {
  lineNumber: number;
  // Supplier's code for the packaging (product_packagings.supplier_key).
  supplierKey: string;
  productName: string;
  colour: string | null;
  packSize: number;
  packUnit: string;
  numberOfPacks: number;
};

// Deliberately has no prices: sales values are never sent to a supplier.
export type NeutralEnquiry = {
  // Our reference for the enquiry; the key of every later call.
  requestNumber: string;
  // Our order number, only when confirming.
  salesOrderNumber?: string;
  userEmail: string;
  internalReference: string | null;
  countryName: string;
  orderType: OrderType;
  imo: string;
  shipName: string;
  portName: string;
  estimatedArrival: string; // yyyy-mm-dd
  estimatedDelivery: string | null; // yyyy-mm-dd
  groupOwner: string;
  currency: string | null;
  lines: NeutralLine[];
};

export type AdapterConfig = { baseUrl: string; apiKey: string };

export type AdapterResult = {
  success: boolean;
  httpStatus: number | null;
  requestBody: unknown;
  responseBody: unknown;
  error: string | null;
  // The supplier's own number for the enquiry, when the response carries one.
  supplierEnquiryNumber: string | null;
};

export interface SupplierApiAdapter {
  readonly id: string;
  createEnquiry(config: AdapterConfig, enquiry: NeutralEnquiry): Promise<AdapterResult>;
  updateEnquiry(config: AdapterConfig, enquiry: NeutralEnquiry): Promise<AdapterResult>;
  confirmOrder(config: AdapterConfig, enquiry: NeutralEnquiry): Promise<AdapterResult>;
}
