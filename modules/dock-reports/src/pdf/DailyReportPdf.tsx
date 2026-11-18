// Ported 1:1 from the NPM tool (app/src/pdf/DailyReportPdf.tsx).
import { Document, Page, Text } from "@react-pdf/renderer";
import { PageChrome, InfoGrid, BulletList, splitIntoBullets } from "@rbp/module-offers/src/pdf/PdfChrome.tsx";
import { styles } from "@rbp/module-offers/src/pdf/styles.ts";
import { formatPdfDate } from "@rbp/module-offers/src/pdf/pdfTheme.ts";
import { WeatherTable, ActivitiesTable, PhotoGrid, type PdfWeatherReading, type PdfActivity, type PdfReportPhoto } from "./DockReportPdf";

// One single day, standalone - the document actually handed out during the
// docking itself, distinct from the whole compiled Dock Report (see
// ~/npm_tool/docs/dock-report-module.md: dock_report_photos' include_in_daily_report/
// include_in_final_report flags exist because "a compiler curate[s] a
// smaller final-report subset from a larger daily-report pool" - this is
// that daily-report pool, for one specific day, not the final subset).
export type DailyReportPdfData = {
  reportNumber: string;
  vesselName: string | null;
  vesselImo: string | null;
  logDate: string;
  reportedByName: string | null;
  narrativeText: string | null;
  weatherReadings: PdfWeatherReading[];
  activities: PdfActivity[];
  // Already filtered to this day's own dock_report_daily_log_id and
  // include_in_daily_report=true by pdfExport.ts.
  photos: PdfReportPhoto[];
};

export const DailyReportPdf = ({ data }: { data: DailyReportPdfData }) => (
  <Document title={`Daily Report - ${data.vesselName ?? ""} - ${data.logDate}`}>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageChrome docTitle={`Daily Report - ${formatPdfDate(data.logDate)}`}>
        <Text style={styles.sectionTitle}>Vessel & Day</Text>
        <InfoGrid
          items={[
            { label: "Vessel", value: `${data.vesselName ?? "—"} (IMO ${data.vesselImo ?? "—"})` },
            { label: "Dock report", value: data.reportNumber || "—" },
            { label: "Date", value: formatPdfDate(data.logDate) },
            { label: "Reported by", value: data.reportedByName ?? "—" },
          ]}
        />

        {data.narrativeText && (
          <>
            <Text style={styles.sectionTitle}>Narrative</Text>
            <BulletList items={splitIntoBullets(data.narrativeText)} />
          </>
        )}

        {data.weatherReadings.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Weather</Text>
            <WeatherTable readings={data.weatherReadings} />
          </>
        )}

        {data.activities.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Activities</Text>
            <ActivitiesTable activities={data.activities} />
          </>
        )}

        <Text style={styles.sectionTitle}>Photos</Text>
        <PhotoGrid photos={data.photos} />
      </PageChrome>
    </Page>
  </Document>
);
