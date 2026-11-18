// Ported 1:1 from the NPM tool (app/src/pages/specifications/pdfExport.ts).
// Pure data-shaping for both PDF exports: the editor's state -> the data objects TechnicalSpecPdf / QuotationPdf
// render. No side effects; loading and rendering are in specificationPdfs.tsx. Both take all lines and print only the
// offered ones.
import { incotermText } from "../../modules/phrases/incoterm";
import { formatInstant } from "@rbp/ui";
import { userTimeZone } from "@rbp/ui";
import { offerTotals, offeredLines, type LineItemRow } from "./lineItemCalc";
import { computeWetFilmThicknessUm } from "./areaCalc";
import type { AreaRow, PackagingInfo } from "./areasEditor";
import type { DiscountRow } from "./mappers";
import { optionLabel, type PhraseOption as Option } from "@rbp/core";
import type { TechnicalSpecPdfData } from "../../pdf/TechnicalSpecPdf";
import type { QuotationPdfData } from "../../pdf/QuotationPdf";
import { buildAntifoulingSummary } from "../../pdf/antifoulingSummary";
import { formatQuarterYear, num } from "../../pdf/pdfTheme";
import type { PdfOvercoatWindow } from "../../pdf/TechnicalSpecPdf";


// One row of product_overcoating_intervals for a product of this specification and its header supplier
// (loadOvercoatingIntervals). Read live from the catalog, not snapshotted onto the specification.
export type OvercoatingIntervalRecord = {
  product_id: string;
  overcoated_with_product_id: string | null;
  supplier_id: string;
  interval_type: "overcoat" | "undocking";
  dry_film_thickness_minimum_um: number | null;
  dry_film_thickness_maximum_um: number | null;
  temperature_celsius: number;
  minimum_value: number | null;
  minimum_unit: string | null;
  maximum_value: number | null;
  maximum_unit: string | null;
  no_maximum: boolean;
  interval_text_override: string | null;
};

// The numeric fields are the source of truth; the phrase shown on the PDF
// ("34h-90d", "No max") is generated from them, not stored twice - see the
// product_overcoating_intervals migration. interval_text_override only
// covers a phrase that doesn't reduce to this pattern.
const formatIntervalPhrase = (row: OvercoatingIntervalRecord): string => {
  if (row.interval_text_override) return row.interval_text_override;
  const min = row.minimum_value != null ? `${num(row.minimum_value)}${row.minimum_unit ?? ""}` : null;
  const max = row.no_maximum ? "No max" : row.maximum_value != null ? `${num(row.maximum_value)}${row.maximum_unit ?? ""}` : null;
  if (min == null && max == null) return "—";
  if (min == null) return max!;
  if (max == null) return min;
  return `${min}–${max}`;
};

type SpecLike = {
  specification_number?: string | null;
  version?: number | null;
  status?: string | null;
  hull_event_type_code?: string | null;
  vessels?: { name?: string | null; imo?: string | null } | null;
  hull_events?: { event_date?: string | null; phrases?: { text_en?: string | null } | null } | null;
} | null;

// Manager review process (~/npm_tool/docs/domain-model.md): the DRAFT watermark stays
// on both spec PDFs until a spec is Approved (or Accepted) - i.e. while
// still 'draft' or 'under_review' (SS skips 'under_review' entirely, so
// this simplifies to just 'draft' for those specs).
// Seastock offers need no approval (20261105100000), so they never carry the mark.
const showDraftWatermark = (spec: SpecLike) =>
  spec?.hull_event_type_code !== "SS" && (spec?.status === "draft" || spec?.status === "under_review");

