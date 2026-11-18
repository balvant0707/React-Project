// Ported 1:1 from the NPM tool (app/src/pdf/styles.ts).
import { StyleSheet } from "@react-pdf/renderer";
import { BRAND_COLOR, TEXT_DARK, TEXT_MUTED, BORDER_COLOR, BG_LIGHT } from "./pdfTheme";

// Shared page chrome (cover, header/footer, tables) for both documents -
// same restrained, hairline-rule minimalism as the app itself, not a
// separate "print" identity. See ~/npm_tool/docs/domain-model.md for why the
// commercial Quotation and technical Specification stay two documents.
export const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: TEXT_DARK,
    paddingTop: 90,
    paddingBottom: 56,
    paddingHorizontal: 40,
  },

  // --- Title page (shared cover for both PDF documents, landscape) ---
  // One design for both Technical Specification and Quotation - only the
  // subtitle text and bottom-band meta lines differ per document (see
  // TitlePage in PdfChrome.tsx).
  titlePageImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "74%",
    objectFit: "cover",
  },
  titlePageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "74%",
    backgroundColor: "#0A1440",
    opacity: 0.28,
  },
  // A true diagonal linear-gradient isn't reliable across @react-pdf/renderer
  // versions - approximated with a flat, semi-transparent brand-blue wash
  // over the left side of the photo instead.
  titlePageBlueWash: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "55%",
    height: "74%",
    backgroundColor: BRAND_COLOR,
    opacity: 0.25,
  },
  // The icon crop keeps its own opaque navy fill (a self-contained badge),
  // and the wordmark is the white-silhouette crop - together they read fine
  // straight on the photo, no backing plate needed. See PdfChrome.tsx.
  titlePageLogoRow: {
    position: "absolute",
    top: 24,
    left: 28,
    flexDirection: "row",
    alignItems: "center",
  },
  titlePageLogoIcon: {
    width: 40,
    height: 40 / (460 / 458),
  },
  titlePageLogoWordmark: {
    width: 147,
    height: 36,
    marginLeft: 10,
  },
  titlePageTitleBlock: {
    position: "absolute",
    top: "36%",
    left: 32,
    right: 32,
  },
  titlePageTitleMain: {
    color: "#fff",
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
  },
  titlePageTitleSub: {
    color: "#fff",
    fontSize: 13,
    marginTop: 2,
  },
  titlePageProductLines: {
    marginTop: 18,
  },
  titlePageProductLine: {
    color: "#fff",
    fontSize: 12,
    marginBottom: 4,
  },
  titlePageBottomBand: {
    position: "absolute",
    top: "74%",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  titlePageVesselName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 8,
  },
  titlePageMetaLine: {
    fontSize: 11,
    color: TEXT_DARK,
    marginBottom: 3,
  },

  // --- Content pages ---
  header: {
    position: "absolute",
    top: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    paddingBottom: 10,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogoMark: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: BRAND_COLOR,
    marginRight: 6,
  },
  headerBrandText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: TEXT_DARK,
  },
  headerDocTitle: {
    fontSize: 9,
    color: TEXT_MUTED,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    paddingTop: 8,
    fontSize: 8,
    color: TEXT_MUTED,
  },

  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginTop: 18,
    marginBottom: 8,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 4,
  },
  infoCell: {
    width: "50%",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  infoLabel: {
    fontSize: 7,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 8,
  },

  // Letterhead-style two-column header (Customer / Reference side by side,
  // like a business letter) - each column gets the single-item-per-row
  // variant below rather than infoGrid/infoCell's 2-per-row, since a
  // 2-per-row grid squeezed into a half-width column reads too cramped.
  letterheadRow: {
    flexDirection: "row",
    columnGap: 16,
  },
  letterheadCol: {
    width: "50%",
  },
  infoListCell: {
    width: "100%",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },

  table: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 4,
    marginBottom: 4,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: BG_LIGHT,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  tableRowLast: {
    flexDirection: "row",
  },
  // One body text size (8) and one caption/header size (7) in every table; only headlines (sectionTitle, cover) and
  // the emphasized final total differ.
  th: {
    padding: 6,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  td: {
    padding: 6,
    fontSize: 8,
  },
  // Same text size as th/td - only the padding is tighter, for wide,
  // many-column tables (Areas & Coating System, Quotation by Area) that need
  // landscape's extra width plus denser rows to fit ~12 columns.
  thCompact: {
    padding: 4,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: TEXT_MUTED,
    textTransform: "uppercase",
  },
  tdCompact: {
    padding: 4,
    fontSize: 8,
  },
  tdMuted: {
    padding: 6,
    fontSize: 8,
    color: TEXT_MUTED,
  },

  totalsBox: {
    marginTop: 10,
    alignSelf: "flex-end",
    width: 260,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 4,
    padding: 10,
  },
  totalsCurrencyLabel: {
    fontSize: 7,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: "right",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalsLabel: {
    flex: 1,
    fontSize: 8,
    color: TEXT_MUTED,
  },
  totalsValue: {
    width: 90,
    fontSize: 8,
    textAlign: "right",
  },
  totalsFinalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  // Deliberately larger/bold - the one bottom-line figure meant to stand out,
  // same convention as sectionTitle - not part of the "same size" body text.
  totalsFinalLabel: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  totalsFinalValue: {
    width: 90,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND_COLOR,
    textAlign: "right",
  },

  paragraph: {
    fontSize: 8,
    lineHeight: 1.5,
    color: TEXT_DARK,
    marginBottom: 8,
  },
  bulletList: {
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bulletMark: {
    width: 12,
    fontSize: 8,
    color: BRAND_COLOR,
  },
  bulletText: {
    flex: 1,
    fontSize: 8,
    lineHeight: 1.4,
    color: TEXT_DARK,
  },
  mutedText: {
    fontSize: 8,
    color: TEXT_MUTED,
  },

  // Shown on both spec PDFs (Quotation, Technical Specification) while the
  // underlying Specification is still 'draft'/'under_review' - see
  // pdfExport.ts's showDraftWatermark and PdfChrome.tsx's DraftWatermark.
  // Centered, rotated, low-opacity - reads clearly without fighting the real
  // content underneath.
  draftWatermark: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  draftWatermarkText: {
    fontSize: 100,
    fontFamily: "Helvetica-Bold",
    color: TEXT_MUTED,
    opacity: 0.25,
    letterSpacing: 4,
    transform: "rotate(-30deg)",
  },

  // --- Photo grid / signature row (Dock Report + Daily Report PDFs) ---
  // space-between rather than a fixed 3-per-row gutter - simplest way to
  // get an even grid without the last row's remainder cards stretching to
  // fill the row (see pdf/DockReportPdf.tsx's PhotoGrid).
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 8,
  },
  photoCard: {
    width: "31%",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 4,
    padding: 6,
  },
  photoImage: {
    width: "100%",
    height: 90,
    objectFit: "cover",
    marginBottom: 4,
    backgroundColor: BG_LIGHT,
  },
  photoCaption: {
    fontSize: 7.5,
    color: TEXT_DARK,
    marginBottom: 2,
  },
  photoMeta: {
    fontSize: 6.5,
    color: TEXT_MUTED,
  },
  signatureRow: {
    flexDirection: "row",
    marginTop: 6,
    columnGap: 12,
  },
  signatureBox: {
    width: "32%",
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 4,
    padding: 8,
  },
  signatureImage: {
    width: "100%",
    height: 70,
    objectFit: "contain",
    marginBottom: 6,
    backgroundColor: BG_LIGHT,
  },
  signatureLabel: {
    fontSize: 7,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
});
