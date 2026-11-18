// Ported 1:1 from the NPM tool (app/src/pdf/MofPdf.tsx).
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { PageChrome, InfoGrid } from "./PdfChrome";
import { styles } from "./styles";
import { formatPdfDateRange, num, right } from "./pdfTheme";

// MOF (Material Order Form) - the drop-ship procurement order sent to a
// supplier asking them to ship an order's lines directly to the customer/
// site (~/npm_tool/docs/order-processing-module.md "MOF"). Deliberately carries no
// prices - it's a logistics instruction to the supplier, not a commercial
// document (the supplier already knows their own selling price to NPM).
type PdfMofLine = {
  productLabel: string;
  packSize: number | null;
  unit: string | null;
  orderedPacks: number | null;
  orderedQty: number | null;
};

export type MofPdfData = {
  orderReference: string;
  requestedDateFrom: string | null;
  requestedDate: string | null;
  supplierName: string | null;
  vesselName: string | null;
  vesselImo: string | null;
  deliveryPort: string | null;
  incoterm: string | null;
  customerName: string | null;
  customerAddressLine: string | null;
  customerCity: string | null;
  customerPostalCode: string | null;
  customerCountryLabel: string | null;
  customerPoNumber: string | null;
  lines: PdfMofLine[];
};

const LINE_COLS = [
  { key: "product", label: "Product", width: "40%", num: false },
  { key: "pack", label: "Pack Size", width: "20%", num: true },
  { key: "packs", label: "Packs", width: "15%", num: true },
  { key: "qty", label: "Quantity", width: "25%", num: true },
] as const;

export const MofPdf = ({ data }: { data: MofPdfData }) => (
  <Document title={`Material Order Form ${data.orderReference}`}>
    <Page size="A4" orientation="portrait" style={styles.page}>
      <PageChrome docTitle={`Material Order Form - ${data.orderReference}`}>
        <Text style={styles.sectionTitle}>Supplier</Text>
        <InfoGrid
          items={[
            { label: "Supplier", value: data.supplierName ?? "—" },
            { label: "Requested Date", value: formatPdfDateRange(data.requestedDateFrom, data.requestedDate) },
            { label: "Customer PO", value: data.customerPoNumber ?? "—" },
          ]}
        />

        <Text style={styles.sectionTitle}>Ship To</Text>
        <InfoGrid
          items={[
            { label: "Vessel", value: `${data.vesselName ?? "—"}${data.vesselImo ? ` (IMO ${data.vesselImo})` : ""}` },
            { label: "Delivery Port", value: data.deliveryPort ?? "—" },
            { label: "Incoterm", value: data.incoterm ?? "—" },
            { label: "Customer", value: data.customerName ?? "—" },
            {
              label: "Address",
              value: [data.customerAddressLine, data.customerPostalCode, data.customerCity, data.customerCountryLabel]
                .filter(Boolean)
                .join(", ") || "—",
            },
          ]}
        />

        <Text style={styles.sectionTitle}>Order Lines</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            {LINE_COLS.map((col) => (
              <Text key={col.key} style={[styles.th, { width: col.width }, col.num ? right : {}]}>
                {col.label}
              </Text>
            ))}
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={i === data.lines.length - 1 ? styles.tableRowLast : styles.tableRow}>
              <Text style={[styles.td, { width: LINE_COLS[0].width }]}>{l.productLabel}</Text>
              <Text style={[styles.td, right, { width: LINE_COLS[1].width }]}>
                {l.packSize != null ? `${num(l.packSize)} ${l.unit ?? ""}` : "—"}
              </Text>
              <Text style={[styles.td, right, { width: LINE_COLS[2].width }]}>{num(l.orderedPacks)}</Text>
              <Text style={[styles.td, right, { width: LINE_COLS[3].width }]}>{l.orderedQty != null ? `${num(l.orderedQty)} ${l.unit ?? ""}`.trim() : "—"}</Text>
            </View>
          ))}
        </View>
      </PageChrome>
    </Page>
  </Document>
);
