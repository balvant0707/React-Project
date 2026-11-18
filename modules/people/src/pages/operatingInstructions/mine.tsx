// Ported 1:1 from COMPASS (app/src/pages/operatingInstructions/mine.tsx).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Empty, Input, List, Space, Spin, Typography, theme } from "antd";
import { useTranslation } from "react-i18next";
import { PublishedSheet } from "../../components/operatingInstruction/publishedSheet";
import { useMe } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { useInstructionStatus, useInstructions } from "../../hooks/useOperatingInstructions";
import { instructionNumber } from "../../lib/operatingInstructions";
import { SafetySign } from "../../lib/safetySigns";
import { InstructedTag, KindTag, byInstruction } from "./parts";

// "Mine": the operating instructions I must know, through the trainings required for me (positions, teams, roles, or
// me alone), with when I was instructed and on which version. Not instructed yet and reinstruction due come first.
export const MyInstructions = () => {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { userId } = useMe();
  const { data: rows, isLoading } = useInstructionStatus(userId);
  const { data: all } = useInstructions();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const en = i18n.resolvedLanguage === "en";

  const mine = useMemo(() => {
    const best = byInstruction((rows ?? []).filter((r) => r.required));
    return (all ?? [])
      .filter((x) => x.active && best.has(x.id))
      .map((x) => ({ row: x, status: best.get(x.id)! }))
      .sort((a, b) => Number(a.status.covered) - Number(b.status.covered) || a.row.number - b.row.number);
  }, [rows, all]);
  // Same fields as the search on the tab All.
  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mine;
    return mine.filter(({ row: r }) => [instructionNumber(r.number), r.legacy_number, r.title, r.title_en, r.subject, r.work_area].some((v) => (v ?? "").toLowerCase().includes(term)));
  }, [mine, search]);

  if (isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Spin /></div>;
  if (!mine.length) return <Empty description={t("operatingInstructions.mine.none")} />;
  const current = selected && list.some((x) => x.row.id === selected) ? selected : list[0]?.row.id;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: isMobile ? "1 1 auto" : "0 0 360px", minWidth: 0 }}>
        <Input.Search allowClear placeholder={t("operatingInstructions.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
        <List
          size="small"
          bordered
          locale={{ emptyText: t("operatingInstructions.mine.noMatch") }}
          dataSource={list}
          renderItem={({ row, status }) => (
            <List.Item
              onClick={() => (isMobile ? navigate(`/operating-instructions/${row.id}`) : setSelected(row.id))}
              style={{ cursor: "pointer", background: !isMobile && row.id === current ? token.colorPrimaryBg : undefined }}
            >
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Space size={2}>{[...new Set(Object.values(row.signs ?? {}).flat())].slice(0, 3).map((c) => <SafetySign key={c} code={c} size={22} />)}</Space>
                  <Typography.Text strong>{instructionNumber(row.number)} {(en && row.title_en) || row.title}</Typography.Text>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <KindTag kind={row.kind} />
                  <InstructedTag row={status} />
                </div>
              </div>
            </List.Item>
          )}
        />
      </div>
      {!isMobile && current && (
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <PublishedSheet key={current} instructionId={current} />
        </div>
      )}
    </div>
  );
};
