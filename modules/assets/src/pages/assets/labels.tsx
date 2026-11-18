// Ported 1:1 from COMPASS (app/src/pages/assets/labels.tsx).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Checkbox, Space, Spin, Typography } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { fetchAllPages } from "@rbp/ui";
import type { AssetOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { publicReportUrl } from "./show";

// Printable QR stickers for an asset (and everything below it, or all visible assets).
export const AssetLabels = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const rootId = params.get("root");
  const onlyId = params.get("only");
  const { data, isLoading } = useQuery({
    queryKey: ["assets-overview-all"],
    queryFn: () => fetchAllPages<AssetOverviewRow>((from, to) => supabaseClient.from("assets_overview").select("*").order("path").range(from, to)),
  });

  const labels = useMemo(() => {
    const rows = data ?? [];
    if (onlyId) return rows.filter((r) => r.id === onlyId);
    const root = rootId ? rows.find((r) => r.id === rootId) : undefined;
    return root ? rows.filter((r) => r.path === root.path || r.path.startsWith(`${root.path}.`)) : rows;
  }, [data, rootId, onlyId]);

  // Which stickers go to the printer; everything is ticked when the list changes.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPicked(new Set(labels.map((a) => a.id))), [labels]);
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const showPicker = labels.length > 1;

  return (
    <List
      hint={t("assets.labelsHint")}
      headerButtons={
        <Space wrap>
          {showPicker && (
            <>
              <Typography.Text type="secondary">{t("assets.labelsPicked", { count: picked.size, total: labels.length })}</Typography.Text>
              <Button onClick={() => setPicked(new Set(labels.map((a) => a.id)))}>{t("assets.labelsAll")}</Button>
              <Button onClick={() => setPicked(new Set())}>{t("assets.labelsNone")}</Button>
            </>
          )}
          <Button type="primary" icon={<PrinterOutlined />} disabled={picked.size === 0} onClick={() => window.print()}>
            {t("common.print")}
          </Button>
        </Space>
      }
    >
      <style>{`
        @media print {
          .ant-layout-sider, #app-header, .ant-layout-sider-children { display: none !important; }
          .ant-layout-content { padding: 0 !important; }
          .label-grid { gap: 8px !important; }
          .label-unpicked, .label-pick { display: none !important; }
        }
      `}</style>
      {isLoading ? (
        <Spin />
      ) : (
        <div className="label-grid" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {labels.map((a) => (
            <div
              key={a.id}
              className={picked.has(a.id) ? undefined : "label-unpicked"}
              style={{ opacity: picked.has(a.id) ? 1 : 0.4, width: 200, border: "1px solid #bbb", borderRadius: 6, padding: 12, textAlign: "center", breakInside: "avoid", background: "#fff", color: "#000" }}
            >
              {showPicker && (
                <div className="label-pick" style={{ textAlign: "left", marginBottom: 4 }}>
                  <Checkbox checked={picked.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />
                </div>
              )}
              <QRCodeSVG value={publicReportUrl(a.qr_code_token)} size={140} />
              <div style={{ fontWeight: 600, marginTop: 6 }}>{a.name}</div>
              {a.ancestor_path_label && <div style={{ fontSize: 11, color: "#555" }}>{a.ancestor_path_label}</div>}
              <Typography.Text style={{ fontSize: 10, color: "#555" }}>{t("assets.scanToReport")}</Typography.Text>
            </div>
          ))}
        </div>
      )}
    </List>
  );
};
