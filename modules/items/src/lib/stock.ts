// Ported 1:1 from COMPASS (app/src/lib/stock.ts).
// Stock keeping for selected larger spare parts (~/maintenance_tool/docs/items.md). Locations form a tree (store -> shelf -> bin); the
// quantity per item and location lives in stock_balances, the ledger stock_movements is only read in pages.

export type StockLocation = {
  id: string;
  parent_id: string | null;
  name: string;
  code: string;
  team_id: string | null;
  note: string | null;
  is_active: boolean;
};

export type StockBalance = {
  item_id: string;
  stock_location_id: string;
  quantity: number | string;
};

export type StockMovement = {
  id: string;
  seq: number;
  item_id: string;
  stock_location_id: string;
  quantity: number | string;
  kind: StockKind;
  task_id: string | null;
  task_item_id: string | null;
  transfer_id: string | null;
  note: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

// Platform: exported (the platform lint refuses a value only used as a type).
export const STOCK_KINDS = ["opening", "receipt", "issue", "return", "correction", "count", "transfer"] as const;
type StockKind = (typeof STOCK_KINDS)[number];

// Row of the view item_stock_overview (null quantities without stock.view).
export type ItemStock = {
  item_id: string;
  item_number: string;
  name: string;
  unit_phrase_id: string | null;
  is_active: boolean;
  minimum_stock: number | string | null;
  reorder_quantity: number | string | null;
  default_stock_location_id: string | null;
  quantity: number | string | null;
  location_count: number | null;
  below_minimum: boolean | null;
};

export type StockPick = { location_id: string; quantity: number };

export type LocationNode = StockLocation & { path: string; depth: number };

// The locations in tree order (children below their parent, siblings by name), each with its path "Store › Shelf".
export function buildLocationTree(locations: StockLocation[]): LocationNode[] {
  const children = new Map<string | null, StockLocation[]>();
  const ids = new Set(locations.map((l) => l.id));
  for (const l of locations) {
    // A location whose parent is not visible is shown at the top.
    const key = l.parent_id && ids.has(l.parent_id) ? l.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), l]);
  }
  const out: LocationNode[] = [];
  const walk = (parent: string | null, path: string[], depth: number) => {
    for (const l of [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      const here = [...path, l.name];
      out.push({ ...l, path: here.join(" › "), depth });
      walk(l.id, here, depth + 1);
    }
  };
  walk(null, [], 0);
  return out;
}

// The location and everything below it.
export function subtreeIds(locations: StockLocation[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const l of locations) if (l.parent_id === out[i]) out.push(l.id);
  }
  return out;
}

// Where an issue is taken from when nobody picks (the same rule as stock_sync_line): the locations that hold stock, the
// default location first and then the biggest stock, a remainder from the default location (which may go negative).
export function autoPicks(balances: StockBalance[], defaultLocationId: string | null, quantity: number): StockPick[] {
  const picks: StockPick[] = [];
  let rest = quantity;
  const holding = balances
    .map((b) => ({ id: b.stock_location_id, qty: Number(b.quantity) }))
    .filter((b) => b.qty > 0)
    .sort((a, b) => Number(b.id === defaultLocationId) - Number(a.id === defaultLocationId) || b.qty - a.qty);
  for (const b of holding) {
    if (rest <= 0) break;
    const take = Math.min(b.qty, rest);
    picks.push({ location_id: b.id, quantity: take });
    rest = Math.round((rest - take) * 100) / 100;
  }
  if (rest > 0 && defaultLocationId) {
    const same = picks.find((p) => p.location_id === defaultLocationId);
    if (same) same.quantity = Math.round((same.quantity + rest) * 100) / 100;
    else picks.push({ location_id: defaultLocationId, quantity: rest });
  }
  return picks;
}

// May the user count, correct and move stock at this location? (Mirrors stock_user_may_book.)
export const mayBook = (has: (literal: string) => boolean, teamIds: string[], location: Pick2<StockLocation, "team_id"> | undefined) =>
  has("stock.edit.all") || (has("stock.edit.team") && !!location?.team_id && teamIds.includes(location.team_id));

type Pick2<T, K extends keyof T> = { [P in K]: T[P] };

// The URL a location label points at.
export const locationUrl = (id: string) => `${window.location.origin}/items/locations/${id}`;

// Error texts of the stock functions.
export const STOCK_ERRORS: Record<string, string> = {
  "You may not book stock at this location": "stock.errors.notAllowed",
  "Not enough stock at the source location": "stock.errors.notEnough",
  "Source and target are the same location": "stock.errors.sameLocation",
  "The picked quantities must add up to the quantity": "stock.errors.picks",
  "This stock location is not active": "stock.errors.inactive",
  "This item is not kept in stock": "stock.errors.notManaged",
  "Stock location not found": "stock.errors.notFound",
  "The quantity must be positive (a correction may be negative)": "stock.errors.quantity",
  "The quantity must be positive": "stock.errors.quantity",
  "Stock keeping cannot be switched off while the item has stock": "stock.errors.hasStock",
  "A stock location cannot sit below itself and may be at most 6 levels deep": "stock.errors.tree",
};
