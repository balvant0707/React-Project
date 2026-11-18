// NPM's fields of a person on Admin > Users (core slot "admin.users.fields"), as NPM's user dialog had them: the short code
// (users.short_code, e.g. on documents) and the default Owner Associate (users.default_team_id, a team of the kind
// owner_associate; NPM's "Default tenant").
import { useEffect, useState } from 'react';
import { Input, Select } from 'antd';
import { supabaseClient } from '@rbp/core';

type FieldProps = { value: unknown; onChange: (v: unknown) => void; disabled?: boolean };

export const ShortCodeField = ({ value, onChange, disabled }: FieldProps) => (
  <Input value={(value as string | null) ?? ''} disabled={disabled} maxLength={10} style={{ width: 160 }} onChange={(e) => onChange(e.target.value.trim().toUpperCase())} />
);

export const OwnerAssociateField = ({ value, onChange, disabled }: FieldProps) => {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    void supabaseClient.from('teams').select('id, name, team_uses!inner(use)').eq('team_uses.use', 'owner_associate').order('name')
      .then(({ data }) => setOptions(((data ?? []) as { id: string; name: string }[]).map((t) => ({ value: t.id, label: t.name }))));
  }, []);
  return <Select allowClear placeholder="Not set" disabled={disabled} value={(value as string | null) ?? undefined} onChange={(v) => onChange(v ?? null)} options={options} style={{ width: 240 }} />;
};
