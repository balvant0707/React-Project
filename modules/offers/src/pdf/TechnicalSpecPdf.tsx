// Ported 1:1 from the NPM tool (app/src/pdf/TechnicalSpecPdf.tsx).
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { TitlePage, PageChrome, InfoGrid, BulletList, splitIntoBullets } from "./PdfChrome";
import { styles } from "./styles";
import { formatPdfDate, num, right } from "./pdfTheme";

// One row per (product pair or undocking, DFT band) actually used in an
// area's coat sequence - see pdfExport.ts. intervalsText lists every
// temperature point for that combination as one text cell ("at -10°C:
// 34h-90d; at 0°C: 16h-56d; ...") rather than fixed 5/10/20/30°C columns -
// the real overcoating-interval data sheets don't share one fixed
// temperature set (4 points on the legacy export, 7 on the real sheet), so
// a fixed-width grid can't represent every case.
export type PdfOvercoatWindow = {
  label: string;
  dftRangeLabel: string | null;
  intervalsText: string;
};

type PdfAreaProduct = {
  productLabel: string;
  colourLabel: string | null;
  coatModeLabel: string | null;
  coatPct: number | null;
  applicationMethodLabel: string | null;
  sizeM2: number | null;
  solidsVolumePct: number | null;
  dryFilmThicknessUm: number | null;
  wetFilmThicknessUm: number | null;
  theoreticalSpreadingRate: number | null;
  lossFactorPct: number | null;
  quantityL: number | null;
  quantityUnit: string | null;
};

type PdfArea = {
  areaLabel: string | null;
  sizeM2: number | null;
  substrateLabel: string | null;
  environmentLabel: string | null;
  numberOfCoats: number | null;
  surfacePreparationText: string | null;
  overcoatWindows: PdfOvercoatWindow[];
  products: PdfAreaProduct[];
};

type PdfFlatProduct = {
  productLabel: string;
  quantity: number | null;
  unit: string | null;
};

export type TechnicalSpecPdfData = {
  specificationNumber: string;
  version: number;
  specificationDate: string | null;
  tenantName: string | null;
  vesselName: string | null;
  vesselImo: string | null;
  hullEventTypeText: string | null;
  hullEventQuarterYear: string | null;
  antifoulingSummaryLines: string[];
  speed: number | null;
  deliveryPort: string | null;
  placeOfApplication: string | null;
  isDrydock: boolean;
  areas: PdfArea[];
  flatProducts: PdfFlatProduct[];
  remarksText: string | null;
  // Manager review process (~/npm_tool/docs/domain-model.md) - true while the spec is
  // 'draft'/'under_review', see pdfExport.ts.
  showDraftWatermark: boolean;
};


// Column widths for the wide Areas & Coating table - landscape's extra width
// (vs. the cover page, which stays portrait for the hero design) is what
// makes this many columns fit without every cell wrapping.
const AREA_COLS = [
  { key: "product", label: "Product", width: "20%", num: false },
  { key: "colour", label: "Colour", width: "9%", num: false },
  { key: "mode", label: "Mode", width: "6%", num: false },
  { key: "pct", label: "Coat %", width: "6%", num: true },
  { key: "application", label: "Application", width: "10%", num: false },
  { key: "vs", label: "VS %", width: "6%", num: true },
  { key: "dft", label: "DFT (um)", width: "7%", num: true },
  { key: "wft", label: "WFT (um)", width: "7%", num: true },
  { key: "area", label: "Area (m2)", width: "7%", num: true },
  { key: "tsr", label: "TSR (m2/L)", width: "7%", num: true },
  { key: "lf", label: "LF %", width: "6%", num: true },
  { key: "qty", label: "Quantity", width: "9%", num: true },
] as const;

