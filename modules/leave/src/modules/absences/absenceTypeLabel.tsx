// Ported 1:1 from COMPASS (app/src/modules/absences/absenceTypeLabel.tsx).
import { DEFAULT_ABSENCE_TYPE_ICON, IconTile, iconFor } from "@rbp/ui";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { useAbsenceTypes, type AbsenceType } from "./useAbsenceTypes";

// An absence type with its icon tile, in a select option or a list cell.
export const AbsenceTypeOption = ({ type }: { type: AbsenceType }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <IconTile icon={iconFor(type.icon, DEFAULT_ABSENCE_TYPE_ICON)} color={type.color} size={20} />
    {localName(type)}
  </span>
);

// The type of an absence by its id ("—" while loading or for an unknown id).
export const AbsenceTypeLabel = ({ id }: { id: string }) => {
  const { data: types } = useAbsenceTypes();
  const type = types?.find((x) => x.id === id);
  return type ? <AbsenceTypeOption type={type} /> : <>—</>;
};
