// Text for searching in the browser: lower case, without accents, "ß" as "ss", so "muller" finds "Müller" and
// "strasse" finds "Straße". Every search in the browser uses it (type tiles, "To whom?", the manual).
export const foldText = (text: string | null | undefined) =>
  (text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

// Does `text` contain every word of `term`?
export const matchesAllWords = (text: string | null | undefined, term: string) => {
  const haystack = foldText(text);
  return foldText(term).split(/\s+/).filter(Boolean).every((w) => haystack.includes(w));
};
