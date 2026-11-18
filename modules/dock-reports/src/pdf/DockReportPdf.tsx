// Ported 1:1 from the NPM tool (app/src/pdf/DockReportPdf.tsx).
import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { TitlePage, PageChrome, InfoGrid, BulletList, splitIntoBullets } from "@rbp/module-offers/src/pdf/PdfChrome.tsx";
import { styles } from "@rbp/module-offers/src/pdf/styles.ts";
import { formatPdfDate, num, right } from "@rbp/module-offers/src/pdf/pdfTheme.ts";

// Shared between this file (the whole compiled Dock Report) and
// DailyReportPdf.tsx (one day's own standalone report) - both render the
// same shape of weather reading, activity and photo, just filtered to a
// different set (see ~/npm_tool/docs/dock-report-module.md's include_in_daily_report/
// include_in_final_report flags: one photo pool, two curated subsets).
// Weather and activities are two separate repeatable series, not one
// merged row - see dock-report-module.md's "Daily log" decision.
export type PdfWeatherReading = {
  timeTaken: string | null;
  airTemperatureC: number | null;
  surfaceTemperatureC: number | null;
  dewPointC: number | null;
  relativeHumidityPct: number | null;
  windConditionText: string | null;
};

export type PdfActivity = {
  timeTaken: string | null;
  activityText: string | null;
  areaLabel: string | null;
  applicationMethodLabel: string | null;
};

export type PdfDailyLog = {
  logDate: string;
  reportedByName: string | null;
  narrativeText: string | null;
  weatherReadings: PdfWeatherReading[];
  activities: PdfActivity[];
};

export type PdfReportPhoto = {
  // Null when no display URL could be resolved at all (e.g. captured
  // offline and this device has since lost that browser storage) - the
  // grid renders a "No image" placeholder rather than dropping the row, so
  // the caption/metadata a real person entered is never silently lost.
  imageUrl: string | null;
  captionText: string | null;
  stageLabel: string | null;
  takenAt: string | null;
  areaLabel: string | null;
  // The specific activity this photo documents, if any (its activity_text).
  activityLabel: string | null;
};

export type PdfDockReportBatch = {
  batchNumber: string;
  drumQuantity: number | null;
  consumptionDate: string | null;
};

type PdfDockReportAreaProduct = {
  productLabel: string;
  colourLabel: string | null;
  coatModeLabel: string | null;
  coatPct: number | null;
  applicationMethodLabel: string | null;
  specDryFilmThicknessUm: number | null;
  measuredDryFilmThicknessUm: number | null;
  batches: PdfDockReportBatch[];
};

export type PdfDockReportArea = {
  areaLabel: string | null;
  sizeM2: number | null;
  substrateLabel: string | null;
  environmentLabel: string | null;
  surfacePreparationText: string | null;
  actualSurfacePreparationText: string | null;
  foulingExtentPct: number | null;
  foulingEvaluationLabel: string | null;
  conditionCommentsText: string | null;
  products: PdfDockReportAreaProduct[];
};

export type PdfDockReportSignature = {
  roleLabel: string;
  signerName: string | null;
  signedAt: string | null;
  imageUrl: string | null;
};

export type DockReportPdfData = {
  reportNumber: string;
  statusLabel: string;
  vesselName: string | null;
  vesselImo: string | null;
  hullEventTypeText: string | null;
  specificationNumber: string | null;
  technicalServiceRepName: string | null;
  salesAccountName: string | null;
  indockingDate: string | null;
  outdockingDate: string | null;
  timeZone: string | null;
  antifoulingLineFwdM: number | null;
  antifoulingLineAftM: number | null;
  boottopLineFwdM: number | null;
  boottopLineAftM: number | null;
  cathodicProtectionTypeLabel: string | null;
  cathodicProtectionAnodeCount: number | null;
  areas: PdfDockReportArea[];
  dailyLogs: PdfDailyLog[];
  // Already filtered to include_in_final_report=true by pdfExport.ts.
  photos: PdfReportPhoto[];
  signatures: PdfDockReportSignature[];
  remarksText: string | null;
  // True while dock_reports.status is still 'draft' - same convention as
  // the Specification PDFs' own draft watermark.
  showDraftWatermark: boolean;
};