export const TechnicalSpecPdf = ({ data }: { data: TechnicalSpecPdfData }) => {
  const hullEventSummary = [data.hullEventTypeText, data.hullEventQuarterYear].filter(Boolean).join(" ") || null;
  return (
  <Document title={`Technical Specification ${data.specificationNumber}`}>
    <TitlePage
      subtitle="Paint Specification"
      productLines={data.antifoulingSummaryLines}
      vesselName={data.vesselName ?? "—"}
      metaLines={[
        `IMO: ${data.vesselImo ?? "—"}`,
        ...(hullEventSummary ? [`Hull event: ${hullEventSummary}`] : []),
        `Project: NPM ${data.specificationNumber}`,
      ]}
      watermark={data.showDraftWatermark}
    />
    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageChrome docTitle={`Technical Specification ${data.specificationNumber}`} watermark={data.showDraftWatermark}>
        <Text style={styles.sectionTitle}>Vessel & Specification</Text>
        <InfoGrid
          items={[
            { label: "Vessel", value: `${data.vesselName ?? "—"} (IMO ${data.vesselImo ?? "—"})` },
            { label: "Speed", value: data.speed != null ? `${data.speed} kn` : "—" },
            { label: "Specification", value: `${data.specificationNumber} - v${data.version}` },
            { label: "Date", value: formatPdfDate(data.specificationDate) },
            { label: "Delivery port", value: data.deliveryPort ?? "—" },
            { label: "Place of application", value: data.placeOfApplication ?? "—" },
          ]}
        />

        {data.isDrydock ? (
          <>
            <Text style={styles.sectionTitle}>Areas & Coating System</Text>
            {data.areas.map((area, areaIndex) => (
              <View key={areaIndex} style={{ marginBottom: 14 }} wrap={false}>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
                  {area.areaLabel ?? "Area"} {area.sizeM2 != null ? `— ${num(area.sizeM2)} m²` : ""}
                </Text>
                <InfoGrid
                  items={[
                    { label: "Substrate", value: area.substrateLabel ?? "—" },
                    { label: "Environment", value: area.environmentLabel ?? "—" },
                    { label: "Number of coats", value: num(area.numberOfCoats) },
                  ]}
                />
                {area.surfacePreparationText && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Surface preparation</Text>
                    <BulletList items={splitIntoBullets(area.surfacePreparationText)} />
                  </View>
                )}
                <View style={[styles.table, { marginTop: 6 }]}>
                  <View style={styles.tableHeaderRow}>
                    {AREA_COLS.map((col) => (
                      <Text key={col.key} style={[styles.thCompact, { width: col.width }, col.num ? right : {}]}>
                        {col.label}
                      </Text>
                    ))}
                  </View>
                  {area.products.map((p, i) => (
                    <View key={i} style={i === area.products.length - 1 ? styles.tableRowLast : styles.tableRow}>
                      <Text style={[styles.tdCompact, { width: AREA_COLS[0].width }]}>{p.productLabel}</Text>
                      <Text style={[styles.tdCompact, { width: AREA_COLS[1].width }]}>{p.colourLabel ?? "—"}</Text>
                      <Text style={[styles.tdCompact, { width: AREA_COLS[2].width }]}>{p.coatModeLabel ?? "—"}</Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[3].width }]}>{p.coatPct != null ? `${p.coatPct}%` : "—"}</Text>
                      <Text style={[styles.tdCompact, { width: AREA_COLS[4].width }]}>{p.applicationMethodLabel ?? "—"}</Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[5].width }]}>{num(p.solidsVolumePct)}</Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[6].width }]}>{num(p.dryFilmThicknessUm)}</Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[7].width }]}>{num(p.wetFilmThicknessUm)}</Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[8].width }]}>{num(p.sizeM2)}</Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[9].width }]}>
                        {p.theoreticalSpreadingRate != null ? p.theoreticalSpreadingRate.toFixed(2) : "—"}
                      </Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[10].width }]}>{num(p.lossFactorPct)}</Text>
                      <Text style={[styles.tdCompact, right, { width: AREA_COLS[11].width }]}>
                        {p.quantityL != null ? `${num(p.quantityL)} ${p.quantityUnit ?? ""}`.trim() : "—"}
                      </Text>
                    </View>
                  ))}
                </View>
                {area.overcoatWindows.length > 0 && (
                  <View style={[styles.table, { marginTop: 6 }]}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.th, { width: "28%" }]}>Overcoating interval</Text>
                      <Text style={[styles.th, { width: "14%" }]}>DFT range</Text>
                      <Text style={[styles.th, { width: "58%" }]}>By temperature</Text>
                    </View>
                    {area.overcoatWindows.map((w, i) => (
                      <View key={i} style={i === area.overcoatWindows.length - 1 ? styles.tableRowLast : styles.tableRow}>
                        <Text style={[styles.td, { width: "28%" }]}>{w.label}</Text>
                        <Text style={[styles.td, { width: "14%" }]}>{w.dftRangeLabel ?? "—"}</Text>
                        <Text style={[styles.td, { width: "58%" }]}>{w.intervalsText}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
            <Text style={styles.sectionTitle}>Abbreviations</Text>
            <InfoGrid
              items={[
                { label: "DFT / WFT", value: "Dry / Wet Film Thickness" },
                { label: "TSR", value: "Theoretical Spreading Rate (m2/L)" },
                { label: "LF", value: "Loss Factor" },
                { label: "VS", value: "Volume Solids" },
                { label: "CP", value: "Coverage, practical (m2/L)" },
                { label: "T/U, F/C", value: "Touch-Up, Full Coat" },
              ]}
            />
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Products</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.th, { width: "70%" }]}>Product</Text>
                <Text style={[styles.th, right, { width: "30%" }]}>Quantity</Text>
              </View>
              {data.flatProducts.map((p, i) => (
                <View key={i} style={i === data.flatProducts.length - 1 ? styles.tableRowLast : styles.tableRow}>
                  <Text style={[styles.td, { width: "70%" }]}>{p.productLabel}</Text>
                  <Text style={[styles.td, right, { width: "30%" }]}>{p.quantity != null ? `${num(p.quantity)} ${p.unit ?? ""}`.trim() : "—"}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {data.remarksText && (
          <>
            <Text style={styles.sectionTitle}>Remarks</Text>
            <BulletList items={splitIntoBullets(data.remarksText)} />
          </>
        )}
      </PageChrome>
    </Page>
  </Document>
  );
};
