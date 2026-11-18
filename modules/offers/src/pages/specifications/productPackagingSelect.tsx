// Ported 1:1 from the NPM tool (app/src/pages/specifications/productPackagingSelect.tsx).
import { useMemo } from "react";
import { RemoteSelect } from "@rbp/ui";
import { loadPackagingsByIds, searchPackagings } from "@rbp/module-products/src/modules/products/packagings.ts";
import type { PackagingInfo } from "./areasEditor";

// Product picker for the specification's line items / coat lines. The catalog
// is searched on the server as you type instead of being loaded whole. Every
// result is handed to `onPackagingsLoaded` BEFORE it is offered, so by the time
// the user picks one, its packaging data (and DFT coefficients) are already in
// the editor's state and the existing change handlers can read them
// synchronously, exactly as they did with the preloaded catalog.
export const ProductPackagingSelect = ({
  value,
  packagings,
  onPackagingsLoaded,
  onChange,
  disabled,
  style,
  placeholder = "Product - type to search",
  supplierId,
}: {
  value: string | undefined;
  packagings: PackagingInfo[];
  onPackagingsLoaded: (list: PackagingInfo[]) => Promise<void>;
  onChange: (packagingId: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
  // Only this supplier's products are offered (the specification's supplier); without one the whole catalog.
  supplierId?: string | null;
}) => {
  const knownLabels = useMemo(() => Object.fromEntries(packagings.map((p) => [p.id, p.label])), [packagings]);
  const toOptions = (list: PackagingInfo[]) => list.map((p) => ({ value: p.id, label: p.label }));
  return (
    <RemoteSelect
      value={value}
      onChange={(v) => onChange(v as string)}
      knownLabels={knownLabels}
      loadOptions={async (term) => {
        const list = await searchPackagings(term, supplierId);
        await onPackagingsLoaded(list);
        return toOptions(list);
      }}
      loadLabels={async (ids) => {
        const list = await loadPackagingsByIds(ids);
        await onPackagingsLoaded(list);
        return toOptions(list);
      }}
      allowClear={false}
      disabled={disabled}
      placeholder={placeholder}
      style={style ?? { width: "100%" }}
    />
  );
};