const AREA_COLS = [
  { key: "product", label: "Product", width: "21%", num: false },
  { key: "colour", label: "Colour", width: "9%", num: false },
  { key: "mode", label: "Mode", width: "7%", num: false },
  { key: "pct", label: "Coat %", width: "6%", num: true },
  { key: "application", label: "Application", width: "11%", num: false },
  { key: "specDft", label: "Spec DFT (um)", width: "8%", num: true },
  { key: "measuredDft", label: "Measured DFT (um)", width: "10%", num: true },
  { key: "batches", label: "Batches / Drums", width: "28%", num: false },
] as const;

const WEATHER_COLS = [
  { key: "time", label: "Time", width: "12%", num: false },
  { key: "air", label: "Air °C", width: "16%", num: true },
  { key: "surface", label: "Surface °C", width: "18%", num: true },
  { key: "dew", label: "Dew Point", width: "18%", num: true },
  { key: "humidity", label: "Humidity %", width: "18%", num: true },
  { key: "wind", label: "Wind", width: "18%", num: false },
] as const;

const ACTIVITY_COLS = [
  { key: "time", label: "Time", width: "10%", num: false },
  { key: "activity", label: "Activity", width: "45%", num: false },
  { key: "area", label: "Area", width: "22%", num: false },
  { key: "application", label: "Application", width: "23%", num: false },
] as const;

// "B123 (4 drums, 12.03.2026)" - both drum count and consumption date are
// optional per batch (see dock_report_area_product_batches), so only the
// parts actually present are joined into the parenthetical.
const formatBatches = (batches: PdfDockReportBatch[]) => {
  if (!batches.length) return "—";
  return batches
    .map((b) => {
      const parts = [
        b.drumQuantity != null ? `${num(b.drumQuantity)} drums` : null,
        b.consumptionDate ? formatPdfDate(b.consumptionDate) : null,
      ].filter(Boolean);
      return parts.length ? `${b.batchNumber} (${parts.join(", ")})` : b.batchNumber;
    })
    .join("; ");
};

// Both reused by DailyReportPdf.tsx for its own single day's readings/
// activities - one definition of each table rather than two copies.
export const WeatherTable = ({ readings }: { readings: PdfWeatherReading[] }) => (
  <View style={[styles.table, { marginTop: 6 }]}>
    <View style={styles.tableHeaderRow}>
      {WEATHER_COLS.map((col) => (
        <Text key={col.key} style={[styles.thCompact, { width: col.width }, col.num ? right : {}]}>
          {col.label}
        </Text>
      ))}
    </View>
    {readings.map((w, i) => (
      <View key={i} style={i === readings.length - 1 ? styles.tableRowLast : styles.tableRow}>
        <Text style={[styles.tdCompact, { width: WEATHER_COLS[0].width }]}>{w.timeTaken ?? "—"}</Text>
        <Text style={[styles.tdCompact, right, { width: WEATHER_COLS[1].width }]}>{num(w.airTemperatureC)}</Text>
        <Text style={[styles.tdCompact, right, { width: WEATHER_COLS[2].width }]}>{num(w.surfaceTemperatureC)}</Text>
        <Text style={[styles.tdCompact, right, { width: WEATHER_COLS[3].width }]}>{num(w.dewPointC)}</Text>
        <Text style={[styles.tdCompact, right, { width: WEATHER_COLS[4].width }]}>{num(w.relativeHumidityPct)}</Text>
        <Text style={[styles.tdCompact, { width: WEATHER_COLS[5].width }]}>{w.windConditionText ?? "—"}</Text>
      </View>
    ))}
  </View>
);

export const ActivitiesTable = ({ activities }: { activities: PdfActivity[] }) => (
  <View style={[styles.table, { marginTop: 6 }]}>
    <View style={styles.tableHeaderRow}>
      {ACTIVITY_COLS.map((col) => (
        <Text key={col.key} style={[styles.thCompact, { width: col.width }, col.num ? right : {}]}>
          {col.label}
        </Text>
      ))}
    </View>
    {activities.map((a, i) => (
      <View key={i} style={i === activities.length - 1 ? styles.tableRowLast : styles.tableRow}>
        <Text style={[styles.tdCompact, { width: ACTIVITY_COLS[0].width }]}>{a.timeTaken ?? "—"}</Text>
        <Text style={[styles.tdCompact, { width: ACTIVITY_COLS[1].width }]}>{a.activityText ?? "—"}</Text>
        <Text style={[styles.tdCompact, { width: ACTIVITY_COLS[2].width }]}>{a.areaLabel ?? "—"}</Text>
        <Text style={[styles.tdCompact, { width: ACTIVITY_COLS[3].width }]}>{a.applicationMethodLabel ?? "—"}</Text>
      </View>
    ))}
  </View>
);

