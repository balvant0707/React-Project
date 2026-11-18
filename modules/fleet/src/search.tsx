import { CompassOutlined, RocketOutlined } from "@ant-design/icons";
import { highlight, registerSearchType } from "@rbp/core";
import { formatDate } from "@rbp/ui";

// Vessels and hull events in the platform search (public.vessels_search, public.hull_events_search): "IMO · name", for a
// hull event the type and date below (NPM's header search).
registerSearchType({
  entityType: "vessels",
  order: 20,
  groupLabel: "Vessels",
  icon: <RocketOutlined />,
  path: (r) => `/vessels/${r.id}`,
  line: (r, term) => ({ primary: <>{highlight(r.subtitle, term)} &middot; {highlight(r.title, term)}</>, secondary: null }),
});

registerSearchType({
  entityType: "hull_events",
  order: 30,
  groupLabel: "Hull Events",
  icon: <CompassOutlined />,
  path: (r) => `/hull-events/${r.id}`,
  line: (r, term) => ({
    primary: <>{highlight(r.subtitle, term)} &middot; {highlight(r.title, term)}</>,
    secondary: <>{highlight(r.status, term)} &middot; {formatDate(r.event_at?.slice(0, 10))}</>,
  }),
});
