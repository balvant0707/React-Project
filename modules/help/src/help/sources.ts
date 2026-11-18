// Every module ships src/help/<language>/NN-slug.md and puts their loaders (import.meta.glob("./help/*/*.md", { query: "?raw",
// import: "default" })) into the slot 'help.chapters'; loaded on first use, keyed "./<language>/NN-slug.md" (help/content.ts).
type Loaders = Record<string, () => Promise<unknown>>;

let loaders: Loaders = {};
let files: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;

export const setHelpLoaders = (next: Loaders) => {
  loaders = next;
  files = null;
  loading = null;
};

export const loadHelpFiles = () =>
  (loading ??= Promise.all(Object.entries(loaders).map(async ([path, load]) => [path, String(await load())] as const)).then(
    (entries) => (files = Object.fromEntries(entries)),
  ));

export const helpFiles = (): Record<string, string> => files ?? {};
