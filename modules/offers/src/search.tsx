import { FileTextOutlined } from "@ant-design/icons";
import { highlight, registerSearchType } from "@rbp/core";
import { formatDate } from "@rbp/ui";

// Specifications in the platform search (public.specifications_search): vessel above; number, version, enquiry reference and
// delivery date below (NPM's header search). title = number, number = version, snippet = enquiry number, event_at = delivery.
registerSearchType({
  entityType: "specifications",
  order: 40,
  groupLabel: "Specifications",
  icon: <FileTextOutlined />,
  path: (r) => `/specifications/${r.id}`,
  line: (r, term) => ({
    primary: highlight(r.subtitle, term),
    secondary: (
      <>
        {highlight(r.title, term)} v{r.number} &middot; Ref: {r.snippet ? highlight(r.snippet, term) : "—"} &middot; Delivery: {formatDate(r.event_at?.slice(0, 10))}
      </>
    ),
  }),
});
