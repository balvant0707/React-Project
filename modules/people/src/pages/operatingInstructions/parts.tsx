// Ported 1:1 from COMPASS (app/src/pages/operatingInstructions/parts.tsx).
import { Link } from "react-router-dom";
import { Card, Empty, Radio, Space, Table, Tag, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";
import {
  useAssetInstructions, useInstructionAccess, useInstructionStatus, useInstructions, useTrainingTypeInstructions, type InstructionStatusRow,
} from "../../hooks/useOperatingInstructions";
import { formatDate } from "@rbp/ui";
import { KIND_COLOR, VERSION_COLOR, instructionNumber, type InstructionKind, type InstructionOverview } from "../../lib/operatingInstructions";
import { SafetySign } from "../../lib/safetySigns";

export const KindTag = ({ kind }: { kind: InstructionKind }) => {
  const { t } = useTranslation();
  return <Tag color={KIND_COLOR[kind]}>{t(`operatingInstructions.kinds.${kind}`)}</Tag>;
};

// The published version and an open draft of an instruction.
export const InstructionStateTags = ({ row }: { row: InstructionOverview }) => {
  const { t } = useTranslation();
  return (
    <Space size={4} wrap>
      {row.published_version_no ? <Tag color="green">{t("operatingInstructions.versionNo", { no: row.published_version_no })}</Tag> : <Tag>{t("operatingInstructions.notPublished")}</Tag>}
      {row.open_status && <Tag color={VERSION_COLOR[row.open_status]}>{t(`operatingInstructions.status.${row.open_status}`)}</Tag>}
    </Space>
  );
};

// The instructions that apply to an asset (own, its type, the assets above it): tab on the asset page.
export const AssetInstructions = ({ assetId }: { assetId: string }) => {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useAssetInstructions(assetId);
  const en = i18n.resolvedLanguage === "en";
  return (
    <Table<InstructionOverview & { source: string }>
      rowKey="id"
      size="small"
      loading={isLoading}
      dataSource={(data ?? []).filter((r) => r.active)}
      pagination={{ pageSize: 25, hideOnSinglePage: true }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("operatingInstructions.noneLinked")} /> }}
      columns={[
        {
          title: t("operatingInstructions.titleField"),
          render: (_: unknown, r) => (
            <Link to={`/operating-instructions/${r.id}`}>{instructionNumber(r.number)} {(en && r.title_en) || r.title}</Link>
          ),
        },
        { title: t("operatingInstructions.kind"), render: (_: unknown, r) => <KindTag kind={r.kind} /> },
        {
          title: t("operatingInstructions.signs.label"),
          render: (_: unknown, r) => (
            <Space size={2}>
              {[...new Set(Object.values(r.signs ?? {}).flat())].slice(0, 6).map((c) => <Tooltip key={c} title={t(`safetySigns.codes.${c}`)}><span><SafetySign code={c} size={22} /></span></Tooltip>)}
            </Space>
          ),
        },
        { title: t("operatingInstructions.version"), render: (_: unknown, r) => <InstructionStateTags row={r} /> },
        { title: t("operatingInstructions.source.label"), render: (_: unknown, r) => (r.source === "asset" ? "—" : <Tag>{t(`operatingInstructions.source.${r.source}`)}</Tag>) },
      ]}
    />
  );
};

// Editorial change (nobody is due again) or significant change (everybody instructed on an older version is due).
export const ReinstructionChoice = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => {
  const { t } = useTranslation();
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value as boolean)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[false, true].map((v) => (
        <Radio key={String(v)} value={v}>
          <div>{t(`operatingInstructions.change.${v ? "significant" : "editorial"}`)}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t(`operatingInstructions.change.${v ? "significantHint" : "editorialHint"}`)}</Typography.Text>
        </Radio>
      ))}
    </Radio.Group>
  );
};

// Tag of a published or archived version after the first: editorial or with reinstruction.
export const ChangeTag = ({ reinstruction }: { reinstruction: boolean }) => {
  const { t } = useTranslation();
  return reinstruction ? <Tag color="gold">{t("operatingInstructions.change.significantTag")}</Tag> : <Tag>{t("operatingInstructions.change.editorialTag")}</Tag>;
};

// One row per instruction out of the per-type rows of a person: covered by any type wins, else the latest record.
export const byInstruction = (rows: InstructionStatusRow[] | undefined) => {
  const best = new Map<string, InstructionStatusRow>();
  for (const r of rows ?? []) {
    const have = best.get(r.instruction_id);
    if (!have || (r.covered && !have.covered) || (r.covered === have.covered && (r.completed_on ?? "") > (have.completed_on ?? ""))) best.set(r.instruction_id, r);
  }
  return best;
};

// Instructed (date, version), reinstruction due, or not instructed yet.
export const InstructedTag = ({ row }: { row: InstructionStatusRow }) => {
  const { t } = useTranslation();
  if (row.covered) return <Tag color="green" style={{ margin: 0 }}>{t("operatingInstructions.mine.instructed", { date: formatDate(row.completed_on), no: row.taught_version_no })}</Tag>;
  if (row.record_id) return <Tag color="gold" style={{ margin: 0 }}>{t("trainings.status.reinstruction")}</Tag>;
  return <Tag color="volcano" style={{ margin: 0 }}>{t("operatingInstructions.mine.notInstructed")}</Tag>;
};

const InstructionLine = ({ row, status, en }: { row: InstructionOverview; status?: InstructionStatusRow; en: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 0" }}>
    <Space size={2}>{[...new Set(Object.values(row.signs ?? {}).flat())].slice(0, 4).map((c) => <SafetySign key={c} code={c} size={22} />)}</Space>
    <Link to={`/operating-instructions/${row.id}`}>{instructionNumber(row.number)} {(en && row.title_en) || row.title}</Link>
    {status && <InstructedTag row={status} />}
  </div>
);

// Person page: the instructions this person must know (through the required trainings) and whether they were taught.
// Shown only to whoever may see the person's trainings (the database filters the rows).
export const PersonInstructions = ({ personId }: { personId: string }) => {
  const { t, i18n } = useTranslation();
  const { data: rows } = useInstructionStatus(personId);
  const { data: all } = useInstructions();
  const best = byInstruction((rows ?? []).filter((r) => r.required));
  const list = (all ?? []).filter((x) => best.has(x.id));
  if (!list.length) return null;
  return (
    <Card size="small" title={t("operatingInstructions.title")} style={{ marginBottom: 16 }}>
      {list.map((x) => <InstructionLine key={x.id} row={x} status={best.get(x.id)} en={i18n.resolvedLanguage === "en"} />)}
    </Card>
  );
};

// Position page: the instructions taught by the trainings the position requires.
export const InstructionsOfTrainings = ({ trainingTypeIds }: { trainingTypeIds: string[] }) => {
  const { t, i18n } = useTranslation();
  const { canView } = useInstructionAccess();
  const { data: links } = useTrainingTypeInstructions();
  const { data: all } = useInstructions();
  const ids = new Set((links ?? []).filter((l) => trainingTypeIds.includes(l.training_type_id)).map((l) => l.instruction_id));
  const list = (all ?? []).filter((x) => ids.has(x.id) && x.active);
  if (!canView || !list.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("operatingInstructions.taughtThrough")}</Typography.Text>
      {list.map((x) => <InstructionLine key={x.id} row={x} en={i18n.resolvedLanguage === "en"} />)}
    </div>
  );
};
