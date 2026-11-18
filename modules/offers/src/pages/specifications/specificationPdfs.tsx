// Ported 1:1 from the NPM tool (app/src/pages/specifications/specificationPdfs.tsx).
// The two specification PDFs as files: loads what the data builders (pdfExport.ts) need and renders the document.
import { pdf } from "@react-pdf/renderer";
import { TechnicalSpecPdf } from "../../pdf/TechnicalSpecPdf";
import { QuotationPdf } from "../../pdf/QuotationPdf";
import { loadPhraseOptions } from "@rbp/core";
import { buildQuotationPdfData, buildTechnicalSpecPdfData } from "./pdfExport";
import { loadOvercoatingIntervals } from "./specificationApi";

export type PdfFile = { blob: Blob; filename: string };

type TechnicalSpecParams = Omit<Parameters<typeof buildTechnicalSpecPdfData>[0], "overcoatingIntervals">;
type QuotationParams = Omit<Parameters<typeof buildQuotationPdfData>[0], "termsAndConditionsText">;

export async function technicalSpecPdf(params: TechnicalSpecParams): Promise<PdfFile> {
  const { values, lineItems, areas, packagingById } = params;
  const packagingIds = [...lineItems.map((li) => li.product_packaging_id), ...areas.flatMap((a) => a.products.map((p) => p.product_packaging_id))];
  const productIds = Array.from(new Set(packagingIds.map((pid) => (pid ? packagingById.get(pid)?.product_id : undefined)).filter((v): v is string => !!v)));
  const overcoatingIntervals = await loadOvercoatingIntervals(productIds, values.supplier_id);
  const data = buildTechnicalSpecPdfData({ ...params, overcoatingIntervals });
  const blob = await pdf(<TechnicalSpecPdf data={data} />).toBlob();
  return { blob, filename: `Technical-Specification-${values.specification_number ?? "draft"}.pdf` };
}

// The terms and conditions are the first phrase of their category.
export async function quotationPdf(params: QuotationParams): Promise<PdfFile> {
  const termsAndConditionsText = (await loadPhraseOptions("terms_and_conditions"))[0]?.label ?? null;
  const data = buildQuotationPdfData({ ...params, termsAndConditionsText });
  const blob = await pdf(<QuotationPdf data={data} />).toBlob();
  return { blob, filename: `Quotation-${params.values.specification_number ?? "draft"}.pdf` };
}
