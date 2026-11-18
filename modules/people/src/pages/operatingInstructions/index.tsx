// Ported 1:1 from COMPASS (app/src/pages/operatingInstructions/index.tsx).
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { App as AntdApp, Button, Form, Input, Modal, Segmented, Select, Space, Switch, Table, Tag, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Page } from "@rbp/core";
import { OwnerSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { useUserMap } from "@rbp/core";
import { useInstructionAccess, useInstructions, useInstructionsRefresh } from "../../hooks/useOperatingInstructions";
import { KINDS, instructionNumber, reviewOverdue, type InstructionKind, type InstructionOverview } from "../../lib/operatingInstructions";
import { SafetySign } from "../../lib/safetySigns";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { KindTag, InstructionStateTags } from "./parts";
import { MyInstructions } from "./mine";
import { InstructionExcelButton } from "./excel";

type StateFilter = "all" | "published" | "open" | "review";

// The operating instructions (~/maintenance_tool/docs/operating-instructions.md): tab Mine (through my required trainings, with a preview)
// and tab All (a reader sees the published ones, writers and approvers also the drafts they may work on; ?view=all).
export const OperatingInstructionList = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const access = useInstructionAccess();
  const users = useUserMap();
  const { data, isLoading } = useInstructions();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<InstructionKind | "all">("all");
  const [state, setState] = useState<StateFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "all" ? "all" : "mine";
  const en = i18n.resolvedLanguage === "en";
  const title = (r: InstructionOverview) => (en && r.title_en ? r.title_en : r.title);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => showInactive || r.active)
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => state === "all" || (state === "published" ? !!r.published_version_id : state === "open" ? !!r.open_version_id : reviewOverdue(r.review_due_on)))
      .filter((r) => !term || [instructionNumber(r.number), r.legacy_number, r.title, r.title_en, r.subject, r.work_area].some((v) => (v ?? "").toLowerCase().includes(term)));
  }, [data, search, kind, state, showInactive]);

  return (
    <Page title={t("operatingInstructions.title")} hint={t("operatingInstructions.hint")} headerButtons={access.canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>{t("operatingInstructions.add")}</Button>}>
      <Segmented
        style={{ marginBottom: 12 }}
        value={view}
        onChange={(v) => setParams(v === "all" ? { view: "all" } : {}, { replace: true })}
        options={[{ value: "mine", label: t("operatingInstructions.mine.tab") }, { value: "all", label: t("operatingInstructions.allTab") }]}
      />
      {view === "mine" ? <MyInstructions /> : (<>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <Input.Search allowClear placeholder={t("operatingInstructions.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
        <Segmented value={kind} onChange={(v) => setKind(v as InstructionKind | "all")} options={[{ value: "all", label: t("operatingInstructions.allKinds") }, ...KINDS.map((k) => ({ value: k, label: t(`operatingInstructions.kinds.${k}`) }))]} />
        <Select<StateFilter>
          value={state}
          onChange={setState}
          style={{ width: 200 }}
          options={(["all", "published", "open", "review"] as StateFilter[]).map((s) => ({ value: s, label: t(`operatingInstructions.stateFilter.${s}`) }))}
        />
        <span><Switch checked={showInactive} onChange={setShowInactive} /> {t("operatingInstructions.showInactive")}</span>
        <div style={{ marginLeft: "auto" }}><InstructionExcelButton rows={rows} /></div>
      </div>
      <Table<InstructionOverview>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={rows}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        onRow={(r) => ({ onClick: () => navigate(`/operating-instructions/${r.id}`), style: { cursor: "pointer" } })}
        columns={[
          { title: t("operatingInstructions.number"), render: (_: unknown, r) => instructionNumber(r.number), sorter: (a, b) => a.number - b.number, defaultSortOrder: "ascend", width: 100 },
          {
            title: t("operatingInstructions.titleField"),
            sorter: (a, b) => title(a).localeCompare(title(b)),
            render: (_: unknown, r) => (
              <div>
                <Link to={`/operating-instructions/${r.id}`} onClick={(e) => e.stopPropagation()}>{title(r) || "—"}</Link>
                {!r.active && <Tag style={{ marginLeft: 8 }}>{t("operatingInstructions.inactive")}</Tag>}
                {(r.subject || r.work_area) && <div style={{ fontSize: 12, opacity: 0.7 }}>{[r.subject, r.work_area].filter(Boolean).join(" · ")}</div>}
              </div>
            ),
          },
          { title: t("operatingInstructions.kind"), render: (_: unknown, r) => <KindTag kind={r.kind} /> },
          {
            title: t("operatingInstructions.signs.label"),
            render: (_: unknown, r) => {
              const codes = [...new Set(Object.values(r.signs ?? {}).flat())];
              return (
                <Space size={2}>
                  {codes.slice(0, 6).map((c) => <Tooltip key={c} title={t(`safetySigns.codes.${c}`)}><span><SafetySign code={c} size={22} /></span></Tooltip>)}
                  {codes.length > 6 && <span style={{ fontSize: 12 }}>+{codes.length - 6}</span>}
                </Space>
              );
            },
          },
          { title: t("operatingInstructions.version"), render: (_: unknown, r) => <InstructionStateTags row={r} /> },
          {
            title: t("operatingInstructions.reviewDue"),
            sorter: (a, b) => (a.review_due_on ?? "9").localeCompare(b.review_due_on ?? "9"),
            render: (_: unknown, r) => (r.review_due_on ? <span style={{ color: reviewOverdue(r.review_due_on) ? "#cf1322" : undefined }}>{formatDate(r.review_due_on)}</span> : "—"),
          },
          { title: t("fields.owner"), render: (_: unknown, r) => (r.owner_user_id ? users.get(r.owner_user_id)?.name ?? "—" : "—") },
          { title: t("operatingInstructions.languages"), render: (_: unknown, r) => r.languages.map((l) => <Tag key={l}>{l.toUpperCase()}</Tag>) },
        ]}
      />
      </>)}
      <CreateInstructionModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/operating-instructions/${id}`)} />
    </Page>
  );
};

const CreateInstructionModal = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const refresh = useInstructionsRefresh();
  const [form] = Form.useForm<{ kind: InstructionKind; title: string; owner: string | null }>();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const v = await form.validateFields();
    setBusy(true);
    const { data, error } = await supabaseClient.rpc("operating_instruction_create", { p_kind: v.kind, p_title: v.title.trim(), p_owner: v.owner ?? undefined });
    setBusy(false);
    if (error) {
      message.error(errorText(error));
      return;
    }
    void refresh();
    form.resetFields();
    onClose();
    onCreated(data as string);
  };
  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={busy} title={t("operatingInstructions.add")} okText={t("operatingInstructions.create")} cancelText={t("common.cancel")} destroyOnClose>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: "substance" }}>
        <Form.Item name="kind" label={t("operatingInstructions.kind")} extra={t("operatingInstructions.kindHint")}>
          <Segmented options={KINDS.map((k) => ({ value: k, label: t(`operatingInstructions.kinds.${k}`) }))} />
        </Form.Item>
        <Form.Item name="title" label={t("operatingInstructions.titleField")} extra={t("operatingInstructions.titleHint")} rules={[{ required: true, whitespace: true }]}>
          <Input maxLength={200} autoFocus />
        </Form.Item>
        <Form.Item name="owner" label={t("fields.owner")} extra={t("operatingInstructions.ownerHint")}>
          <OwnerSelect />
        </Form.Item>
      </Form>
    </Modal>
  );
};
