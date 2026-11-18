// Render smoke test for RADAR's PDFs (technical specification, quotation / order confirmation, material order form,
// dock report, daily report): loads the real components through Vite's SSR loader, renders each with sample data
// (full, and with every optional field null) to a PDF with @react-pdf/renderer under Node, and checks that it is a
// PDF with the expected number of pages and embedded images, and that the renderer reported nothing (it only logs an
// image or font it skips). What it cannot check: how the page looks. Pass --out <dir> to keep the files
// and open them. Run: node tools/pdf-smoke.mjs [--out dir]
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outIdx = process.argv.indexOf("--out");
if (outIdx > 0 && !process.argv[outIdx + 1]) {
  console.error("--out needs a directory");
  process.exit(2);
}
const outDir = outIdx > 0 ? path.resolve(process.argv[outIdx + 1]) : null;
if (outDir) mkdirSync(outDir, { recursive: true });

// Images the PDFs import (hero photo, logos): in Node react-pdf reads a file path, so resolve the import to one.
const imagePaths = {
  name: "pdf-smoke-image-paths",
  enforce: "pre",
  async resolveId(source, importer) {
    if (!/\.(png|jpe?g)$/.test(source) || !importer) return null;
    const file = path.resolve(path.dirname(importer), source);
    return `\0image:${file}`;
  },
  load(id) {
    return id.startsWith("\0image:") ? `export default ${JSON.stringify(id.slice(7))};` : null;
  },
};

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  plugins: [imagePaths, react()],
  ssr: { noExternal: [/^@rbp\//] },
  optimizeDeps: { noDiscovery: true, include: [] },
});

const noise = [];
for (const level of ["warn", "error"]) console[level] = (...args) => void noise.push(args.map(String).join(" "));

const load = (p) => server.ssrLoadModule(p);
const { renderToBuffer } = await load("@react-pdf/renderer");
const { createElement: h } = await import("react");
const [{ TechnicalSpecPdf }, { QuotationPdf }, { MofPdf }, { DockReportPdf }, { DailyReportPdf }] = await Promise.all([
  load("/modules/offers/src/pdf/TechnicalSpecPdf.tsx"),
  load("/modules/offers/src/pdf/QuotationPdf.tsx"),
  load("/modules/offers/src/pdf/MofPdf.tsx"),
  load("/modules/dock-reports/src/pdf/DockReportPdf.tsx"),
  load("/modules/dock-reports/src/pdf/DailyReportPdf.tsx"),
]);

// ---- sample data ---------------------------------------------------------------------------------------------------
const product = (i) => ({
  productLabel: `SeaQuantum Ultra ${i}`, colourLabel: i % 2 ? "Red" : "Grey", coatModeLabel: "Full", coatPct: 100,
  applicationMethodLabel: "Airless spray", sizeM2: 1200 + i, solidsVolumePct: 62, dryFilmThicknessUm: 100,
  wetFilmThicknessUm: 161, theoreticalSpreadingRate: 6.2, lossFactorPct: 25, quantityL: 1500 + i, quantityUnit: "L",
});
const area = (n, products = 3) => ({
  areaLabel: `Area ${n}`, sizeM2: 4000 + n, substrateLabel: "Existing AF", environmentLabel: "Dry dock", numberOfCoats: 2,
  surfacePreparationText: "High pressure fresh water wash. Spot blast to Sa 2.5. Remove all loose paint and fouling.",
  overcoatWindows: [{ label: "SeaQuantum Ultra over itself", dftRangeLabel: "100-200 µm", intervalsText: "34h-90d; at 0°C: 16h-56d" }],
  products: Array.from({ length: products }, (_, i) => product(i + 1)),
});
const nullify = (v) =>
  Array.isArray(v) ? [] : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nullify(x)])) : typeof v === "boolean" ? false : typeof v === "number" ? null : v === undefined ? v : null;