export function buildTechnicalSpecPdfData(params: {
  values: Record<string, any>;
  spec: SpecLike;
  usesAreaBreakdown: boolean;
  areas: AreaRow[];
  lineItems: LineItemRow[];
  packagingById: Map<string, PackagingInfo>;
  overcoatingIntervals: OvercoatingIntervalRecord[];
  tenantOptions: Option[];
  areaOptions: Option[];
  // Keyed by spec_areas.id (== an area row's area_id) - only used to tell
  // the antifouling cover summary which area is Flat Bottom, see below.
  areaAfZoneById: Map<string, string | null>;
  substrateOptions: Option[];
  environmentOptions: Option[];
  coatModeOptions: Option[];
  applicationMethodOptions: Option[];
  portOptions: Option[];
}): TechnicalSpecPdfData {
  const {
    values,
    spec,
    usesAreaBreakdown,
    areas,
    lineItems,
    packagingById,
    overcoatingIntervals,
    tenantOptions,
    areaOptions,
    areaAfZoneById,
    substrateOptions,
    environmentOptions,
    coatModeOptions,
    applicationMethodOptions,
    portOptions,
  } = params;

  return {
    specificationNumber: values.specification_number ?? spec?.specification_number ?? "",
    version: values.version ?? spec?.version ?? 1,
    specificationDate: values.specification_date ? values.specification_date.format("YYYY-MM-DD") : null,
    tenantName: optionLabel(tenantOptions, values.team_id),
    vesselName: spec?.vessels?.name ?? null,
    vesselImo: spec?.vessels?.imo ?? null,
    hullEventTypeText: spec?.hull_events?.phrases?.text_en ?? null,
    hullEventQuarterYear: formatQuarterYear(spec?.hull_events?.event_date),
    antifoulingSummaryLines: buildAntifoulingSummary(
      areas.map((a) => {
        const antifoulingProduct = a.products.find(
          (p) => p.product_packaging_id && packagingById.get(p.product_packaging_id)?.groupCode === "antifouling",
        );
        return {
          isFlatBottom: (a.area_id ? areaAfZoneById.get(a.area_id) : null) === "flat_bottom",
          surfacePreparationText: a.surface_preparation_text,
          antifoulingProductName: antifoulingProduct ? (packagingById.get(antifoulingProduct.product_packaging_id!)?.name ?? null) : null,
        };
      }),
    ),
    speed: values.speed ?? null,
    deliveryPort: optionLabel(portOptions, values.port_id),
    placeOfApplication: values.place_of_application ?? null,
    isDrydock: usesAreaBreakdown,
    areas: areas.map((a) => {
      // One window per (product pair or undocking, DFT band) actually used
      // by this area's own coat sequence - looked up from the catalog by
      // product pair + the coat's own DFT, not a flat per-product lookup
      // (see product_overcoating_intervals). The last coat in the sequence
      // has no "next" product, so it looks up 'undocking' rows instead.
      const overcoatWindows: PdfOvercoatWindow[] = [];
      const seenWindowKeys = new Set<string>();
      a.products.forEach((p, i) => {
        const pkg = packagingById.get(p.product_packaging_id ?? "");
        const fromProductId = pkg?.product_id ?? null;
        if (!fromProductId) return;
        const coatDft = p.dry_film_thickness_um ?? pkg?.dry_film_thickness_um ?? null;
        const nextPkg = packagingById.get(a.products[i + 1]?.product_packaging_id ?? "");
        const toProductId = nextPkg?.product_id ?? null;

        const matchesDft = (row: OvercoatingIntervalRecord) =>
          (row.dry_film_thickness_minimum_um == null || coatDft == null || coatDft >= row.dry_film_thickness_minimum_um) &&
          (row.dry_film_thickness_maximum_um == null || coatDft == null || coatDft <= row.dry_film_thickness_maximum_um);

        const rows = toProductId
          ? overcoatingIntervals.filter(
              (row) =>
                row.interval_type === "overcoat" &&
                row.product_id === fromProductId &&
                row.overcoated_with_product_id === toProductId &&
                matchesDft(row),
            )
          : overcoatingIntervals.filter((row) => row.interval_type === "undocking" && row.product_id === fromProductId && matchesDft(row));
        if (rows.length === 0) return;

        const dftMin = rows[0].dry_film_thickness_minimum_um;
        const dftMax = rows[0].dry_film_thickness_maximum_um;
        const windowKey = `${fromProductId}|${toProductId ?? "undocking"}|${dftMin ?? ""}|${dftMax ?? ""}`;
        if (seenWindowKeys.has(windowKey)) return;
        seenWindowKeys.add(windowKey);

        overcoatWindows.push({
          label: toProductId ? `${pkg?.name ?? "?"} → ${nextPkg?.name ?? "?"}` : `${pkg?.name ?? "?"} (undocking)`,
          dftRangeLabel: dftMin != null || dftMax != null ? `${dftMin != null ? num(dftMin) : "—"}–${dftMax != null ? num(dftMax) : "—"} µm` : null,
          intervalsText: [...rows]
            .sort((x, y) => x.temperature_celsius - y.temperature_celsius)
            .map((row) => `at ${num(row.temperature_celsius)}°C: ${formatIntervalPhrase(row)}`)
            .join("; "),
        });
      });

      return {
        areaLabel: optionLabel(areaOptions, a.area_id),
        sizeM2: a.size_m2,
        substrateLabel: optionLabel(substrateOptions, a.substrate_phrase_id),
        environmentLabel: optionLabel(environmentOptions, a.environment_standard_phrase_id),
        numberOfCoats: a.products.length,
        surfacePreparationText: a.surface_preparation_text,
        overcoatWindows,
        products: a.products.map((p) => {
          const pkg = packagingById.get(p.product_packaging_id ?? "");
          const dryFilmThicknessUm = p.dry_film_thickness_um ?? pkg?.dry_film_thickness_um ?? null;
          return {
            productLabel: pkg?.label ?? "—",
            colourLabel: pkg?.colour ?? null,
            coatModeLabel: optionLabel(coatModeOptions, p.coat_mode_phrase_id),
            coatPct: p.coat_pct,
            applicationMethodLabel: optionLabel(applicationMethodOptions, p.application_method_phrase_id),
            sizeM2: p.size_m2 ?? a.size_m2,
            solidsVolumePct: pkg?.solids_volume_pct ?? null,
            dryFilmThicknessUm,
            wetFilmThicknessUm: computeWetFilmThicknessUm(dryFilmThicknessUm, pkg?.solids_volume_pct ?? null),
            theoreticalSpreadingRate: p.theoretical_spreading_rate,
            lossFactorPct: p.loss_factor_pct ?? a.loss_factor_pct,
            quantityL: p.quantity_l,
            quantityUnit: pkg?.unit ?? null,
          };
        }),
      };
    }),
    flatProducts: offeredLines(lineItems).map((li) => ({
      productLabel: packagingById.get(li.product_packaging_id ?? "")?.label ?? "—",
      quantity: li.offered_qty,
      unit: packagingById.get(li.product_packaging_id ?? "")?.unit ?? null,
    })),
    remarksText: values.remarks_text ?? null,
    showDraftWatermark: showDraftWatermark(spec),
  };
}

