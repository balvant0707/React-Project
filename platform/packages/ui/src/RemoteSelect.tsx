import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "antd";

// `thumb`: an optional photo path, shown by a custom `optionRender` (item pickers; COMPASS remoteSelect.tsx).
export type RemoteOption = { value: string; label: string; thumb?: string | null };

type RemoteSelectProps = {
  // Server-side search (debounced, from `minChars` on). Return a small, limited page: large tables never load whole
  // (PostgREST would also truncate at max_rows = 1000).
  loadOptions: (term: string) => Promise<RemoteOption[]>;
  // Labels for values outside the current results (from a record or the URL); otherwise they show as raw ids.
  loadLabels?: (ids: string[]) => Promise<RemoteOption[]>;
  // Every batch of learned labels, so a parent can show them elsewhere (filter chips).
  onOptions?: (options: RemoteOption[]) => void;
  // Labels the parent already knows; used as a fallback for selected values.
  knownLabels?: Record<string, string>;
  // Minimum typed characters before anything is searched (default 2).
  minChars?: number;
  mode?: "multiple";
  value?: string | string[];
  onChange?: (value: any) => void;
  placeholder?: string;
  autoFocus?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  // Renders an option of the open dropdown (e.g. with a photo); the selected value still shows its label (COMPASS).
  optionRender?: (option: RemoteOption) => React.ReactNode;
};

const DEBOUNCE_MS = 250;

// A Select that searches on the server as you type; works as a Form.Item child or controlled input.
export function RemoteSelect({
  loadOptions,
  loadLabels,
  onOptions,
  knownLabels,
  minChars = 2,
  mode,
  value,
  onChange,
  placeholder,
  autoFocus,
  allowClear = true,
  disabled,
  style,
  optionRender,
}: RemoteSelectProps) {
  const [results, setResults] = useState<RemoteOption[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Only the latest request may update state; older, slower responses are dropped.
  const seq = useRef(0);
  // Refs so the debounced callback always calls the latest props.
  const loadRef = useRef(loadOptions);
  loadRef.current = loadOptions;
  const onOptionsRef = useRef(onOptions);
  onOptionsRef.current = onOptions;

  const remember = (opts: RemoteOption[]) => {
    if (!opts.length) return;
    setLabels((prev) => {
      const next = { ...prev };
      for (const o of opts) next[o.value] = o.label;
      return next;
    });
    onOptionsRef.current?.(opts);
  };

  const [term, setTerm] = useState("");
  const tooShort = term.trim().length < minChars;

  // Nothing loads before `minChars`: an alphabetical first page would only look like the whole list.
  const search = (raw: string) => {
    setTerm(raw);
    window.clearTimeout(timer.current);
    const trimmed = raw.trim();
    if (trimmed.length < minChars) {
      seq.current++; // invalidate any request still in flight
      setResults([]);
      setLoading(false);
      return;
    }
    timer.current = window.setTimeout(async () => {
      const mine = ++seq.current;
      setLoading(true);
      try {
        const opts = await loadRef.current(trimmed);
        if (mine !== seq.current) return;
        setResults(opts);
        remember(opts);
      } catch (e) {
        console.error("RemoteSelect search failed", e);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const selected = useMemo(() => (value == null || value === "" ? [] : Array.isArray(value) ? value : [value]), [value]);

  // Resolve labels for selected values we know nothing about.
  const unresolved = selected.filter((v) => !labels[v] && !knownLabels?.[v]);
  const unresolvedKey = unresolved.join(",");
  useEffect(() => {
    if (!loadLabels || !unresolved.length) return;
    let cancelled = false;
    loadLabels(unresolved).then((opts) => {
      if (!cancelled) remember(opts);
    });
    return () => {
      cancelled = true;
    };
  }, [unresolvedKey]);

  // Selected values stay in `options`, or antd shows their raw id.
  const options = useMemo(() => {
    const inResults = new Set(results.map((r) => r.value));
    const extra = selected
      .filter((v) => !inResults.has(v))
      .map((v) => ({ value: v, label: labels[v] ?? knownLabels?.[v] ?? v }));
    return [...extra, ...results];
  }, [results, selected, labels, knownLabels]);

  return (
    <Select
      mode={mode}
      showSearch
      filterOption={false}
      onSearch={search}
      onOpenChange={(open) => {
        // Each opening starts without the previous search's results.
        if (open) search("");
      }}
      notFoundContent={
        loading ? "Searching…" : tooShort ? `Type at least ${minChars} characters to search` : "No matches"
      }
      loading={loading}
      autoFocus={autoFocus}
      allowClear={allowClear}
      disabled={disabled}
      placeholder={placeholder}
      options={options}
      value={value === "" ? undefined : value}
      onChange={onChange}
      style={style ?? { width: "100%" }}
      optionRender={optionRender ? (o) => optionRender(o.data as RemoteOption) : undefined}
    />
  );
}
