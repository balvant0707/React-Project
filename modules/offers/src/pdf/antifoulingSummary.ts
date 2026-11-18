// Ported 1:1 from the NPM tool (app/src/pdf/antifoulingSummary.ts).
// Builds the short antifouling summary shown on the Technical Specification
// PDF's cover page (see TechnicalSpecPdf.tsx), e.g. "ECOLOFLEX SPC 200 Full
// Blast" or, when the Flat Bottom area uses a different antifouling than
// the rest of the hull, two lines with the Flat Bottom one called out
// separately.

export type AntifoulingAreaInput = {
  // Whether this area is spec_areas.af_zone = 'flat_bottom' - was a
  // lowercase-substring match on the area's display label, replaced once
  // that became a typed column (see the spec_areas migration).
  isFlatBottom: boolean;
  surfacePreparationText: string | null;
  // Bare name of this area's antifouling product, or null if it has none.
  // An area with more than one antifouling product (unusual) just uses the
  // first - this is a cover-page summary, not the detailed area table.
  antifoulingProductName: string | null;
};

const TOUCH_UP_SIGNALS = ["spot blast", "hand scraping", "hand and power tool", "touch"];

// surface_preparation_text is free text - either composed from whichever
// phrases were checked in SurfacePrepPicker (components/surfacePrepPicker.tsx), or, for a
// spec transcribed from a real source document (see the LENA reference
// spec), typed independently with its own wording. There's no structured
// "is this a full blast or a touch-up" field to key off instead, so this
// stays a best-effort keyword match rather than a guaranteed
// classification: check the touch-up signals first (specific phrasings),
// then treat any remaining mention of "blast" as Full Blast - broad
// enough to catch both the seeded phrases' wording ("Abrasive blasting to
// min. Sa 2...") and LENA's own ("Blast Cleaning Sa 2...") without hand-
// listing every phrasing a real document might use.
function classifySurfacePrepShortForm(surfacePreparationText: string | null): string | null {
  if (!surfacePreparationText) return null;
  const text = surfacePreparationText.toLowerCase();
  if (TOUCH_UP_SIGNALS.some((s) => text.includes(s))) return "Touch-up";
  if (text.includes("blast")) return "Full Blast";
  return null;
}

type Combo = { productName: string; prepForm: string | null };

const comboLine = (c: Combo, suffix?: string) => [c.productName, c.prepForm, suffix].filter(Boolean).join(" ");

function mostCommonCombo(items: Combo[]): Combo | null {
  if (items.length === 0) return null;
  const counts = new Map<string, { combo: Combo; count: number }>();
  for (const item of items) {
    const key = `${item.productName}|${item.prepForm ?? ""}`;
    counts.set(key, { combo: item, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0].combo;
}

export function buildAntifoulingSummary(areas: AntifoulingAreaInput[]): string[] {
  const combos = areas
    .filter((a) => a.antifoulingProductName)
    .map((a) => ({
      isFlatBottom: a.isFlatBottom,
      productName: a.antifoulingProductName as string,
      prepForm: classifySurfacePrepShortForm(a.surfacePreparationText),
    }));

  const flatBottom = combos.find((c) => c.isFlatBottom) ?? null;
  const general = mostCommonCombo(combos.filter((c) => !c.isFlatBottom));

  const lines: string[] = [];
  if (general) lines.push(comboLine(general));

  if (flatBottom && (!general || flatBottom.productName !== general.productName || flatBottom.prepForm !== general.prepForm)) {
    lines.push(comboLine(flatBottom, general ? "(Flat Bottom)" : undefined));
  }

  return lines;
}