// Also reused by DailyReportPdf.tsx - same "no image" fallback either way,
// since a signed URL/local blob can fail to resolve on either document.
export const PhotoGrid = ({ photos }: { photos: PdfReportPhoto[] }) =>
  photos.length === 0 ? (
    <Text style={styles.mutedText}>No photos in this set.</Text>
  ) : (
    <View style={styles.photoGrid}>
      {photos.map((p, i) => (
        <View key={i} style={styles.photoCard} wrap={false}>
          {p.imageUrl ? (
            <Image src={p.imageUrl} style={styles.photoImage} />
          ) : (
            <View style={[styles.photoImage, { alignItems: "center", justifyContent: "center" }]}>
              <Text style={styles.mutedText}>No image</Text>
            </View>
          )}
          {p.captionText && <Text style={styles.photoCaption}>{p.captionText}</Text>}
          <Text style={styles.photoMeta}>{[p.stageLabel, p.areaLabel, p.activityLabel, formatPdfDate(p.takenAt)].filter(Boolean).join(" · ") || "—"}</Text>
        </View>
      ))}
    </View>
  );

const SignatureRow = ({ signatures }: { signatures: PdfDockReportSignature[] }) => (
  <View style={styles.signatureRow}>
    {signatures.map((s, i) => (
      <View key={i} style={styles.signatureBox}>
        <Text style={styles.signatureLabel}>{s.roleLabel}</Text>
        {s.imageUrl ? (
          <Image src={s.imageUrl} style={styles.signatureImage} />
        ) : (
          <View style={[styles.signatureImage, { alignItems: "center", justifyContent: "center" }]}>
            <Text style={styles.mutedText}>Not signed</Text>
          </View>
        )}
        <Text style={styles.signatureName}>{s.signerName ?? "—"}</Text>
        <Text style={styles.mutedText}>{formatPdfDate(s.signedAt)}</Text>
      </View>
    ))}
  </View>
);

