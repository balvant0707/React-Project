// Ported 1:1 from the NPM tool (app/src/pdf/QuotationPdf.tsx).
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { TitlePage, PageChrome, InfoList, BulletList, splitIntoBullets } from "./PdfChrome";
import { styles } from "./styles";
import { formatPdfDate, formatPdfDateRange, formatAmount, num, right } from "./pdfTheme";

type PdfLineItem = {
  productLabel: string;
  offeredQty: number | null;
  offeredPacks: number | null;
  packSize: number | null;
  unit: string | null;
  salesPrice: number | null;
  discountPct: number | null;
  totalPrice: number | null;
};

type PdfDiscount = {
  name: string;
  discount_type: "pct" | "amount";
  pct: number | null;
  amount: number | null;
};

// Per-area commercial breakdown - only used for DD/NB (see isDrydock below). Same
// area/coat-line shape as the Technical Specification, plus the pricing
// columns that document deliberately leaves out - matches how the Hempel
// competitor document splits "Quotation Summary" (flat, this file's existing
// lineItems table) from "Quotation (per specified area)" (this section).
type PdfQuotationAreaProduct = {
  productLabel: string;
  colourLabel: string | null;
  coatModeLabel: string | null;
  coatPct: number | null;
  dryFilmThicknessUm: number | null;
  solidsVolumePct: number | null;
  theoreticalSpreadingRate: number | null;
  lossFactorPct: number | null;
  quantityL: number | null;
  quantityUnit: string | null;
  pricePerL: number | null;
  pricePerM2: number | null;
  totalPrice: number | null;
};

type PdfQuotationArea = {
  areaLabel: string | null;
  sizeM2: number | null;
  products: PdfQuotationAreaProduct[];
};

export type QuotationPdfData = {
  specificationNumber: string;
  // A quotation by default; "Order Confirmation" is built from an order (no version, no validity, optional PO).
  documentTitle?: "Order Confirmation";
  customerPoNumber?: string | null;
  version: number | null;
  specificationDate: string | null;
  deliveryDateFrom: string | null;
  deliveryDate: string | null;
  // Formatted already (date and time of the offer's validity).
  validUntilText: string | null;
  tenantName: string | null;
  supplierName: string | null;
  vesselName: string | null;
  vesselImo: string | null;
  deliveryPort: string | null;
  // "FOB Rotterdam" - the incoterm code with its named place.
  incoterm: string | null;
  placeOfApplication: string | null;
  currency: string | null;
  customerName: string | null;
  customerAddressLine: string | null;
  customerCity: string | null;
  customerPostalCode: string | null;
  customerCountry: string | null;
  customerTelephone: string | null;
  contactPerson: string | null;
  remarksText: string | null;
  termsAndConditionsText: string | null;
  isDrydock: boolean;
  areas: PdfQuotationArea[];
  lineItems: PdfLineItem[];
  discounts: PdfDiscount[];
  specPrice: number;
  priceAfterDiscounts: number;
  transportSurcharge: number | null;
  netSales: number;
  // Manager review process (~/npm_tool/docs/domain-model.md) - true while the spec is
  // 'draft'/'under_review', see pdfExport.ts.
  showDraftWatermark: boolean;
};

const AREA_QUOTE_COLS = [
  { key: "product", label: "Product", width: "22%", num: false },
  { key: "colour", label: "Colour", width: "9%", num: false },
  { key: "mode", label: "Mode", width: "7%", num: false },
  { key: "pct", label: "Coat %", width: "6%", num: true },
  { key: "dft", label: "DFT (um)", width: "8%", num: true },
  { key: "vs", label: "VS %", width: "6%", num: true },
  { key: "tsr", label: "TSR (m2/L)", width: "8%", num: true },
  { key: "lf", label: "LF %", width: "6%", num: true },
  { key: "qty", label: "Quantity", width: "9%", num: true },
  { key: "unitPrice", label: "Unit price", width: "8%", num: true },
  { key: "priceM2", label: "Price/m2", width: "7%", num: true },
  { key: "total", label: "Total", width: "9%", num: true },
] as const;

