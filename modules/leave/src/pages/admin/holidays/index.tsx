// Ported 1:1 from COMPASS (app/src/pages/admin/holidays/index.tsx).
import { useMemo, useState } from "react";
import { Alert, App as AntdApp, Button, Card, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { DeleteOutlined, DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { Page } from "@rbp/core";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { REGIONS, type HolidayRow } from "../../../lib/holidays";
import { supabaseClient } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";

// Public holidays (~/maintenance_tool/docs/leave.md): which state each site lies in, the import from Nager.Date, and the list with manual entries
// (company holidays, bridge days). Admin only.
const toMap = (pairs: [string, string][]) => new Map(pairs);

export const HolidaysPage = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: people } = usePeople();
  const thisYear = dayjs().year();
  const [year, setYear] = useState(thisYear);
  const [importYears, setImportYears] = useState<number[]>([thisYear, thisYear + 1, thisYear + 2]);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm<{ date: dayjs.Dayjs; name: string; site?: string }>();

  const sites = useMemo(() => [...new Set((people ?? []).map((p) => p.site).filter((s): s is string => !!s))].sort(), [people]);
  const { data: regions } = useQuery({
    queryKey: ["site-regions"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("site_regions").select("site, region");
      if (error) throw error;
      return (data ?? []).map((r) => [r.site as string, r.region as string] as [string, string]);
    },
    // The cache is persisted as JSON, so it holds the pairs; the Map is built here (offline/persistCache.ts).
    select: toMap,
  });
  const { data: holidays, isLoading } = useQuery({
    queryKey: ["public-holidays-admin", year],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("public_holidays").select("id, holiday_date, name, site, source").gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`).order("holiday_date");
      if (error) throw error;
      return (data ?? []) as HolidayRow[];
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["public-holidays-admin"] });
    void queryClient.invalidateQueries({ queryKey: ["public-holidays"] });
    void queryClient.invalidateQueries({ queryKey: ["public-holidays-last"] });
  };

  const setRegion = async (site: string, region: string | undefined) => {
    const { error } = region ? await supabaseClient.from("site_regions").upsert({ site, region }) : await supabaseClient.from("site_regions").delete().eq("site", site);
    if (error) return void message.error(errorText(error));
    void queryClient.invalidateQueries({ queryKey: ["site-regions"] });
  };

  const runImport = async () => {
    setImporting(true);
    const { data, error } = await supabaseClient.functions.invoke("import-holidays", { body: { years: importYears } });
    setImporting(false);
    if (error || !data?.ok) return void message.error(t("holidays.importFailed", { error: data?.message ?? data?.error ?? error?.message ?? "" }));
    message.success(t("holidays.imported", { count: data.imported }));
    if (data.sites_without_region?.length) message.warning(t("holidays.sitesWithoutRegion", { sites: data.sites_without_region.join(", ") }), 8);
    refresh();
  };

  const add = async (v: { date: dayjs.Dayjs; name: string; site?: string }) => {
    const { error } = await supabaseClient.from("public_holidays").insert({ holiday_date: v.date.format("YYYY-MM-DD"), name: v.name.trim(), site: v.site ?? null, source: "manual" });
    if (error) return void message.error(errorText(error));
    setAdding(false);
    form.resetFields();
    refresh();
  };
  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("public_holidays").delete().eq("id", id);
    if (error) return void message.error(errorText(error));
    refresh();
  };

  const yearOptions = Array.from({ length: 8 }, (_, i) => thisYear - 1 + i);
  return (
    <Page hint={t("holidays.subtitle")}>
      <Card size="small" title={t("holidays.regionsTitle")} style={{ maxWidth: 720, marginBottom: 16 }}>
        <Typography.Paragraph type="secondary">{t("holidays.regionsHint")}</Typography.Paragraph>
        {sites.length === 0 && <Typography.Text type="secondary">{t("holidays.noSites")}</Typography.Text>}
        {sites.map((site) => (
          <div key={site} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <span style={{ minWidth: 120 }}>{site}</span>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t("holidays.noRegion")}
              style={{ minWidth: 260, maxWidth: "100%" }}
              value={regions?.get(site)}
              options={REGIONS.map((r) => ({ value: r.code, label: r.name }))}
              onChange={(value) => void setRegion(site, value)}
            />
          </div>
        ))}
      </Card>

      <Card size="small" title={t("holidays.importTitle")} style={{ maxWidth: 720, marginBottom: 16 }}>
        <Typography.Paragraph type="secondary">{t("holidays.importHint")}</Typography.Paragraph>
        <Space wrap>
          <Select mode="multiple" style={{ minWidth: 260 }} value={importYears} onChange={setImportYears} options={yearOptions.map((y) => ({ value: y, label: String(y) }))} />
          <Button type="primary" icon={<DownloadOutlined />} loading={importing} disabled={importYears.length === 0} onClick={() => void runImport()}>
            {t("holidays.import")}
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>{t("holidays.importSource")}</Typography.Paragraph>
      </Card>

      <Alert type="info" showIcon style={{ maxWidth: 720, marginBottom: 12 }} message={t("holidays.partialHint")} />
      <Space style={{ marginBottom: 12 }}>
        <Select value={year} onChange={setYear} options={yearOptions.map((y) => ({ value: y, label: String(y) }))} style={{ width: 100 }} />
        <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>{t("holidays.add")}</Button>
      </Space>
      <Table<HolidayRow>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={holidays ?? []}
        pagination={false}
        columns={[
          { title: t("holidays.date"), dataIndex: "holiday_date", render: (d: string) => `${dayjs(d).format("dd")} ${formatDate(d)}` },
          { title: t("fields.name"), dataIndex: "name" },
          { title: t("holidays.scope"), dataIndex: "site", render: (s: string | null) => s ?? t("holidays.everywhere") },
          { title: t("holidays.source"), dataIndex: "source", render: (s: HolidayRow["source"]) => <Tag color={s === "import" ? "blue" : "default"}>{t(`holidays.sources.${s}`)}</Tag> },
          {
            title: "",
            align: "right",
            render: (_, r) => (
              <Popconfirm title={t("holidays.deleteConfirm")} onConfirm={() => void remove(r.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal open={adding} title={t("holidays.add")} onCancel={() => setAdding(false)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={add}>
          <Form.Item name="date" label={t("holidays.date")} rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="name" label={t("fields.name")} rules={[{ required: true }, { max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="site" label={t("holidays.scope")}>
            <Select allowClear placeholder={t("holidays.everywhere")} options={sites.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Page>
  );
};
