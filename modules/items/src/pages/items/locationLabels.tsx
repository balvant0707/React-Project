// Ported 1:1 from COMPASS (app/src/pages/items/locationLabels.tsx).
import { useSearchParams } from "react-router-dom";
import { Button, Spin } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { List } from "@rbp/core";
import { useStockLocations } from "../../hooks/useStock";
import { locationUrl, subtreeIds } from "../../lib/stock";

// Printable QR labels for the stock locations (all, or one location and everything below it with ?root=<id>). Scanning a
// label with the phone camera opens the page of that location.
export const LocationLabels = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const rootId = params.get("root");
  const { nodes, locations, isLoading } = useStockLocations();
  const shown = rootId ? new Set(subtreeIds(locations, rootId)) : null;
  const labels = nodes.filter((n) => n.is_active && (!shown || shown.has(n.id)));

  return (
    <List
      hint={t("stock.labelsHint")}
      headerButtons={<Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>{t("common.print")}</Button>}
    >
      <style>{`
        @media print {
          .ant-layout-sider, #app-header, .ant-layout-sider-children { display: none !important; }
          .ant-layout-content { padding: 0 !important; }
          .label-grid { gap: 8px !important; }
        }
      `}</style>
      {isLoading ? (
        <Spin />
      ) : (
        <div className="label-grid" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {labels.map((l) => (
            <div key={l.id} style={{ width: 200, border: "1px solid #bbb", borderRadius: 6, padding: 12, textAlign: "center", breakInside: "avoid", background: "#fff", color: "#000" }}>
              <QRCodeSVG value={locationUrl(l.id)} size={140} />
              <div style={{ fontWeight: 600, marginTop: 6 }}>{l.name}</div>
              {l.depth > 0 && <div style={{ fontSize: 11, color: "#555" }}>{l.path}</div>}
              <div style={{ fontSize: 12, color: "#000", fontFamily: "monospace" }}>{l.code}</div>
            </div>
          ))}
        </div>
      )}
    </List>
  );
};