export const DockReportPdf = ({ data }: { data: DockReportPdfData }) => (
  <Document title={`Dock Report ${data.reportNumber}`}>
    <TitlePage
      subtitle="Dry Dock Report"
      vesselName={data.vesselName ?? "—"}
      metaLines={[
        `IMO: ${data.vesselImo ?? "—"}`,
        ...(data.hullEventTypeText ? [`Hull event: ${data.hullEventTypeText}`] : []),
        `Report: ${data.reportNumber || "—"}`,
        ...(data.specificationNumber ? [`Specification: ${data.specificationNumber}`] : []),
      ]}
      watermark={data.showDraftWatermark}
    />

    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageChrome docTitle={`Dock Report ${data.reportNumber}`} watermark={data.showDraftWatermark}>
        <Text style={styles.sectionTitle}>Vessel & Report</Text>
        <InfoGrid
          items={[
            { label: "Vessel", value: `${data.vesselName ?? "—"} (IMO ${data.vesselImo ?? "—"})` },
            { label: "Report number", value: data.reportNumber || "—" },
            { label: "Status", value: data.statusLabel },
            { label: "In-docking", value: formatPdfDate(data.indockingDate) },
            { label: "Out-docking", value: formatPdfDate(data.outdockingDate) },
            { label: "Times in", value: data.timeZone ? data.timeZone.replace(/_/g, " ") : "—" },
            { label: "Technical Service Rep", value: data.technicalServiceRepName ?? "—" },
            { label: "Sales Account", value: data.salesAccountName ?? "—" },
            { label: "Specification", value: data.specificationNumber ?? "—" },
          ]}
        />

        <Text style={styles.sectionTitle}>Antifouling / Boottop / Cathodic Protection</Text>
        <InfoGrid
          items={[
            { label: "AF line fwd", value: data.antifoulingLineFwdM != null ? `${num(data.antifoulingLineFwdM)} m` : "—" },
            { label: "AF line aft", value: data.antifoulingLineAftM != null ? `${num(data.antifoulingLineAftM)} m` : "—" },
            { label: "Boottop fwd", value: data.boottopLineFwdM != null ? `${num(data.boottopLineFwdM)} m` : "—" },
            { label: "Boottop aft", value: data.boottopLineAftM != null ? `${num(data.boottopLineAftM)} m` : "—" },
            { label: "Cathodic protection", value: data.cathodicProtectionTypeLabel ?? "—" },
            { label: "Anode count", value: num(data.cathodicProtectionAnodeCount) },
          ]}
        />
      </PageChrome>
    </Page>

    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageChrome docTitle={`Dock Report ${data.reportNumber}`} watermark={data.showDraftWatermark}>
        <Text style={styles.sectionTitle}>Areas & Coating System (Actual)</Text>
        {data.areas.length === 0 && <Text style={styles.mutedText}>No areas recorded.</Text>}
        {data.areas.map((area, areaIndex) => (
          <View key={areaIndex} style={{ marginBottom: 14 }} wrap={false}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
              {area.areaLabel ?? "Area"} {area.sizeM2 != null ? `— ${num(area.sizeM2)} m²` : ""}
            </Text>
            <InfoGrid
              items={[
                { label: "Substrate", value: area.substrateLabel ?? "—" },
                { label: "Environment", value: area.environmentLabel ?? "—" },
                { label: "Fouling extent", value: area.foulingExtentPct != null ? `${num(area.foulingExtentPct)}%` : "—" },
                { label: "Fouling evaluation", value: area.foulingEvaluationLabel ?? "—" },
              ]}
            />
            {(area.surfacePreparationText || area.actualSurfacePreparationText) && (
              <View style={{ flexDirection: "row", marginTop: 6, columnGap: 12 }}>
                {area.surfacePreparationText && (
                  <View style={{ width: "50%" }}>
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Surface preparation (spec)</Text>
                    <BulletList items={splitIntoBullets(area.surfacePreparationText)} />
                  </View>
                )}
                {area.actualSurfacePreparationText && (
                  <View style={{ width: "50%" }}>
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Surface preparation (actual)</Text>
                    <BulletList items={splitIntoBullets(area.actualSurfacePreparationText)} />
                  </View>
                )}
              </View>
            )}
            {area.conditionCommentsText && (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Condition comments</Text>
                <BulletList items={splitIntoBullets(area.conditionCommentsText)} />
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
                  <Text style={[styles.tdCompact, right, { width: AREA_COLS[5].width }]}>{num(p.specDryFilmThicknessUm)}</Text>
                  <Text style={[styles.tdCompact, right, { width: AREA_COLS[6].width }]}>{num(p.measuredDryFilmThicknessUm)}</Text>
                  <Text style={[styles.tdCompact, { width: AREA_COLS[7].width }]}>{formatBatches(p.batches)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </PageChrome>
    </Page>

    {data.dailyLogs.length > 0 && (
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PageChrome docTitle={`Dock Report ${data.reportNumber}`} watermark={data.showDraftWatermark}>
          <Text style={styles.sectionTitle}>Daily Log</Text>
          {data.dailyLogs.map((log, i) => (
            <View key={i} style={{ marginBottom: 14 }} wrap={false}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{formatPdfDate(log.logDate)}</Text>
              {log.reportedByName && <Text style={styles.mutedText}>Reported by {log.reportedByName}</Text>}
              {log.narrativeText && <Text style={[styles.paragraph, { marginTop: 4 }]}>{log.narrativeText}</Text>}
              {log.weatherReadings.length > 0 && (
                <>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 6 }}>Weather</Text>
                  <WeatherTable readings={log.weatherReadings} />
                </>
              )}
              {log.activities.length > 0 && (
                <>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 6 }}>Activities</Text>
                  <ActivitiesTable activities={log.activities} />
                </>
              )}
            </View>
          ))}
        </PageChrome>
      </Page>
    )}

    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageChrome docTitle={`Dock Report ${data.reportNumber}`} watermark={data.showDraftWatermark}>
        <Text style={styles.sectionTitle}>Photos (Final Report Set)</Text>
        <PhotoGrid photos={data.photos} />

        <Text style={styles.sectionTitle}>Signatures</Text>
        <SignatureRow signatures={data.signatures} />

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