export const QuotationPdf = ({ data }: { data: QuotationPdfData }) => (
  <Document title={`${data.documentTitle ?? "Quotation"} ${data.specificationNumber}`}>
    <TitlePage
      subtitle={data.documentTitle ?? "Quotation"}
      vesselName={data.vesselName ?? "—"}
      metaLines={[
        `${data.documentTitle ?? "Quotation"} No.: ${data.specificationNumber}${data.version != null ? ` - v${data.version}` : ""}`,
        `Date: ${formatPdfDate(data.specificationDate)}`,
        `Issued by: ${data.tenantName ?? "—"}`,
      ]}
      watermark={data.showDraftWatermark}
    />
    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageChrome docTitle={`${data.documentTitle ?? "Quotation"} ${data.specificationNumber}`} watermark={data.showDraftWatermark}>
        {/* Letterhead layout: customer address on the left, reference
            fields on the right - like a business letter, and matching the
            same left/right split the editor's own header uses (see
            specifications/show.tsx). */}
        <View style={styles.letterheadRow}>
          <View style={styles.letterheadCol}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <InfoList
              items={[
                { label: "Customer", value: data.customerName ?? "—" },
                { label: "Contact person", value: data.contactPerson ?? "—" },
                { label: "Address", value: data.customerAddressLine ?? "—" },
                { label: "City / Postal code", value: [data.customerCity, data.customerPostalCode].filter(Boolean).join(" / ") || "—" },
                { label: "Country", value: data.customerCountry ?? "—" },
                { label: "Telephone", value: data.customerTelephone ?? "—" },
              ]}
            />
          </View>
          <View style={styles.letterheadCol}>
            <Text style={styles.sectionTitle}>Specification</Text>
            <InfoList
              items={[
                { label: "Vessel", value: `${data.vesselName ?? "—"} (IMO ${data.vesselImo ?? "—"})` },
                { label: "Supplier", value: data.supplierName ?? "—" },
                { label: "Delivery date", value: formatPdfDateRange(data.deliveryDateFrom, data.deliveryDate) },
                { label: "Currency", value: data.currency ?? "—" },
                ...(data.documentTitle ? [] : [{ label: "Valid until", value: data.validUntilText ?? "—" }]),
                ...(data.customerPoNumber ? [{ label: "Customer PO", value: data.customerPoNumber }] : []),
                { label: "Delivery port", value: data.deliveryPort ?? "—" },
                { label: "Incoterm", value: data.incoterm ?? "—" },
                { label: "Place of application", value: data.placeOfApplication ?? "—" },
              ]}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{data.isDrydock ? "Summary" : "Products"}{data.currency ? ` (${data.currency})` : ""}</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { width: "34%" }]}>Product</Text>
            <Text style={[styles.th, { width: "16%" }]}>Quantity</Text>
            <Text style={[styles.th, right, { width: "16%" }]}>Sales price</Text>
            <Text style={[styles.th, right, { width: "12%" }]}>Discount</Text>
            <Text style={[styles.th, right, { width: "22%" }]}>Total</Text>
          </View>
          {data.lineItems.map((item, i) => (
            <View key={i} style={i === data.lineItems.length - 1 ? styles.tableRowLast : styles.tableRow}>
              <Text style={[styles.td, { width: "34%" }]}>{item.productLabel}</Text>
              <Text style={[styles.td, { width: "16%" }]}>
                {item.offeredQty != null
                  ? `${item.offeredQty.toLocaleString()} ${item.unit ?? ""}`.trim() +
                    (item.offeredPacks != null && item.packSize ? ` (${item.offeredPacks.toLocaleString()} x ${item.packSize.toLocaleString()}${item.unit ? ` ${item.unit}` : ""})` : "")
                  : "—"}
              </Text>
              <Text style={[styles.td, right, { width: "16%" }]}>{formatAmount(item.salesPrice)}</Text>
              <Text style={[styles.td, right, { width: "12%" }]}>{item.discountPct ? `${item.discountPct}%` : "—"}</Text>
              <Text style={[styles.td, right, { width: "22%" }]}>{formatAmount(item.totalPrice)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBox}>
          {data.currency && <Text style={styles.totalsCurrencyLabel}>Amounts in {data.currency}</Text>}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Spec price</Text>
            <Text style={styles.totalsValue}>{formatAmount(data.specPrice)}</Text>
          </View>
          {data.discounts.map((d, i) => (
            <View key={i} style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{d.name || "Discount"}</Text>
              <Text style={styles.totalsValue}>{d.discount_type === "amount" ? `-${formatAmount(d.amount)}` : `-${d.pct}%`}</Text>
            </View>
          ))}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Price after discounts</Text>
            <Text style={styles.totalsValue}>{formatAmount(data.priceAfterDiscounts)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Transport / customs</Text>
            <Text style={styles.totalsValue}>{formatAmount(data.transportSurcharge)}</Text>
          </View>
          <View style={styles.totalsFinalRow}>
            <Text style={styles.totalsFinalLabel}>Net sales</Text>
            <Text style={styles.totalsFinalValue}>{formatAmount(data.netSales)}</Text>
          </View>
        </View>

        {data.isDrydock && data.areas.length > 0 && (
          <View break>
            <Text style={styles.sectionTitle}>Quotation by Area{data.currency ? ` (${data.currency})` : ""}</Text>
            {data.areas.map((area, areaIndex) => {
              const areaTotal = area.products.reduce((sum, p) => sum + (p.totalPrice ?? 0), 0);
              return (
                <View key={areaIndex} style={{ marginBottom: 14 }} wrap={false}>
                  <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
                    {area.areaLabel ?? "Area"} {area.sizeM2 != null ? `— ${num(area.sizeM2)} m²` : ""}
                  </Text>
                  <View style={styles.table}>
                    <View style={styles.tableHeaderRow}>
                      {AREA_QUOTE_COLS.map((col) => (
                        <Text key={col.key} style={[styles.thCompact, { width: col.width }, col.num ? right : {}]}>
                          {col.label}
                        </Text>
                      ))}
                    </View>
                    {area.products.map((p, i) => (
                      <View key={i} style={i === area.products.length - 1 ? styles.tableRowLast : styles.tableRow}>
                        <Text style={[styles.tdCompact, { width: AREA_QUOTE_COLS[0].width }]}>{p.productLabel}</Text>
                        <Text style={[styles.tdCompact, { width: AREA_QUOTE_COLS[1].width }]}>{p.colourLabel ?? "—"}</Text>
                        <Text style={[styles.tdCompact, { width: AREA_QUOTE_COLS[2].width }]}>{p.coatModeLabel ?? "—"}</Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[3].width }]}>{p.coatPct != null ? `${p.coatPct}%` : "—"}</Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[4].width }]}>{num(p.dryFilmThicknessUm)}</Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[5].width }]}>{num(p.solidsVolumePct)}</Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[6].width }]}>
                          {p.theoreticalSpreadingRate != null ? p.theoreticalSpreadingRate.toFixed(2) : "—"}
                        </Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[7].width }]}>{num(p.lossFactorPct)}</Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[8].width }]}>
                          {p.quantityL != null ? `${num(p.quantityL)} ${p.quantityUnit ?? ""}`.trim() : "—"}
                        </Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[9].width }]}>{formatAmount(p.pricePerL)}</Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[10].width }]}>{formatAmount(p.pricePerM2)}</Text>
                        <Text style={[styles.tdCompact, right, { width: AREA_QUOTE_COLS[11].width }]}>{formatAmount(p.totalPrice)}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 3 }}>
                    Area total: {formatAmount(areaTotal)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {data.remarksText && (
          <>
            <Text style={styles.sectionTitle}>Remarks</Text>
            <BulletList items={splitIntoBullets(data.remarksText)} />
          </>
        )}

        {data.termsAndConditionsText && (
          <View break>
            <Text style={styles.sectionTitle}>Terms and Conditions</Text>
            {data.termsAndConditionsText.split(/\n{2,}/).map((paragraph, i) => (
              <Text key={i} style={styles.paragraph}>
                {paragraph.trim()}
              </Text>
            ))}
          </View>
        )}
      </PageChrome>
    </Page>
  </Document>
);