export function buildQuotationPdfData(params: {
  values: Record<string, any>;
  spec: SpecLike;
  usesAreaBreakdown: boolean;
  areas: AreaRow[];
  lineItems: LineItemRow[];
  discounts: DiscountRow[];
  transportSurcharge: number | null;
  termsAndConditionsText: string | null;
  packagingById: Map<string, PackagingInfo>;
  tenantOptions: Option[];
  supplierOptions: Option[];
  areaOptions: Option[];
  coatModeOptions: Option[];
  countryOptions: Option[];
  portOptions: Option[];
  incotermOptions: Option[];
}): QuotationPdfData {
  const {
    values,
    spec,
    usesAreaBreakdown,
    areas,
    lineItems,
    discounts,
    transportSurcharge,
    termsAndConditionsText,
    packagingById,
    tenantOptions,
    supplierOptions,
    areaOptions,
    coatModeOptions,
    countryOptions,
    portOptions,
    incotermOptions,
  } = params;

  const { price: specPrice, priceAfterDiscounts, netSales } = offerTotals(lineItems, discounts, transportSurcharge);

  return {
    specificationNumber: values.specification_number ?? spec?.specification_number ?? "",
    version: values.version ?? spec?.version ?? 1,
    specificationDate: values.specification_date ? values.specification_date.format("YYYY-MM-DD") : null,
    deliveryDateFrom: values.delivery_date_from ? values.delivery_date_from.format("YYYY-MM-DD") : null,
    deliveryDate: values.delivery_date ? values.delivery_date.format("YYYY-MM-DD") : null,
    // The customer may sit in another zone: the time names the zone it is in.
    validUntilText: values.valid_until_at ? `${formatInstant(values.valid_until_at.toISOString(), "DD.MM.YYYY HH:mm")} (${userTimeZone()})` : null,
    tenantName: optionLabel(tenantOptions, values.team_id),
    supplierName: optionLabel(supplierOptions, values.supplier_id),
    vesselName: spec?.vessels?.name ?? null,
    vesselImo: spec?.vessels?.imo ?? null,
    deliveryPort: optionLabel(portOptions, values.port_id),
    incoterm: incotermText(incotermOptions, values.incoterm_phrase_id, values.incoterm_place),
    placeOfApplication: values.place_of_application ?? null,
    currency: values.currency ?? null,
    customerName: values.customer_name ?? null,
    customerAddressLine: values.customer_address_line ?? null,
    customerCity: values.customer_city ?? null,
    customerPostalCode: values.customer_postal_code ?? null,
    customerCountry: optionLabel(countryOptions, values.customer_country_id),
    customerTelephone: values.customer_telephone ?? null,
    contactPerson: values.contact_person ?? null,
    remarksText: values.remarks_text ?? null,
    termsAndConditionsText,
    isDrydock: usesAreaBreakdown,
    areas: usesAreaBreakdown
      ? areas.map((a) => ({
          areaLabel: optionLabel(areaOptions, a.area_id),
          sizeM2: a.size_m2,
          products: a.products.map((p) => {
            const pkg = packagingById.get(p.product_packaging_id ?? "");
            return {
              productLabel: pkg?.label ?? "—",
              colourLabel: pkg?.colour ?? null,
              coatModeLabel: optionLabel(coatModeOptions, p.coat_mode_phrase_id),
              coatPct: p.coat_pct,
              dryFilmThicknessUm: p.dry_film_thickness_um ?? pkg?.dry_film_thickness_um ?? null,
              solidsVolumePct: pkg?.solids_volume_pct ?? null,
              theoreticalSpreadingRate: p.theoretical_spreading_rate,
              lossFactorPct: p.loss_factor_pct ?? a.loss_factor_pct,
              quantityL: p.quantity_l,
              quantityUnit: pkg?.unit ?? null,
              pricePerL: p.price_per_l,
              pricePerM2: p.price_per_m2,
              totalPrice: p.total_price,
            };
          }),
        }))
      : [],
    lineItems: offeredLines(lineItems).map((li) => ({
      productLabel: packagingById.get(li.product_packaging_id ?? "")?.label ?? "—",
      offeredQty: li.offered_qty,
      offeredPacks: li.offered_packs,
      packSize: packagingById.get(li.product_packaging_id ?? "")?.pack_size ?? null,
      unit: packagingById.get(li.product_packaging_id ?? "")?.unit ?? null,
      salesPrice: li.sales_price,
      discountPct: li.discount_pct,
      totalPrice: li.total_price,
    })),
    discounts: discounts.map((d) => ({ name: d.name, discount_type: d.discount_type, pct: d.pct, amount: d.amount })),
    specPrice,
    priceAfterDiscounts,
    transportSurcharge: transportSurcharge ?? null,
    netSales,
    showDraftWatermark: showDraftWatermark(spec),
  };
}