const spec = {
  specificationNumber: "26-100123", version: 2, specificationDate: "2026-10-01", tenantName: "Nippon Paint Marine Europe",
  vesselName: "MALAYAN EMPRESS", vesselImo: "8106719", hullEventTypeText: "Drydock", hullEventQuarterYear: "Q2 2027",
  antifoulingSummaryLines: ["Flat bottom: SeaQuantum Ultra", "Vertical sides: SeaQuantum Ultra"], speed: 14.5,
  deliveryPort: "Rotterdam", placeOfApplication: "Damen Shiprepair Rotterdam", isDrydock: true,
  areas: [area(1), area(2), area(3, 12)],
  flatProducts: [{ productLabel: "Thinner", quantity: 200, unit: "L" }],
  remarksText: "Prices exclude transport.\nDelivery on request.", showDraftWatermark: true,
};
const quotation = {
  specificationNumber: "26-100123", version: 2, specificationDate: "2026-10-01", deliveryDateFrom: "2027-04-01",
  deliveryDate: "2027-04-10", validUntilText: "2026-12-01 12:00", tenantName: "Nippon Paint Marine Europe",
  supplierName: "NPMZ(Z)", vesselName: "MALAYAN EMPRESS", vesselImo: "8106719", deliveryPort: "Rotterdam", incoterm: "FOB Rotterdam",
  placeOfApplication: "Damen Shiprepair Rotterdam", currency: "EUR", customerName: "Malayan Shipping Ltd",
  customerAddressLine: "1 Harbour Road", customerCity: "Port Klang", customerPostalCode: "42000", customerCountry: "Malaysia",
  customerTelephone: "+60 3 1234 5678", contactPerson: "A. Technical", remarksText: "Valid for 60 days.",
  termsAndConditionsText: "General terms apply.\n".repeat(30), isDrydock: true,
  areas: [1, 2].map((n) => ({
    areaLabel: `Area ${n}`, sizeM2: 4000,
    products: [1, 2, 3].map((i) => ({ productLabel: `Product ${i}`, colourLabel: "Red", coatModeLabel: "Full", coatPct: 100, dryFilmThicknessUm: 100,
      solidsVolumePct: 62, theoreticalSpreadingRate: 6.2, lossFactorPct: 25, quantityL: 1500, quantityUnit: "L", pricePerL: 12.5, pricePerM2: 4.7, totalPrice: 18750 })),
  })),
  lineItems: Array.from({ length: 40 }, (_, i) => ({ productLabel: `Product ${i + 1}`, offeredQty: 1000, offeredPacks: 50, packSize: 20, unit: "L", salesPrice: 12.5, discountPct: 5, totalPrice: 11875 })),
  discounts: [{ name: "Volume", discount_type: "pct", pct: 5, amount: null }, { name: "Early order", discount_type: "amount", pct: null, amount: 500 }],
  specPrice: 100000, priceAfterDiscounts: 94500, transportSurcharge: 1200, netSales: 95700, showDraftWatermark: false,
};
const mof = {
  orderReference: "26-200045", requestedDateFrom: "2027-04-01", requestedDate: "2027-04-10", supplierName: "NPMZ(Z)",
  vesselName: "MALAYAN EMPRESS", vesselImo: "8106719", deliveryPort: "Rotterdam", incoterm: "FOB Rotterdam",
  customerName: "Malayan Shipping Ltd", customerAddressLine: "1 Harbour Road", customerCity: "Port Klang", customerPostalCode: "42000",
  customerCountryLabel: "Malaysia", customerPoNumber: "PO-778",
  lines: Array.from({ length: 6 }, (_, i) => ({ productLabel: `Product ${i + 1}`, packSize: 20, unit: "L", orderedPacks: 50, orderedQty: 1000 })),
};
const weather = [{ timeTaken: "08:00", airTemperatureC: 12, surfaceTemperatureC: 14, dewPointC: 8, relativeHumidityPct: 70, windConditionText: "Light breeze" }];
const activities = [{ timeTaken: "09:00", activityText: "Spot blasting", areaLabel: "Area 1", applicationMethodLabel: "Airless spray" }];
// A real photo (the hero image), so the photo grid and the signature image are drawn, plus one without an image.
const photo = path.join(root, "modules/offers/src/assets/hero-ship.jpg");
const photos = [
  { imageUrl: photo, captionText: "Flat bottom after blasting", stageLabel: "Before", takenAt: "2027-04-02T09:00:00Z", areaLabel: "Area 1", activityLabel: "Spot blasting" },
  { imageUrl: null, captionText: "Captured offline", stageLabel: null, takenAt: null, areaLabel: null, activityLabel: null },
  ...Array.from({ length: 9 }, () => ({ imageUrl: photo, captionText: "Sides", stageLabel: "After", takenAt: "2027-04-03T09:00:00Z", areaLabel: "Area 2", activityLabel: null })),
];
const dock = {
  reportNumber: "DR-26-0007", statusLabel: "Final", vesselName: "MALAYAN EMPRESS", vesselImo: "8106719", hullEventTypeText: "Drydock",
  specificationNumber: "26-100123", technicalServiceRepName: "T. Rep", salesAccountName: "S. Rep", indockingDate: "2027-04-01",
  outdockingDate: "2027-04-12", timeZone: "Europe/Amsterdam", antifoulingLineFwdM: 5.2, antifoulingLineAftM: 5.4, boottopLineFwdM: 4.1,
  boottopLineAftM: 4.3, cathodicProtectionTypeLabel: "Sacrificial anodes", cathodicProtectionAnodeCount: 24,
  areas: [1, 2].map((n) => ({
    areaLabel: `Area ${n}`, sizeM2: 4000, substrateLabel: "Existing AF", environmentLabel: "Dry dock", surfacePreparationText: "Wash",
    actualSurfacePreparationText: "Washed and blasted", foulingExtentPct: 30, foulingEvaluationLabel: "Light slime", conditionCommentsText: "Good",
    products: [1, 2].map((i) => ({ productLabel: `Product ${i}`, colourLabel: "Red", coatModeLabel: "Full", coatPct: 100, applicationMethodLabel: "Airless spray",
      specDryFilmThicknessUm: 100, measuredDryFilmThicknessUm: 108, batches: [{ batchNumber: "B123", drumQuantity: 12, consumptionDate: "2027-04-05" }] })),
  })),
  dailyLogs: [1, 2, 3].map((d) => ({ logDate: `2027-04-0${d}`, reportedByName: "T. Rep", narrativeText: "Work went to plan. ".repeat(20), weatherReadings: weather, activities })),
  photos, signatures: [{ roleLabel: "Owner's representative", signerName: "A. Owner", signedAt: "2027-04-12T10:00:00Z", imageUrl: photo }, { roleLabel: "Yard", signerName: null, signedAt: null, imageUrl: null }],
  remarksText: "No remarks.", showDraftWatermark: false,
};
const daily = { reportNumber: "DR-26-0007", vesselName: "MALAYAN EMPRESS", vesselImo: "8106719", logDate: "2027-04-02", reportedByName: "T. Rep", narrativeText: "Work went to plan.", weatherReadings: weather, activities, photos };

