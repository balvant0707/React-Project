// Ported 1:1 from the NPM tool (app/src/pages/admin/shipTypeGroups/list.tsx).
import { useEffect, useMemo, useState } from "react";
import { Input, Select, Switch, Table, Typography, App as AntdApp } from "antd";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { errorText } from "@rbp/core";

type MappingRow = {
  ship_type: string;
  vessel_count: number;
  group_phrase_id: string | null;
  group_name: string | null;
};

type GroupOption = { value: string; label: string };

// Maps every SeaWeb ship type (~280, so the whole list fits one request and is
// filtered here) to a coarser group, one of the phrases of the category
// 'ship_type_group' (edit those on the Phrases page). The lists show and filter
// the group, or the SeaWeb ship type itself while it is unmapped
// (vessels.ship_type_group, migration 20261015100000). A change goes through
// set_ship_type_group(), which also updates that column on every vessel of the
// ship type.
export const ShipTypeGroupList = () => {
  const { message } = AntdApp.useApp();
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unmappedOnly, setUnmappedOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const [overview, phrases] = await Promise.all([
        supabaseClient.from("ship_type_mappings_overview").select("*").order("vessel_count", { ascending: false }).limit(1000),
        supabaseClient.from("phrases").select("id, text_en").eq("category", "ship_type_group").order("sequence"),
      ]);
      if (overview.error) message.error(errorText(overview.error));
      setRows((overview.data ?? []) as MappingRow[]);
      setGroups((phrases.data ?? []).map((p) => ({ value: p.id as string, label: p.text_en as string })));
      setLoading(false);
    })();
  }, [message]);

  const change = async (row: MappingRow, groupPhraseId: string | undefined) => {
    setSaving(row.ship_type);
    const { data, error } = await supabaseClient.rpc("set_ship_type_group", {
      p_ship_type: row.ship_type,
      p_group_phrase_id: groupPhraseId ?? null,
    });
    setSaving(null);
    if (error) {
      message.error(errorText(error));
      return;
    }
    const groupName = groups.find((g) => g.value === groupPhraseId)?.label ?? null;
    setRows((current) =>
      current.map((r) => (r.ship_type === row.ship_type ? { ...r, group_phrase_id: groupPhraseId ?? null, group_name: groupName } : r)),
    );
    message.success(`${row.ship_type}: ${groupName ?? "no group"} (${Number(data ?? 0).toLocaleString()} vessels updated)`);
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => (!unmappedOnly || r.group_phrase_id == null) && (term === "" || r.ship_type.toLowerCase().includes(term)));
  }, [rows, search, unmappedOnly]);
  const unmappedCount = rows.filter((r) => r.group_phrase_id == null).length;

  return (
    <List title="Ship type groups">
      <Typography.Paragraph type="secondary">
        Maps the SeaWeb ship types to a coarser group. Vessels, Hull Events and Newbuilding show and filter the group; a ship
        type without a group is shown as it is. The groups themselves are the phrases of the category "ship_type_group".
      </Typography.Paragraph>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input.Search allowClear placeholder="Search ship types" style={{ width: 280 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span>
          <Switch checked={unmappedOnly} onChange={setUnmappedOnly} size="small" /> Unmapped only ({unmappedCount.toLocaleString()})
        </span>
      </div>
      <Table<MappingRow>
        size="small"
        rowKey="ship_type"
        loading={loading}
        dataSource={visible}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        columns={[
          { title: "SeaWeb ship type", dataIndex: "ship_type", sorter: (a, b) => a.ship_type.localeCompare(b.ship_type) },
          {
            title: "Vessels",
            dataIndex: "vessel_count",
            width: 110,
            align: "right",
            defaultSortOrder: "descend",
            sorter: (a, b) => Number(a.vessel_count) - Number(b.vessel_count),
            render: (v: number) => Number(v).toLocaleString(),
          },
          {
            title: "Group",
            dataIndex: "group_phrase_id",
            width: 300,
            render: (_: string | null, row) => (
              <Select
                style={{ width: "100%" }}
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="— (shown as is)"
                options={groups}
                value={row.group_phrase_id ?? undefined}
                loading={saving === row.ship_type}
                disabled={saving != null}
                onChange={(value) => change(row, value)}
              />
            ),
          },
        ]}
      />
    </List>
  );
};
