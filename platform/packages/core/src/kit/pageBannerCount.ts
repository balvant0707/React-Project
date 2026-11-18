// From the NPM tool (app/src/utils/pageBannerCount.ts), until 2026-11-13 ported into npm-base; now one copy in the platform.
import type { TablePaginationConfig } from "antd/es/table";

// "Number of ships: 1,234" - the list page's own banner subtitle, off
// useTable's tableProps.pagination.total. That's already the filtered
// total (PostgREST's exact count, computed via Prefer: count=exact - the
// same number antd's own pagination footer shows), not just the loaded
// page's row count, and reading it here doesn't add a query: every list
// page already fetches it to drive its pagination control.
export const listCountSubtitle = (noun: string, pagination: TablePaginationConfig | false | undefined) => {
  const total = typeof pagination === "object" ? pagination.total : undefined;
  return total != null ? `Number of ${noun}: ${total.toLocaleString()}` : undefined;
};
