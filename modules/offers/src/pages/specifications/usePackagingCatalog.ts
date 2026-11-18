// Ported 1:1 from the NPM tool (app/src/pages/specifications/usePackagingCatalog.ts).
// The part of the product catalog the specification editor knows: the packagings it shows (its own, plus what the
// product pickers found), the maximum DFT per coat of their products, and the default thinners of the area paints. The
// catalog is never loaded whole; the pickers search the server (modules/products/packagings.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import type { PackagingInfo } from "./areasEditor";
import { DEFAULT_THINNER_PCT } from "./lineItemCalc";
import type { DefaultThinner } from "./paintListRecompute";
import { loadMaxDftForProducts, loadDefaultThinnerLinks, loadPackagingsForProducts } from "@rbp/module-products/src/modules/products/packagings.ts";

export function usePackagingCatalog() {
  const [packagings, setPackagings] = useState<PackagingInfo[]>([]);
  const [maxDftByProductId, setMaxDftByProductId] = useState<Map<string, number>>(new Map());
  // Maximum DFT loads per product (the promise, so a second caller waits for the same load).
  const coefficientLoads = useRef(new Map<string, Promise<void>>());
  const packagingById = useMemo(() => new Map(packagings.map((p) => [p.id, p])), [packagings]);

  // Adds packagings and loads their products' maximum DFT. Resolves once both are in state, so a packaging is only
  // offered for picking when everything the change handlers read is there.
  const registerPackagings = async (list: PackagingInfo[]) => {
    if (!list.length) return;
    setPackagings((prev) => {
      const known = new Set(prev.map((p) => p.id));
      const added = list.filter((p) => !known.has(p.id));
      return added.length ? [...prev, ...added] : prev;
    });
    const productIds = Array.from(new Set(list.map((p) => p.product_id)));
    const missing = productIds.filter((pid) => !coefficientLoads.current.has(pid));
    if (missing.length) {
      const load = loadMaxDftForProducts(missing).then((max) => setMaxDftByProductId((prev) => new Map([...prev, ...max])));
      missing.forEach((pid) => coefficientLoads.current.set(pid, load));
    }
    await Promise.all(productIds.map((pid) => coefficientLoads.current.get(pid)));
  };

  // Starts over with the packagings of a freshly loaded specification.
  const resetPackagings = async (list: PackagingInfo[]) => {
    setPackagings(list);
    setMaxDftByProductId(new Map());
    coefficientLoads.current = new Map();
    await registerPackagings(list);
  };

  return { packagings, packagingById, maxDftByProductId, registerPackagings, resetPackagings };
}

// Default thinner of every area paint product, and the packagings of those thinners (registered in the catalog);
// loaded whenever the areas use a new product. Only DD/NB specifications have thinner lines.
export function useDefaultThinners(
  areaPackagingIds: Set<string>,
  packagingById: Map<string, PackagingInfo>,
  enabled: boolean,
  registerPackagings: (list: PackagingInfo[]) => Promise<void>,
) {
  const [defaultThinnerByProductId, setDefaultThinnerByProductId] = useState<Map<string, DefaultThinner>>(new Map());
  const [thinnerPackagingsByProductId, setThinnerPackagingsByProductId] = useState<Map<string, PackagingInfo[]>>(new Map());
  const productIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const pid of areaPackagingIds) {
      const productId = packagingById.get(pid)?.product_id;
      if (productId) ids.add(productId);
    }
    return Array.from(ids).sort().join(",");
  }, [areaPackagingIds, packagingById]);

  useEffect(() => {
    if (!enabled || !productIdsKey) return;
    const productIds = productIdsKey.split(",").filter((pid) => !defaultThinnerByProductId.has(pid));
    if (!productIds.length) return;
    let cancelled = false;
    (async () => {
      const links = await loadDefaultThinnerLinks(productIds);
      const thinnerIds = Array.from(new Set(links.map((l) => l.default_thinner_product_id).filter((v): v is string => !!v)));
      const thinnerPackagings = thinnerIds.length ? await loadPackagingsForProducts(thinnerIds) : [];
      if (cancelled) return;
      await registerPackagings(thinnerPackagings);
      setThinnerPackagingsByProductId((prev) => {
        const next = new Map(prev);
        for (const pkg of thinnerPackagings) next.set(pkg.product_id, [...(next.get(pkg.product_id) ?? []).filter((p) => p.id !== pkg.id), pkg]);
        return next;
      });
      setDefaultThinnerByProductId((prev) => {
        const next = new Map(prev);
        for (const pid of productIds) {
          const link = links.find((l) => l.id === pid);
          next.set(pid, { thinnerProductId: link?.default_thinner_product_id ?? null, pct: link?.default_thinner_pct ?? DEFAULT_THINNER_PCT });
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdsKey, enabled]);

  return { defaultThinnerByProductId, thinnerPackagingsByProductId };
}