// ---- checks --------------------------------------------------------------------------------------------------------
const cases = [
  ["technical-spec", TechnicalSpecPdf, spec, { min: 3, images: 3 }],
  ["technical-spec-empty", TechnicalSpecPdf, nullify(spec), { min: 2, images: 3 }],
  ["quotation", QuotationPdf, quotation, { min: 3, images: 3 }],
  ["quotation-empty", QuotationPdf, { ...nullify(quotation), specPrice: 0, priceAfterDiscounts: 0, netSales: 0 }, { min: 1, images: 3 }],
  ["order-confirmation", QuotationPdf, { ...quotation, documentTitle: "Order Confirmation", version: null, validUntilText: null, isDrydock: false, areas: [] }, { min: 1, images: 3 }],
  ["mof", MofPdf, mof, { min: 1, images: 0 }],
  ["mof-empty", MofPdf, { ...nullify(mof), orderReference: "" }, { min: 1, images: 0 }],
  ["dock-report", DockReportPdf, dock, { min: 4, images: 3 }],
  ["dock-report-empty", DockReportPdf, nullify(dock), { min: 1, images: 3 }],
  ["daily-report", DailyReportPdf, daily, { min: 1, images: 1 }],
  ["daily-report-empty", DailyReportPdf, nullify(daily), { min: 1, images: 0 }],
];

let failed = 0;
for (const [name, Comp, data, { min, images: minImages }] of cases) {
  try {
    noise.length = 0;
    const buf = await renderToBuffer(h(Comp, { data }));
    // react-pdf logs and skips an image or font it cannot load instead of failing: any message from it fails the case.
    if (noise.length) throw new Error(`renderer reported: ${noise.slice(0, 3).join(" | ").slice(0, 300)}`);
    const text = buf.toString("latin1");
    const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    const images = (text.match(/\/Subtype \/Image\b/g) ?? []).length;
    if (process.env.PDF_SMOKE_DEBUG) console.log(name, "images", images, "renderer messages", noise.length);
    if (!text.startsWith("%PDF-")) throw new Error("not a PDF");
    if (!text.trimEnd().endsWith("%%EOF")) throw new Error("no %%EOF: the file is cut off");
    if (pages < min) throw new Error(`${pages} pages, expected at least ${min}`);
    if (images < minImages) throw new Error(`${images} embedded images, expected at least ${minImages}: a logo or photo was not drawn`);
    if (outDir) writeFileSync(path.join(outDir, `${name}.pdf`), buf);
    console.log(`ok   ${name.padEnd(22)} ${String(pages).padStart(3)} pages ${String(Math.round(buf.length / 1024)).padStart(6)} KB`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e?.stack?.split("\n").slice(0, 4).join("\n") ?? e}`);
  }
}
await server.close();
console.log(failed ? `${failed} of ${cases.length} failed` : `all ${cases.length} PDFs rendered`);
process.exit(failed ? 1 : 0);
