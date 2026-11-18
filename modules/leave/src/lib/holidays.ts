// Ported 1:1 from COMPASS (app/src/lib/holidays.ts).
// Federal states of Germany (ISO 3166-2) for the mapping site -> state of the holiday import (~/maintenance_tool/docs/leave.md).
export const REGIONS: { code: string; name: string }[] = [
  { code: "DE-BW", name: "Baden-Württemberg" },
  { code: "DE-BY", name: "Bayern" },
  { code: "DE-BE", name: "Berlin" },
  { code: "DE-BB", name: "Brandenburg" },
  { code: "DE-HB", name: "Bremen" },
  { code: "DE-HH", name: "Hamburg" },
  { code: "DE-HE", name: "Hessen" },
  { code: "DE-MV", name: "Mecklenburg-Vorpommern" },
  { code: "DE-NI", name: "Niedersachsen" },
  { code: "DE-NW", name: "Nordrhein-Westfalen" },
  { code: "DE-RP", name: "Rheinland-Pfalz" },
  { code: "DE-SL", name: "Saarland" },
  { code: "DE-SN", name: "Sachsen" },
  { code: "DE-ST", name: "Sachsen-Anhalt" },
  { code: "DE-SH", name: "Schleswig-Holstein" },
  { code: "DE-TH", name: "Thüringen" },
];

export type HolidayRow = { id: string; holiday_date: string; name: string; site: string | null; source: "manual" | "import" };
