// Ported 1:1 from the NPM tool (app/src/components/portSelect.tsx).
import { useCallback, useEffect, useState } from "react";
import { Select, App as AntdApp } from "antd";
import { supabaseClient } from "@rbp/core";
import { errorText } from "@rbp/core";

export type Port = { id: string; name: string; country_id: string | null; continent: string | null };

// Same normalization as ports.name_normalized, so the client can spot a
// duplicate before the unique index does.
const normalizePortName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export const usePorts = () => {
  const [ports, setPorts] = useState<Port[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabaseClient.from("ports").select("id, name, country_id, continent").order("name");
    setPorts(data ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ports, reload };
};

const ADD_PREFIX = "__add__:";

type Props = {
  // Injected by Form.Item
  value?: string | null;
  onChange?: (value: string | null) => void;
  ports: Port[];
  reloadPorts: () => Promise<void>;
  // Called right after a pick/add with the port's own country - lets the
  // caller convenience-fill a location_country_id field, same as picking an
  // antifouling product convenience-fills its supplier (see
  // antifoulingProductSelect.tsx).
  onCountryResolved?: (countryId: string | null) => void;
  // Same moment, with the whole port (country and continent) for callers that fill both.
  onPortResolved?: (port: Port) => void;
};

/**
 * Self-learning port picker - the "specific place" tier for Seastock specs,
 * which never get a shipyard assigned (see 20260924140000). Anyone signed in
 * can add a new port by typing a name that doesn't exist yet.
 */
export const PortSelect = ({ value, onChange, ports, reloadPorts, onCountryResolved, onPortResolved }: Props) => {
  const { message } = AntdApp.useApp();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const pick = (p: Port) => {
    onChange?.(p.id);
    onCountryResolved?.(p.country_id);
    onPortResolved?.(p);
  };

  const handleChange = async (val: string | undefined) => {
    if (!val) {
      onChange?.(null);
      return;
    }
    if (val.startsWith(ADD_PREFIX)) {
      const name = val.slice(ADD_PREFIX.length);
      const existing = ports.find((p) => normalizePortName(p.name) === normalizePortName(name));
      if (existing) {
        pick(existing);
        return;
      }
      setAdding(true);
      try {
        const { data, error } = await supabaseClient.from("ports").insert({ name }).select("id, name, country_id, continent").single();
        if (error) throw error;
        await reloadPorts();
        pick(data);
      } catch (e: any) {
        message.error(errorText(e, "Could not add port"));
      } finally {
        setAdding(false);
      }
      return;
    }
    const p = ports.find((p) => p.id === val);
    if (p) pick(p);
  };

  const trimmed = search.trim();
  const hasExactMatch = ports.some((p) => normalizePortName(p.name) === normalizePortName(trimmed));
  const options = [
    ...ports.map((p) => ({ value: p.id, label: p.name })),
    ...(trimmed && !hasExactMatch ? [{ value: ADD_PREFIX + trimmed, label: `Add "${trimmed}" as new port` }] : []),
  ];

  return (
    <Select
      value={value ?? undefined}
      options={options}
      showSearch
      allowClear
      optionFilterProp="label"
      onSearch={setSearch}
      onBlur={() => setSearch("")}
      onChange={handleChange}
      loading={adding}
      placeholder="Search ports"
    />
  );
};
