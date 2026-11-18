// Escapes for user-typed text inside queries and patterns.

// The wildcard characters of a term for a PostgREST ilike / like filter.
export const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

// A term inside a PostgREST `or=(...)` filter: commas and parentheses would end the condition, so they become spaces;
// the wildcards are escaped. Empty when nothing is left to search for.
export const orFilterTerm = (term: string) => escapeLike(term.replace(/[,()]/g, " ")).trim();

// A literal string inside a regular expression.
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
