import { InboxOutlined } from "@ant-design/icons";
import { highlight, registerSearchType } from "@rbp/core";

// Products in the platform search (public.products_search): code, then name (NPM's header search).
registerSearchType({
  entityType: "products",
  order: 50,
  groupLabel: "Products",
  icon: <InboxOutlined />,
  path: (r) => `/products/${r.id}`,
  line: (r, term) => ({ primary: highlight(r.title, term), secondary: highlight(r.subtitle, term) }),
});
