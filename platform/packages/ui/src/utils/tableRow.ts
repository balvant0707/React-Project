// Copied 1:1 from COMPASS (app/src/utils/tableRow.ts); the NPM tool had the same function in utils/tableFilter.tsx.
// One copy for both apps (docs/shared-parts.md, identical copies).
// Makes a table row open its detail page on click.
export function clickableRow<T extends { id: string }>(navigate: (path: string) => void, pathPrefix: string) {
  return (record: T) => ({
    style: { cursor: "pointer" as const },
    onClick: () => navigate(`${pathPrefix}/${record.id}`),
  });
}
