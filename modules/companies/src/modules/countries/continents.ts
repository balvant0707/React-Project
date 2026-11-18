// Ported 1:1 from the NPM tool (app/src/modules/countries/continents.ts).
// Mirrors the countries.continent / hull_events.location_continent /
// specifications.location_continent check constraints (20260924140000) -
// keep in sync if that vocabulary ever changes.
export const CONTINENT_OPTIONS = [
  { value: "Europe", label: "Europe" },
  { value: "Asia", label: "Asia" },
  { value: "Africa", label: "Africa" },
  { value: "North America", label: "North America" },
  { value: "South America", label: "South America" },
  { value: "Oceania", label: "Oceania" },
];
