// Ported 1:1 from the NPM tool (app/src/pages/vessels/seawebAllocationModal.tsx).
import { useEffect, useState } from "react";
import { Alert, Button, Modal, Table, Tag, Typography } from "antd";
import { supabaseClient } from "@rbp/core";
import { loadCompanyOptionsWithGroupByIds } from "@rbp/module-companies/src/modules/companies/companies.ts";
import { escapeLike } from "@rbp/ui";

type OwnershipRole = "group_owner" | "ship_manager" | "technical_manager" | "operator";

const ROLES: { role: OwnershipRole; label: string }[] = [
  { role: "group_owner", label: "Group Owner" },
  { role: "ship_manager", label: "Ship Manager" },
  { role: "technical_manager", label: "Technical Manager" },
  { role: "operator", label: "Operator" },
];

type Row = {
  role: OwnershipRole;
  label: string;
  text: string;
  country: string;
  seawebCompanyId: string | null;
  allocatedId: string | null;
  manual: boolean;
};

// Everything ilike treats as a wildcard, escaped so the text is matched
// literally - a pattern with no wildcards left is a case-insensitive equality,
// which is exactly what get_or_create_seaweb_company matches on.

// Read-only twin of get_or_create_seaweb_company: which existing seaweb-sourced
// company this SeaWeb text resolves to, without creating one.
async function findSeawebCompanyId(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const { data } = await supabaseClient
    .from("companies")
    .select("id")
    .eq("source", "seaweb")
    .ilike("seaweb_match_name", escapeLike(trimmed))
    .maybeSingle();
  return data?.id ?? null;
}

const statusTag = (r: Row) => {
  if (!r.text) {
    return r.manual ? <Tag color="orange">Manual (no SeaWeb text)</Tag> : <Tag>No SeaWeb text</Tag>;
  }
  const same = !!r.seawebCompanyId && r.seawebCompanyId === r.allocatedId;
  if (!r.manual) return same ? <Tag color="green">Auto</Tag> : <Tag color="red">Auto - out of sync</Tag>;
  if (same) return <Tag color="blue">Manual - same as SeaWeb</Tag>;
  return <Tag color="orange">Manual override - differs from SeaWeb</Tag>;
};

export const SeawebAllocationModal = ({
  open,
  onClose,
  vesselRow,
  roleCompanyIds,
  roleManual,
  companyLabel,
}: {
  open: boolean;
  onClose: () => void;
  vesselRow: Record<string, unknown> | null;
  roleCompanyIds: Record<OwnershipRole, string | null>;
  roleManual: Record<OwnershipRole, boolean>;
  companyLabel: (id: string) => string;
}) => {
  const [seawebIds, setSeawebIds] = useState<Partial<Record<OwnershipRole, string | null>>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !vesselRow) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = await Promise.all(ROLES.map(({ role }) => findSeawebCompanyId(((vesselRow[role] as string) ?? ""))));
      const byRole: Partial<Record<OwnershipRole, string | null>> = {};
      ROLES.forEach(({ role }, i) => (byRole[role] = ids[i]));
      const wanted = [...new Set(ids.filter((v): v is string => !!v))];
      const opts = wanted.length ? await loadCompanyOptionsWithGroupByIds(wanted) : [];
      if (cancelled) return;
      setSeawebIds(byRole);
      setLabels(Object.fromEntries(opts.map((o) => [o.value, o.label])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vesselRow]);

  const rows: Row[] = ROLES.map(({ role, label }) => ({
    role,
    label,
    text: ((vesselRow?.[role] as string) ?? "").trim(),
    country: ((vesselRow?.[`${role}_country`] as string) ?? "").trim(),
    seawebCompanyId: seawebIds[role] ?? null,
    allocatedId: roleCompanyIds[role],
    manual: roleManual[role],
  }));

  const overrides = rows.filter((r) => r.manual && r.text && r.seawebCompanyId !== r.allocatedId);

  return (
    <Modal
      open={open}
      title="SeaWeb allocation"
      width={1100}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {overrides.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${overrides.length} manual override${overrides.length > 1 ? "s" : ""} differ from the current SeaWeb data (${overrides
            .map((r) => r.label)
            .join(", ")})`}
        />
      )}
      <Table<Row>
        size="small"
        bordered
        pagination={false}
        loading={loading}
        rowKey="role"
        dataSource={rows}
        columns={[
          { title: "Role", dataIndex: "label", width: 150, render: (v) => <Typography.Text strong>{v}</Typography.Text> },
          {
            title: "SeaWeb text",
            render: (_, r) =>
              r.text ? (
                <>
                  <div>{r.text}</div>
                  {r.country && <Typography.Text type="secondary">{r.country}</Typography.Text>}
                </>
              ) : (
                "—"
              ),
          },
          {
            title: "Company SeaWeb resolves to",
            render: (_, r) => (r.seawebCompanyId ? (labels[r.seawebCompanyId] ?? "…") : "—"),
          },
          {
            title: "Allocated company",
            render: (_, r) => (r.allocatedId ? companyLabel(r.allocatedId) : "—"),
          },
          { title: "Status", width: 260, render: (_, r) => statusTag(r) },
        ]}
      />
    </Modal>
  );
};
