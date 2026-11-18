// Ported 1:1 from the NPM tool (app/src/modules/phrases/incoterm.ts).
import { useEffect } from "react";
import type { FormInstance } from "antd";
import type { PhraseOption as Option } from "@rbp/core";

// New offers and orders start on CIF (the usual Seastock terms); an existing one keeps whatever it has, even empty.
export const DEFAULT_INCOTERM_CODE = "CIF";

// Fills the incoterm of a brand-new form once the options are loaded, unless something (a copied offer) set it already.
export function useDefaultIncoterm(form: FormInstance, options: Option[], enabled: boolean) {
  useEffect(() => {
    if (!enabled || form.getFieldValue("incoterm_phrase_id")) return;
    const cif = options.find((o) => o.label.split(" - ")[0] === DEFAULT_INCOTERM_CODE);
    if (cif) form.setFieldValue("incoterm_phrase_id", cif.value);
  }, [enabled, options, form]);
}

// "FOB - Free On Board" + "Rotterdam" -> "FOB Rotterdam" (the incoterm code with its named place), for PDFs.
export function incotermText(options: Option[], phraseId: string | null | undefined, place: string | null | undefined): string | null {
  const label = phraseId ? options.find((o) => o.value === phraseId)?.label : null;
  const text = [label?.split(" - ")[0], place?.trim()].filter(Boolean).join(" ");
  return text || null;
}
