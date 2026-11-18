// Ported 1:1 from the NPM tool (app/src/components/packQuantityInputs.tsx).
import { useState } from "react";
import { InputNumber } from "antd";
import { packsOfQuantity, quantityOfPacks } from "../pages/specifications/lineItemCalc";

// A line is stored as a number of packs and the quantity in the packaging's unit (L / kg); either can be typed and
// the other follows. Packs are whole, so a typed quantity is rounded up to whole packs when the field is left.
// The arithmetic itself lives in pages/specifications/lineItemCalc.ts (re-exported for the pages that already import it here).
export { packsOfQuantity, quantityOfPacks };

export const PacksInput = ({
  packs,
  onPacksChange,
  disabled,
  min = 0,
}: {
  packs: number | null | undefined;
  onPacksChange: (packs: number | null) => void;
  disabled?: boolean;
  min?: number;
}) => <InputNumber style={{ width: "100%" }} min={min} precision={0} value={packs ?? null} disabled={disabled} onChange={(v) => onPacksChange(v)} />;

export const UnitQuantityInput = ({
  packs,
  packSize,
  unit,
  onPacksChange,
  disabled,
}: {
  packs: number | null | undefined;
  packSize: number | null | undefined;
  unit?: string | null;
  onPacksChange: (packs: number) => void;
  disabled?: boolean;
}) => {
  // undefined = not being edited (show the stored quantity); null = the user emptied the field.
  const [draft, setDraft] = useState<number | null | undefined>(undefined);
  const commit = () => {
    if (typeof draft === "number" && packSize) onPacksChange(packsOfQuantity(draft, packSize));
    setDraft(undefined);
  };
  return (
    <InputNumber
      style={{ width: "100%" }}
      min={0}
      suffix={unit ?? undefined}
      value={draft !== undefined ? draft : quantityOfPacks(packs, packSize)}
      disabled={disabled || !packSize}
      onChange={(v) => setDraft(v)}
      onBlur={commit}
      onPressEnter={commit}
    />
  );
};
