import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Select, Spin } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { formatDate } from "@rbp/ui";
import { hasLeft, personName, type PersonRow } from "@rbp/module-messaging/src/lib/people.ts";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { PRINT_BASE_CSS } from "../../components/printSheet";

// Phone list: everybody who has a number, "Last, First", mobile and landline, as dense as legible on paper:
// two columns of ROWS rows = 100 people per A4 page (7 pt, 5 mm per row). A page of its own outside the shell.
const ROWS = 50;
const PER_PAGE = ROWS * 2;

// "First Last" -> "Last, First" (the last word is the family name); a single word stays as it is.
const listName = (p: PersonRow) => {
  const name = personName(p).trim();
  const i = name.lastIndexOf(" ");
  return i < 0 ? name : `${name.slice(i + 1)}, ${name.slice(0, i)}`;
};

export const PhoneListPrint = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: people, isLoading } = usePeople();
  const site = params.get("site") ?? undefined;

  const sites = useMemo(() => [...new Set((people ?? []).map((p) => p.site).filter((s): s is string => !!s))].sort(), [people]);
  const rows = useMemo(
    () =>
      (people ?? [])
        .filter((p) => !hasLeft(p) && (p.phone_mobile || p.phone_office) && (!site || p.site === site))
        .map((p) => ({ id: p.id, name: listName(p), mobile: p.phone_mobile, landline: p.phone_office }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people, site],
  );
  const pages = useMemo(() => {
    const out: (typeof rows)[] = [];
    for (let i = 0; i < rows.length; i += PER_PAGE) out.push(rows.slice(i, i + PER_PAGE));
    return out;
  }, [rows]);

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin size="large" /></div>;

  return (
    <div className="print-page">
      <style>{`${PRINT_BASE_CSS}
        .phone-sheet { padding: 10mm; font-family: Arial, Helvetica, sans-serif; }
        .phone-page { height: 277mm; break-after: page; overflow: hidden; }
        .phone-page:last-child { break-after: auto; }
        .phone-head { display: flex; justify-content: space-between; align-items: baseline; height: 7mm; border-bottom: 0.3mm solid #000; margin-bottom: 1mm; font-size: 9pt; font-weight: 700; }
        .phone-head span { font-size: 6.5pt; font-weight: 400; }
        .phone-grid { display: grid; grid-auto-flow: column; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(${ROWS}, 5mm); column-gap: 6mm; font-size: 7pt; line-height: 5mm; }
        .phone-row { display: grid; grid-template-columns: 1fr 24mm 24mm; gap: 1.5mm; border-bottom: 0.1mm solid #bbb; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .phone-row b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
        .phone-row.cols { font-size: 6pt; color: #555; font-weight: 600; text-transform: uppercase; }
        .phone-cols { display: grid; grid-template-columns: 1fr 1fr; column-gap: 6mm; height: 4mm; line-height: 4mm; }
        @media print { @page { size: A4; margin: 0; } }
      `}</style>

      <div className="print-toolbar no-print">
        <Link to="/people">{t("people.title")}</Link>
        <span style={{ flex: 1 }} />
        {sites.length > 1 && (
          <Select
            allowClear
            placeholder={t("people.site")}
            value={site}
            style={{ minWidth: 160 }}
            onChange={(v) => setParams(v ? { site: v } : {}, { replace: true })}
            options={sites.map((s) => ({ value: s, label: s }))}
          />
        )}
        <Button type="primary" icon={<PrinterOutlined />} disabled={!rows.length} onClick={() => window.print()}>{t("common.print")}</Button>
      </div>

      <div className="print-sheet phone-sheet" style={{ maxWidth: "210mm", padding: "10mm" }}>
        {pages.map((chunk, n) => (
          <div className="phone-page" key={n}>
            <div className="phone-head">
              {t("people.phoneList")}{site ? ` · ${site}` : ""}
              <span>{t("people.phoneListPrinted", { date: formatDate(new Date().toISOString()), page: n + 1, pages: pages.length })}</span>
            </div>
            <div className="phone-cols">
              {[0, 1].map((c) => (
                <div className="phone-row cols" key={c}>
                  <span />
                  <span>{t("people.phoneListMobile")}</span>
                  <span>{t("people.phoneListLandline")}</span>
                </div>
              ))}
            </div>
            <div className="phone-grid">
              {chunk.map((r) => (
                <div className="phone-row" key={r.id}>
                  <b>{r.name}</b>
                  <span>{r.mobile ?? ""}</span>
                  <span>{r.landline ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
