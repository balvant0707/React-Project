import { BuildOutlined } from "@ant-design/icons";
import { highlight, registerSearchType } from "@rbp/core";

// Items in the platform search (public.items_search): name and subtitle. COMPASS globalSearch.tsx, case "items".
registerSearchType({
  entityType: "items",
  order: 140,
  icon: <BuildOutlined />,
  path: (r) => `/items/${r.id}`,
  line: (r, term) => ({ primary: highlight(r.title, term), secondary: r.subtitle ? highlight(r.subtitle, term) : null }),
});
