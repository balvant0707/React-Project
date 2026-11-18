// The record types a task can belong to in the apps that use this module, with the page that shows the record.
// Read by the task page (link to the record) and the list (record column). A type without an entry is shown by its
// label only. When more apps use tasks this becomes a registry hook of the module manifest.
export const ANCHOR_PATHS: Record<string, string> = {
  specifications: "/specifications",
  orders: "/orders",
  companies: "/companies",
  hull_events: "/hull-events",
  vessels: "/vessels",
};

export const anchorPath = (type: string | null, id: string | null) => (type && id && ANCHOR_PATHS[type] ? `${ANCHOR_PATHS[type]}/${id}` : null);
