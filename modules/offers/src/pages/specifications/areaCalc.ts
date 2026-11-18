// Ported 1:1 from the NPM tool (app/src/pages/specifications/areaCalc.ts).
// Coverage/quantity formulas for the Area/Coat breakdown.
//
// Confirmed against two independent real legacy sources: a NPMSS admin
// screenshot (3 coat lines, spec EURBDO 9557-2) and a full 4-page official
// customer-facing PDF ("LENA" / EURORI 9153-1, 7 areas, ~17 coat lines) - the
// second document superseded and corrected part of what the first one alone
// suggested, see below.
//
// theoretical_spreading_rate = solids_volume_pct x 10 / dry_film_thickness_um,
// coverage_practical = TSR x (1 - loss_factor_pct/100): both confirmed exactly
// across every row of both documents (e.g. 80% x 10 / 175um = 4.5714 ~ "Cover.
// theor. 4,57"; 4.5714 x (1-40%) = 2.7429 ~ "Cover. pract. 2,74").
//
// size_m2 is NOT an independent per-line value (an earlier pass, based on the
// admin screenshot alone, wrongly modeled it as a free per-line override -
// corrected here). The LENA document proves it is DERIVED: every one of its
// ~17 rows satisfies row_area = area.size_m2 x (coat_pct/100) exactly (e.g.
// area "Topsides" = 1530 m2 total; two T/U 40% rows both show "Area 612" =
// 1530 x 0.40; the F/C 100% row shows "Area 1530" = the full area). A F/C
// (full coat) line covers the whole area; a T/U (touch-up) line covers only
// the given percentage of it.
//
// quantity_l = ROUND(effective_size_m2 / coverage_practical) - confirmed
// exactly across both documents once effective_size_m2 (not the raw area
// total) is used, e.g. LENA row: 612 / 4.80 = 127.5 ~ rounds to 128, matching
// "Quantity practical 128" exactly. NPMSS rounds this to a whole number of
// litres, which is the fix for the "krumme Mengen" (odd quantities) complaint.
//
// total_price = price_per_l x quantity_l, confirmed EXACTLY across every row
// of the LENA document (e.g. 5.95 x 620 = 3689.00, matching "Total Price"
// to the cent) - this RETRACTS an earlier reading of the (harder to read,
// cropped) admin screenshot that suggested a mystery ~0.85 factor; the LENA
// document is the cleaner, more complete, and now-trusted source.
//
// price_per_m2 ("Price per Area" in the LENA document) - SOLVED. It is
// price_per_l/coverage_practical, scaled by the specification's overall
// discount ratio (priceAfterDiscounts/specPrice) - proven across both real
// documents at once (13 rows, zero exceptions, matching to the cent): the
// LENA customer PDF (ratio 0.825562, its own Net Sales/Total) and the
// EURBDO 9557-2 admin screen (ratio 0.85 flat; row 3 only matched once its
// per-line DFT OVERRIDE of 110um was used instead of the product's catalog
// default of 100um). This function itself stays GROSS for every field
// (matching the LENA customer PDF's own Price/L and Total, which never
// carry the discount) - the net/gross choice is a pure DISPLAY toggle, see
// AreasEditor's "Gross"/"Net" switch, not baked in here. See domain-model.md.

export type AreaProductInputs = {
  solids_volume_pct: number | null; // from the product, overridable per line
  dry_film_thickness_um: number | null; // per-line value, defaults from the product
  loss_factor_pct: number | null; // per-line, falls back to the area's own
  area_size_m2: number | null; // the area's own (single, shared) size
  coat_pct: number | null; // % of the area this line covers - null treated as 100% (full coat)
  sales_price: number | null;
};

export type AreaProductComputed = {
  size_m2: number | null; // derived: area_size_m2 x coat_pct/100
  theoretical_spreading_rate: number | null;
  coverage_practical: number | null;
  quantity_l: number | null;
  price_per_l: number | null;
  price_per_m2: number | null;
  total_price: number | null;
};

export function computeAreaProduct(input: AreaProductInputs): AreaProductComputed {
  const { solids_volume_pct, dry_film_thickness_um, loss_factor_pct, area_size_m2, coat_pct, sales_price } = input;

  const size_m2 = area_size_m2 != null ? area_size_m2 * ((coat_pct ?? 100) / 100) : null;

  const theoretical_spreading_rate =
    solids_volume_pct != null && dry_film_thickness_um
      ? (solids_volume_pct * 10) / dry_film_thickness_um
      : null;

  const coverage_practical =
    theoretical_spreading_rate == null ? null : theoretical_spreading_rate * (1 - (loss_factor_pct ?? 0) / 100);

  const quantity_l = coverage_practical && size_m2 != null ? Math.round(size_m2 / coverage_practical) : null;

  const price_per_l = sales_price ?? null;
  const price_per_m2 = price_per_l != null && coverage_practical ? price_per_l / coverage_practical : null;
  const total_price = price_per_l != null && quantity_l != null ? price_per_l * quantity_l : null;

  return { size_m2, theoretical_spreading_rate, coverage_practical, quantity_l, price_per_l, price_per_m2, total_price };
}

// Wet film thickness - a purely derived, display-only value (confirmed exactly
// against both real legacy documents, e.g. 175 / (75/100) = 233), not used in
// any other formula here and so not a stored column - see "Area/Coat formula"
// in domain-model.md.
export function computeWetFilmThicknessUm(dryFilmThicknessUm: number | null, solidsVolumePct: number | null): number | null {
  if (dryFilmThicknessUm == null || !solidsVolumePct) return null;
  return dryFilmThicknessUm / (solidsVolumePct / 100);
}
