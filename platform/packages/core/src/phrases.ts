// From COMPASS (app/src/hooks/usePhrases.ts), until 2026-11-12 a copy in task-family. Changed: the German text is
// translations.de (COMPASS column text_de); no request for an empty category (a caller without a list). One hook for both apps; the phrases table and its admin page are core parts.
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "./supabase";

// Admin-managed phrase lists (table phrases, one category per list, German and English text).
export type Phrase = { id: string; code: string | null; text_en: string; text_de: string | null };

export const usePhrases = (category: string) =>
  useQuery({
    queryKey: ["phrases", category],
    enabled: !!category,
    staleTime: 60_000,
    queryFn: async () =>
      (((await supabaseClient.from("phrases").select("id, code, text_en, translations").eq("category", category).order("sequence")).data ?? []) as { id: string; code: string | null; text_en: string; translations: Record<string, string> | null }[]).map(
        ({ translations, ...p }) => ({ ...p, text_de: translations?.de ?? null }),
      ) as Phrase[],
  });

// The text in the UI language, English when the German text is missing.
export const usePhraseText = () => {
  const { i18n } = useTranslation();
  return (p: Phrase) => (i18n.language.startsWith("de") && p.text_de ? p.text_de : p.text_en);
};

// Loaders without a hook (from NPM modules/phrases/phrases.ts, until 2026-11-13 in npm-base): the options of one category in
// English, the id of one phrase by its code. Used by the forms and loaders of the NPM modules.
export type PhraseOption = { value: string; label: string };

export const optionLabel = (options: PhraseOption[], value: string | null | undefined) => options.find((o) => o.value === value)?.label ?? null;

export async function loadPhraseOptions(category: string): Promise<PhraseOption[]> {
  const { data } = await supabaseClient.from("phrases").select("id, text_en").eq("category", category).order("sequence");
  return (data ?? []).map((p) => ({ value: p.id, label: p.text_en }));
}

export async function loadPhraseId(category: string, code: string): Promise<string | null> {
  const { data } = await supabaseClient.from("phrases").select("id").eq("category", category).eq("code", code).maybeSingle();
  return data?.id ?? null;
}
