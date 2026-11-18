// Ported 1:1 from COMPASS (app/src/pages/assets/show.tsx).
import { Fragment, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { App as AntdApp, Breadcrumb, Button, Card, Descriptions, Dropdown, Empty, List as AntList, Popconfirm, Space, Spin, Tabs, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { AssetOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { ActivityFeed } from "@rbp/module-messaging/src/feed/activityFeed.tsx";
import { RecordChatButton } from "@rbp/module-messaging/src/feed/recordChatButton.tsx";
import { useIsMobile } from "@rbp/ui";
import { FieldBar } from "@rbp/module-task-family/src/components/fieldBar.tsx";
import { AccessBadge } from "@rbp/module-task-family/src/components/accessBadge.tsx";
import { StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { AssetFormModal } from "./assetForm";
import { useRecordSlot } from "@rbp/core";
import { TaskFormModal } from "@rbp/module-task-family/src/pages/tasks/taskForm.tsx";
import { RuleFormModal, type RuleRow } from "@rbp/module-task-family/src/pages/recurring/ruleForm.tsx";
import { scheduleLabel } from "@rbp/module-task-family/src/pages/recurring/schedule.ts";
import { OfflineToggle } from "../../components/offlineToggle";
import { useTeams } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { RecordFiles } from "@rbp/module-messaging/src/recordFiles.tsx";
import { DOCUMENT_TYPE_CATEGORY } from "@rbp/module-messaging/src/documentType.tsx";
import { AssetStatisticsTab, AssetTasksTab, AssetTicketsTab } from "./assetTabs";
import { usePermissions } from "@rbp/core";
import { useAssetAttributes } from "../../hooks/useAssetAttributes";
import { attributeKey, formatAttributeValue } from "../../lib/assetAttributes";
import { errorText } from "@rbp/core";
import { DEFAULT_ASSET_TYPE_ICON, DEFAULT_GROUPING_ICON, IconTile, iconFor } from "@rbp/ui";
import { usePageTitle } from "@rbp/core";

// Platform: the parts of upper modules come through slots of this page (tickets: assets.ticketForm; items: assets.itemsTab,
// assets.maintenanceSummary; people: assets.instructions). Every slot renders its first Component with the props given here.
const SlotPart = ({ slot, ...props }: { slot: string } & Record<string, unknown>) => {
  const Part = useRecordSlot(slot)[0]?.Component;
  return Part ? <Part {...props} /> : null;
};

const idFromPathLabel = (label: string) => label.replace(/_/g, "-");

export const publicReportUrl = (token: string) => `${window.location.origin}/report/${token}`;

// Platform: the shared record files panel of messaging (docs/shared-parts.md B5): COMPASS's documents list here, merged
// with NPM's attachments panel; the delete button follows the database rule (own file or record moderator).
const Documents = ({ assetId, canEdit }: { assetId: string; canEdit: boolean }) => (
  <RecordFiles entityType="assets" entityId={assetId} canEdit={canEdit} typeCategory={DOCUMENT_TYPE_CATEGORY} />
);

// Which teams are responsible for this asset: its own team and the teams of the nodes above it (they add up; what a
// member may do comes from their own roles). Set in the edit form; the rows above that the viewer cannot see stay out.
const ResponsibleTeams = ({ assetId, ancestorIds }: { assetId: string; ancestorIds: string[] }) => {
  const { t } = useTranslation();
  const { data: groups } = useTeams();
  const ids = [...ancestorIds, assetId];
  const { data: rows } = useQuery({
    queryKey: ["asset-teams", assetId, ids.join(",")],
    queryFn: async () => ((await supabaseClient.from("assets").select("id, name, team_id").in("id", ids).not("team_id", "is", null)).data ?? []) as { id: string; name: string; team_id: string }[],
  });
  const ordered = ids.map((id) => rows?.find((r) => r.id === id)).filter((r): r is { id: string; name: string; team_id: string } => !!r);
  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t("assets.teamHint")}
      </Typography.Paragraph>
      {ordered.length === 0 ? (
        <Typography.Text type="secondary">{t("assets.noTeam")}</Typography.Text>
      ) : (
        <Space direction="vertical" size={4}>
          {ordered.map((r) => (
            <Space key={r.id} size={4} wrap>
              <Tag color="purple">{groups?.find((g) => g.id === r.team_id)?.name ?? "…"}</Tag>
              {r.id !== assetId && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("assets.teamFrom", { name: r.name })}</Typography.Text>}
            </Space>
          ))}
        </Space>
      )}
    </div>
  );
};

export const AssetShow = () => {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [newTicket, setNewTicket] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [newRule, setNewRule] = useState(false);
  const { has } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  // Platform: tickets (and the statistics over them) come with the tickets module.
  const hasTickets = useRecordSlot("assets.ticketForm").length > 0;

  const { data: definitions } = useAssetAttributes();
  const { data: asset, isLoading, refetch } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => (await supabaseClient.from("assets_overview").select("*").eq("id", id).maybeSingle()).data as AssetOverviewRow | null,
  });

  const ancestorIds = (asset?.path ?? "").split(".").slice(0, -1).map(idFromPathLabel);
  const { data: ancestors } = useQuery({
    queryKey: ["asset-ancestors", asset?.path],
    enabled: ancestorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabaseClient.from("assets").select("id, name").in("id", ancestorIds);
      const byId = new Map((data ?? []).map((a) => [a.id as string, a.name as string]));
      return ancestorIds.filter((x) => byId.has(x)).map((x) => ({ id: x, name: byId.get(x)! }));
    },
  });

  const { data: children } = useQuery({
    queryKey: ["asset-children", id],
    queryFn: async () => ((await supabaseClient.from("assets_overview").select("id, name, asset_type_name, asset_type_name_de, status").eq("parent_asset_id", id).order("name")).data ?? []) as Pick<AssetOverviewRow, "id" | "name" | "asset_type_name" | "asset_type_name_de" | "status">[],
  });
  // Open work for the tab labels.
  const { data: counts } = useQuery({
    queryKey: ["asset-open-counts", id],
    queryFn: async () => {
      const [tk, tc] = await Promise.all([
        supabaseClient.from("tasks").select("id", { count: "exact", head: true }).eq("asset_id", id).not("status", "in", "(done,cancelled)"),
        supabaseClient.from("tickets").select("id", { count: "exact", head: true }).eq("asset_id", id).not("status", "in", "(resolved,closed)"),
      ]);
      return { tasks: tk.count ?? 0, tickets: tc.count ?? 0 };
    },
  });

  const { data: rules, refetch: refetchRules } = useQuery({
    queryKey: ["asset-rules", id],
    queryFn: async () =>
      ((await supabaseClient.from("recurring_task_rules_overview").select("*").eq("asset_id", id).order("next_due_date", { nullsFirst: false })).data ?? []) as (RuleRow & { team_name: string | null; assigned_user_name: string | null })[],
  });

  usePageTitle(asset?.name);
  if (isLoading) return <Spin />;
  if (!asset) return <Empty description={t("common.notFound")} />;

  // Values in definition order (by name); an attribute without a definition cannot exist (FK).
  const attributes = (definitions ?? []).flatMap((a) => {
    const value = asset.attribute_values?.[attributeKey(a.id)];
    return value == null ? [] : [{ attribute: a, value }];
  });

  const remove = async () => {
    const { error } = await supabaseClient.from("assets").delete().eq("id", asset.id);
    if (error) {
      message.error(error.message.includes("violates foreign key") ? t("assets.deleteBlocked") : errorText(error));
      return;
    }
    await queryClient.invalidateQueries();
    navigate("/assets");
  };

  const detailCards = [
    <Fragment key="c0">
      <Card size="small" title={t("assets.qrCode")}>
        <div style={{ textAlign: "center" }}>
          <QRCodeSVG value={publicReportUrl(asset.qr_code_token)} size={140} />
          <div style={{ marginTop: 8 }}>
            <Space>
              {children && children.length > 0 ? (
                <Dropdown
                  menu={{
                    items: [
                      { key: "only", label: t("assets.printOnlyThis") },
                      { key: "tree", label: t("assets.printWithChildren") },
                    ],
                    onClick: ({ key }) => navigate(key === "only" ? `/assets/labels?only=${asset.id}` : `/assets/labels?root=${asset.id}`),
                  }}
                >
                  <Button size="small" icon={<PrinterOutlined />}>
                    {t("assets.printLabels")} ▾
                  </Button>
                </Dropdown>
              ) : (
                <Button size="small" icon={<PrinterOutlined />} onClick={() => navigate(`/assets/labels?only=${asset.id}`)}>
                  {t("assets.printLabel")}
                </Button>
              )}
              <Button size="small" onClick={() => navigator.clipboard.writeText(publicReportUrl(asset.qr_code_token)).then(() => message.success(t("common.copied")))}>
                {t("assets.copyLink")}
              </Button>
            </Space>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("assets.qrHint")}</Typography.Text>
        </div>
      </Card>
    </Fragment>,
    <Fragment key="c2">
      <Card size="small" title={`${t("assets.children")} (${children?.length ?? 0})`}>
        {children && children.length > 0 ? (
          <AntList
            size="small"
            dataSource={children}
            renderItem={(c) => (
              <AntList.Item>
                <Link to={`/assets/${c.id}`}>{c.name}</Link>
                {c.asset_type_name && <Tag style={{ marginInlineEnd: 0 }}>{pickName(c.asset_type_name, c.asset_type_name_de)}</Tag>}
              </AntList.Item>
            )}
          />
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )}
      </Card>
    </Fragment>,
    <Fragment key="c6">
      <Card size="small" title={t("assets.team")}>
        <ResponsibleTeams assetId={asset.id} ancestorIds={asset.ancestor_asset_ids ?? []} />
      </Card>
    </Fragment>,
  ];

  const seriesTab = (
    <Card
      size="small"
      title={`${t("recurring.assetRules")} (${rules?.length ?? 0})`}
      extra={<Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setNewRule(true)}>{t("common.add")}</Button>}
    >
      <AntList
        size="small"
        dataSource={rules ?? []}
        locale={{ emptyText: "—" }}
        renderItem={(r) => (
          <AntList.Item>
            <div>
              <Link to="/recurring">{r.name}</Link>
              <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{scheduleLabel(t, r)}{r.next_due_date ? ` · ${formatDate(r.next_due_date)}` : ""}</Typography.Text></div>
            </div>
            {!r.active && <Tag>{t("status.inactive")}</Tag>}
          </AntList.Item>
        )}
      />
    </Card>
  );

  // The upper part of the page (fields, maintenance summary, technical data). Phone: the first tab.
  const header = (
    <>
      <FieldBar
        fields={[
          { label: t("fields.assetType"), value: pickName(asset.asset_type_name, asset.asset_type_name_de) },
          { label: t("fields.manufacturer"), value: asset.manufacturer },
          { label: t("fields.serialNumber"), value: asset.serial_number },
          { label: t("fields.location"), value: asset.location },
          { label: t("fields.responsible"), value: asset.responsible_user_name },
          { label: t("fields.operatingHours"), value: asset.operating_hours != null ? `${asset.operating_hours} h` : null, hidden: asset.operating_hours == null },
          { label: t("fields.createdAt"), value: formatDate(asset.created_at) },
          { label: t("recordAccess.field"), value: <AccessBadge entityType="assets" id={asset.id} /> },
        ]}
      />
      <SlotPart slot="assets.maintenanceSummary" assetId={asset.id} />
      {attributes.length > 0 && (
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }} style={{ marginTop: 12 }} title={<Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{t("assets.technicalData")}</Typography.Text>}>
          {attributes.map(({ attribute, value }) => (
            <Descriptions.Item key={attribute.id} label={attribute.name}>{formatAttributeValue(t, attribute, value)}</Descriptions.Item>
          ))}
        </Descriptions>
      )}
    </>
  );

  const tabItemsRest = [
    // Phone: no activity tab, the chat button opens the asset's conversation in the Messages module.
    ...(isMobile ? [] : [{ key: "activity", label: t("assets.tabActivity"), children: <ActivityFeed entityType="assets" entityId={asset.id} /> }]),
    { key: "tasks", label: `${t("assets.tabTasks")}${counts?.tasks ? ` (${counts.tasks})` : ""}`, children: <AssetTasksTab assetId={asset.id} onNew={() => setNewTask(true)} /> },
    ...(hasTickets ? [{ key: "tickets", label: `${t("assets.tabTickets")}${counts?.tickets ? ` (${counts.tickets})` : ""}`, children: <AssetTicketsTab assetId={asset.id} onNew={() => setNewTicket(true)} /> }] : []),
    { key: "series", label: `${t("assets.tabSeries")}${rules?.length ? ` (${rules.length})` : ""}`, children: seriesTab },
    ...(has("items.view") ? [{ key: "parts", label: t("assets.tabParts"), children: <SlotPart slot="assets.itemsTab" assetId={asset.id} /> }] : []),
    ...(has("operating_instructions.view.all") ? [{ key: "instructions", label: t("operatingInstructions.tab"), children: <SlotPart slot="assets.instructions" assetId={asset.id} /> }] : []),
    ...(hasTickets ? [{ key: "statistics", label: t("assets.tabStatistics"), children: <AssetStatisticsTab assetId={asset.id} /> }] : []),
    {
      key: "documents",
      label: t("assets.tabDocuments"),
      children: (
        <Card size="small" title={t("assets.documents")}>
          <Documents assetId={asset.id} canEdit />
        </Card>
      ),
    },
  ];
  const detailsTab = {
    key: "details",
    label: t("assets.tabDetails"),
    children: (
      <>
        {isMobile && header}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, alignItems: "start", marginTop: isMobile ? 16 : 0 }}>{detailCards}</div>
      </>
    ),
  };
  // Phone: Details first and opened first (the fields moved in from above the tabs); the chat then fills the screen.
  const tabItems = isMobile ? [detailsTab, ...tabItemsRest] : [...tabItemsRest, detailsTab];
  const defaultTab = isMobile ? "details" : "activity";
  const tab = tabItems.some((x) => x.key === searchParams.get("tab")) ? searchParams.get("tab")! : defaultTab;

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: <Link to="/assets">{t("nav.assets")}</Link> },
          ...(ancestors ?? []).map((a) => ({ title: <Link to={`/assets/${a.id}`}>{a.name}</Link> })),
        ]}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: isMobile ? 10 : 16, flexWrap: "wrap", marginBottom: 12 }}>
        <Space align="center" size={isMobile ? 10 : 12} wrap style={isMobile ? { minWidth: 0, maxWidth: "100%" } : undefined}>
          <IconTile icon={iconFor(asset.effective_icon, asset.is_grouping ? DEFAULT_GROUPING_ICON : DEFAULT_ASSET_TYPE_ICON)} color="navy" size={isMobile ? 32 : 40} />
          <Typography.Title level={3} style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{asset.name}</Typography.Title>
          <StatusTag status={asset.status} />
          {isMobile && <RecordChatButton entityType="assets" entityId={asset.id} title={asset.name} />}
        </Space>
        {/* Phone: the two things done most are buttons, the offline switch is an icon, everything else is in the menu. */}
        <Space wrap style={isMobile ? { width: "100%" } : undefined}>
          <OfflineToggle assetId={asset.id} compact={isMobile} />
          {isMobile ? (
            <>
              <Button type="primary" onClick={() => setNewTask(true)}>{t("tasks.new")}</Button>
              {hasTickets && <Button onClick={() => setNewTicket(true)}>{t("tickets.new")}</Button>}
            </>
          ) : (
            <>
              {hasTickets && <Button onClick={() => setNewTicket(true)}>{t("tickets.new")}</Button>}
              <Button onClick={() => setNewTask(true)}>{t("tasks.new")}</Button>
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>{t("common.edit")}</Button>
            </>
          )}
          <Dropdown
            menu={{
              items: [
                ...(isMobile ? [{ key: "edit", icon: <EditOutlined />, label: t("common.edit"), onClick: () => setEditing(true) }] : []),
                { key: "child", icon: <PlusOutlined />, label: t("assets.newChild"), onClick: () => navigate(`/assets?newChildOf=${asset.id}`) },
                {
                  key: "delete",
                  danger: true,
                  icon: <DeleteOutlined />,
                  label: (
                    <Popconfirm title={t("assets.deleteConfirm")} onConfirm={remove}>
                      <span>{t("common.delete")}</span>
                    </Popconfirm>
                  ),
                },
              ],
            }}
          >
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      </div>

      {!isMobile && header}

      <Tabs
        style={{ marginTop: 16 }}
        activeKey={tab}
        onChange={(key) => {
          setSearchParams(key === defaultTab ? {} : { tab: key }, { replace: true });
        }}
        items={tabItems}
        destroyInactiveTabPane
      />

      <AssetFormModal
        open={editing}
        asset={asset}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["assets-overview-all"] });
          void queryClient.invalidateQueries({ queryKey: ["assets-tree"] });
        }}
      />
      <RuleFormModal open={newRule} assetId={asset.id} onClose={() => setNewRule(false)} onSaved={() => { setNewRule(false); void refetchRules(); }} />
      <SlotPart slot="assets.ticketForm" open={newTicket} assetId={asset.id} onClose={() => setNewTicket(false)} onSaved={(tid: string) => navigate(`/tickets/${tid}`)} />
      <TaskFormModal open={newTask} assetId={asset.id} onClose={() => setNewTask(false)} onSaved={(tid) => navigate(`/tasks/${tid}`)} />
    </div>
  );
};
