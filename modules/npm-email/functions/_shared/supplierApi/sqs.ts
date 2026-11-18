// Ported 1:1 from the NPM tool (supabase/functions/_shared/supplierApi/sqs.ts).
// Adapter for the SCMS-SQS API v5 (Nipsea): POST/PUT /api/sqs/enquiries and
// PUT /api/sqs/enquiries/confirm, X-API-KEY header. Field names follow the vendor sheet
// "SCMS-SQS API (V.5).xlsx" exactly (including the capital I in ImoNumber).
import type { AdapterConfig, AdapterResult, NeutralEnquiry, SupplierApiAdapter } from "./types.ts";

const toIso = (date: string) => `${date}T00:00:00.000Z`;

export function buildSqsPayload(e: NeutralEnquiry): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    enquirySqsNumber: e.requestNumber,
    userEmail: e.userEmail,
    ...(e.salesOrderNumber ? { enquirySoNumber: e.salesOrderNumber } : {}),
    ...(e.internalReference ? { oaInternalReference: e.internalReference } : {}),
    countryName: e.countryName,
    enquiryOrderTypeName: e.orderType,
    ImoNumber: e.imo,
    shipName: e.shipName,
    portName: e.portName,
    estimatedArrival: toIso(e.estimatedArrival),
    ...(e.estimatedDelivery ? { estimatedDelivery: toIso(e.estimatedDelivery) } : {}),
    groupOwner: e.groupOwner,
    ...(e.currency ? { currency: e.currency } : {}),
    details: e.lines.map((l) => ({
      pmc17Code: l.supplierKey,
      productName: l.productName,
      lineNumber: l.lineNumber,
      packSize: l.packSize,
      packUom: l.packUnit,
      ...(l.colour ? { colour: l.colour } : {}),
      numberOfPacks: l.numberOfPacks,
    })),
  };
  return payload;
}

// Success is `success: true` in the body. Failures come either in that same envelope
// (success false, message/errors) or, for auth problems, as { isError, responseException }.
export function parseSqsResponse(httpStatus: number, body: any): Pick<AdapterResult, "success" | "error" | "supplierEnquiryNumber"> {
  if (body && typeof body === "object" && body.success === true) {
    return { success: true, error: null, supplierEnquiryNumber: body.data?.enquiryNumber ?? null };
  }
  const parts: string[] = [];
  if (body?.message) parts.push(String(body.message));
  if (Array.isArray(body?.errors)) parts.push(...body.errors.map(String));
  if (body?.isError) parts.push(body.responseException?.exceptionMessage?.title ?? "Request rejected");
  if (parts.length === 0) parts.push(`HTTP ${httpStatus}`);
  return { success: false, error: parts.join("; "), supplierEnquiryNumber: null };
}

async function call(config: AdapterConfig, method: "POST" | "PUT", path: string, payload: unknown): Promise<AdapterResult> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-API-KEY": config.apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch { /* keep raw text */ }
    return { httpStatus: res.status, requestBody: payload, responseBody: body, ...parseSqsResponse(res.status, body) };
  } catch (err) {
    return {
      success: false,
      httpStatus: null,
      requestBody: payload,
      responseBody: null,
      error: `Could not reach the supplier API: ${(err as Error).message}`,
      supplierEnquiryNumber: null,
    };
  }
}

export const sqsAdapter: SupplierApiAdapter = {
  id: "scms_sqs",
  createEnquiry: (config, e) => call(config, "POST", "/api/sqs/enquiries", buildSqsPayload(e)),
  updateEnquiry: (config, e) => call(config, "PUT", "/api/sqs/enquiries", buildSqsPayload(e)),
  confirmOrder: (config, e) => call(config, "PUT", "/api/sqs/enquiries/confirm", buildSqsPayload(e)),
};
