// Ported 1:1 from the NPM tool (app/src/widgets/filterLink.ts).
export type FilterSpec = { field: string; operator: string; value: string | number | boolean | (string | number)[] };

// Builds a URL to an existing list page using Refine's own syncWithLocation
// query-string shape (filters[N][field]/[operator]/[value], array values as
// filters[N][value][M]) - so a widget's "View details" link opens that list
// already filtered to exactly the rows the widget's own numbers came from,
// instead of a bespoke read-only detail view per widget.
export function buildFilterLink(path: string, filters: FilterSpec[]): string {
  const params = new URLSearchParams();
  filters.forEach((f, i) => {
    params.append(`filters[${i}][field]`, f.field);
    params.append(`filters[${i}][operator]`, f.operator);
    if (Array.isArray(f.value)) {
      f.value.forEach((v, j) => params.append(`filters[${i}][value][${j}]`, String(v)));
    } else {
      params.append(`filters[${i}][value]`, String(f.value));
    }
  });
  return `${path}?${params.toString()}`;
}
