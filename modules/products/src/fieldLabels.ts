// Frontend display labels of this module's record types (from NPM's app/src/fieldLabels.ts, until 2026-11-13 one file in npm-base).
// defineFieldLabels also names the fields in the notes panel's history lines.
import { defineFieldLabels } from '@rbp/module-messaging/src/feed/eventText.ts';

// Convention: <resource>.<field>. A composite column label that mixes several fields stays a literal at the call site.
export const { FIELD_LABELS, fieldLabel } = defineFieldLabels({
  products: {
    code: "Code",
    production_code: "Production Code",
    colour: "Colour",
    is_mix: "Is Mix",
    name: "Name",
    name2: "Name 2",
    name3: "Name 3",
    category_phrase_id: "Category",
    group_phrase_id: "Group",
    default_thinner_product_id: "Default Thinner",
    default_thinner_pct: "Thinner %",
    solids_volume_pct: "Solids Volume %",
    dry_film_thickness_um: "Dry Film Thickness (µm)",
    gravity: "Gravity",
  },
  coefficient_curves: {
    name: "Name",
    kind: "Kind",
    company_id: "Company",
  },
  product_coefficients: {
    polishing_rate: "Polishing Rate (µm/month)",
    speed_curve_id: "Speed Curve",
    temperature_curve_id: "Sea Temperature Curve",
    max_service_life_months: "Max Service Life (months)",
    flat_bottom_derate_pct: "Flat Bottom Derate %",
    boottop_derate_pct: "Boottop Derate %",
    minimum_dft_um: "Minimum Total DFT (µm)",
    maximum_dft_per_coat_um: "Maximum DFT per Coat (µm)",
    anchoring_dft_um: "Anchoring DFT (µm)",
    anchoring_sea_days_threshold: "Anchoring Below Sea Days",
  },
});
