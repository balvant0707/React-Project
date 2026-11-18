// Ported 1:1 from COMPASS (app/src/hooks/useItems.ts).
import { useQuery } from "@tanstack/react-query";
import { fetchSuppliers, fetchTypeItemCategories } from "../lib/items";
import { usePhrases, usePhraseText } from "@rbp/core";

export const useSuppliers = () => useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers, staleTime: 60_000 });

// Text of a phrase of one list in the UI language; empty for none.
const usePhraseLookup = (category: string) => {
  const { data: phrases } = usePhrases(category);
  const text = usePhraseText();
  return (phraseId: string | null | undefined) => {
    const p = phraseId ? phrases?.find((u) => u.id === phraseId) : undefined;
    return p ? text(p) : "";
  };
};

// Unit of an item (phrase list item_unit).
export const useUnitText = () => usePhraseLookup("item_unit");

// Category of an item (phrase list item_category).
export const useCategoryText = () => usePhraseLookup("item_category");

// "2 piece" / "2" (quantities come as strings from numeric columns).
export const useQuantityText = () => {
  const unit = useUnitText();
  return (quantity: number | string, unitPhraseId: string | null | undefined) => {
    const n = Number(quantity);
    return `${Number.isInteger(n) ? n : n.toLocaleString()}${unit(unitPhraseId) ? ` ${unit(unitPhraseId)}` : ""}`;
  };
};

// The categories a task type offers; an empty list means every category.
export const useTypeItemCategories = (taskTypeId: string | null | undefined) =>
  useQuery({
    queryKey: ["task-type-item-categories", taskTypeId],
    enabled: !!taskTypeId,
    staleTime: 60_000,
    queryFn: () => fetchTypeItemCategories(taskTypeId!),
  });
