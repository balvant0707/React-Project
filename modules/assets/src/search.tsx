import { ToolOutlined } from "@ant-design/icons";
import { highlight, registerSearchType } from "@rbp/core";

// Assets in the platform search (public.assets_search): name, location and serial number. COMPASS globalSearch.tsx, case "assets".
registerSearchType({
  entityType: "assets",
  order: 130,
  icon: <ToolOutlined />,
  path: (r) => `/assets/${r.id}`,
  line: (r, term) => ({ primary: highlight(r.title, term), secondary: r.subtitle ? highlight(r.subtitle, term) : null }),
});
