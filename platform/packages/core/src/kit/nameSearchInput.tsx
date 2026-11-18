import { useEffect, useRef, useState } from "react";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { CrudFilters } from "@refinedev/core";

// Search box for a list header: one debounced "or" filter (`<field> contains <text>` per field) under its own key
// (SEARCH_KEY, apart from the filter bar's chips). Big tables need a trigram index on every searched column.
const SEARCH_KEY = "search";

export function NameSearchInput({
  filters,
  setFilters,
  fields = ["name"],
  placeholder,
}: {
  filters: CrudFilters;
  setFilters: (filters: CrudFilters) => void;
  fields?: string[];
  placeholder: string;
}) {
  const or = filters.find((f) => f.operator === "or" && "key" in f && f.key === SEARCH_KEY);
  const current = String((or?.value as { value: unknown }[] | undefined)?.[0]?.value ?? "");
  const [text, setText] = useState(current);
  // The last value written: only a different value from outside replaces the typed text.
  const lastWritten = useRef(current);
  // setFilters is not stable; a new identity must not restart the debounce.
  const setFiltersRef = useRef(setFilters);
  setFiltersRef.current = setFilters;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  useEffect(() => {
    if (current === lastWritten.current) return;
    lastWritten.current = current;
    setText(current);
  }, [current]);

  useEffect(() => {
    const term = text.trim();
    if (term === lastWritten.current) return;
    const timer = setTimeout(() => {
      lastWritten.current = term;
      // An empty "or" value array is how a keyed "or" filter is cleared.
      setFiltersRef.current([
        {
          operator: "or",
          key: SEARCH_KEY,
          value: term ? fieldsRef.current.map((field) => ({ field, operator: "contains", value: term })) : [],
        },
      ] as CrudFilters);
    }, 400);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <Input
      allowClear
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      style={{ width: 200 }}
    />
  );
}
