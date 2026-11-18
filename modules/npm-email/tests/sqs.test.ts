// Ported 1:1 from the NPM tool (supabase/functions/_shared/supplierApi/test/sqs.test.ts); only the import paths changed.
// Run: node --test modules/npm-email/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSqsPayload, parseSqsResponse } from "../functions/_shared/supplierApi/sqs.ts";
import { buildLines, orderTypeFor } from "../functions/_shared/supplierApi/payload.ts";
import { adapterConfig } from "../functions/_shared/supplierApi/index.ts";

const enquiry = {
  requestNumber: "26-123456-A01",
  userEmail: "a@b.c",
  internalReference: "26-123456-01",
  countryName: "Japan",
  orderType: "SS" as const,
  imo: "8106719",
  shipName: "MALAYAN EMPRESS",
  portName: "Chiba",
  estimatedArrival: "2026-04-15",
  estimatedDelivery: null,
  groupOwner: "GRM Shipping",
  currency: "USD",
  lines: [{ lineNumber: 1, supplierKey: "AC4OM41X001020KJP", productName: "PRIMER", colour: null, packSize: 14.49, packUnit: "L", numberOfPacks: 20 }],
};

test("payload matches the vendor field names and carries no prices", () => {
  const p: any = buildSqsPayload(enquiry);
  assert.equal(p.ImoNumber, "8106719");
  assert.equal(p.enquirySqsNumber, "26-123456-A01");
  assert.equal(p.estimatedArrival, "2026-04-15T00:00:00.000Z");
  assert.equal(p.estimatedDelivery, undefined);
  assert.equal(p.enquirySoNumber, undefined);
  assert.deepEqual(p.details[0], { pmc17Code: "AC4OM41X001020KJP", productName: "PRIMER", lineNumber: 1, packSize: 14.49, packUom: "L", numberOfPacks: 20 });
  assert.equal(JSON.stringify(p).includes("salesValue"), false);
});

test("confirm payload adds the sales order number", () => {
  assert.equal((buildSqsPayload({ ...enquiry, salesOrderNumber: "26-123456-O01" }) as any).enquirySoNumber, "26-123456-O01");
});

test("response parsing", () => {
  assert.deepEqual(parseSqsResponse(200, { success: true, data: { enquiryNumber: "ENQ202600001" } }), { success: true, error: null, supplierEnquiryNumber: "ENQ202600001" });
  assert.equal(parseSqsResponse(200, { success: false, message: "Validation failed", errors: ["IMO invalid"] }).error, "Validation failed; IMO invalid");
  assert.equal(parseSqsResponse(401, { isError: true, responseException: { exceptionMessage: { title: "Unauthorized" } } }).error, "Unauthorized");
  assert.equal(parseSqsResponse(502, "Bad gateway").error, "HTTP 502");
});

test("lines: zero quantities skipped, numbering contiguous, missing key reported", () => {
  const pk = (key: string) => ({ supplier_key: key, pack_size: "20", unit: "l", products: { name: "P", colour: "Red" } });
  const r = buildLines([
    { quantity: 0, product_packagings: pk("A") },
    { quantity: 5, product_packagings: pk("B") },
    { quantity: 2, product_packagings: pk("") },
  ]);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].lineNumber, 1);
  assert.equal(r.lines[0].packUnit, "L");
  assert.equal(r.missing.length, 1);
  assert.equal(orderTypeFor("NB"), "Other");
});

test("adapter config: per-supplier override wins", () => {
  const env = new Map([["SCMS_SQS_BASE_URL", "https://x"], ["SCMS_SQS_API_KEY", "k"], ["SCMS_SQS_API_KEY__NIP_1", "k2"]]);
  assert.equal(adapterConfig("scms_sqs", "nip-1", env)?.apiKey, "k2");
  assert.equal(adapterConfig("scms_sqs", "other", env)?.apiKey, "k");
  assert.equal(adapterConfig("scms_sqs", null, new Map())?.apiKey, undefined);
});
