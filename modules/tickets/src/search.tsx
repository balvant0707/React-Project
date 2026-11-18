import { ExclamationCircleOutlined } from "@ant-design/icons";
import { highlight, registerSearchType } from "@rbp/core";

// Tickets in the platform search (public.tickets_search): number, title, subtitle. COMPASS globalSearch.tsx, case "tickets".
registerSearchType({
  entityType: "tickets",
  order: 120,
  icon: <ExclamationCircleOutlined />,
  path: (r) => `/tickets/${r.id}`,
  line: (r, term) => ({ primary: <>#{r.number} {highlight(r.title, term)}</>, secondary: r.subtitle ? highlight(r.subtitle, term) : null }),
});
