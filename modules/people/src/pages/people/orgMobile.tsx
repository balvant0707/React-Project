// Ported 1:1 from COMPASS (app/src/pages/people/orgMobile.tsx).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Typography, theme as antdTheme } from "antd";
import { ArrowUpOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "@rbp/core";
import { personName, type PersonNode } from "@rbp/module-messaging/src/lib/people.ts";

// Phone org chart: one leader on top (always centred), their direct reports in a row below that scrolls sideways,
// each with their own team as a dash list. The plus on a report makes them the leader; the arrow goes back up.
const Card = ({ node, teams, width, children }: { node: PersonNode; teams: string[]; width?: number; children?: React.ReactNode }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  return (
    <div
      style={{
        width, boxSizing: "border-box", padding: 8, textAlign: "left", flex: "none",
        background: token.colorBgContainer,
        border: `1px ${node.has_login ? "solid" : "dashed"} ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius, boxShadow: token.boxShadowTertiary,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <PersonAvatar person={node} size={32} />
        <div style={{ minWidth: 0 }}>
          <Link to={`/people/${node.id}`} style={{ fontWeight: 600, display: "block", lineHeight: 1.25, overflowWrap: "anywhere" }}>{personName(node)}</Link>
          {node.position && <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", lineHeight: 1.25 }}>{node.position}</Typography.Text>}
          {teams.length > 0 && <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", lineHeight: 1.25 }}>{teams.join(", ")}</Typography.Text>}
          {!node.has_login && <Typography.Text type="secondary" style={{ fontSize: 10 }}>{t("people.noLogin")}</Typography.Text>}
        </div>
      </div>
      {children}
    </div>
  );
};

export const OrgChartMobile = ({ roots, teamsOf }: { roots: PersonNode[]; teamsOf: Map<string, string[]> }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const [path, setPath] = useState<string[]>([]);

  // The chain of leaders from the top; ids that vanished with a filter drop out.
  const chain = useMemo(() => {
    const out: PersonNode[] = [];
    let level = roots;
    for (const id of path) {
      const n = level.find((x) => x.id === id);
      if (!n) break;
      out.push(n);
      level = n.children;
    }
    // A single top person is the leader from the start.
    if (!out.length && roots.length === 1) out.push(roots[0]);
    return out;
  }, [roots, path]);
  const lead = chain[chain.length - 1];
  const row = lead ? lead.children : roots;
  const canGoUp = chain.length > (roots.length === 1 ? 1 : 0);
  const up = () => setPath(chain.slice(0, -1).map((n) => n.id));
  const down = (id: string) => setPath([...chain.map((n) => n.id), id]);

  return (
    <div>
      {lead && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {canGoUp && <Button size="small" icon={<ArrowUpOutlined />} onClick={up}>{t("people.orgUp", { name: chain.length > 1 ? personName(chain[chain.length - 2]) : t("people.orgChart") })}</Button>}
          <Card node={lead} teams={teamsOf.get(lead.id) ?? []} width={240} />
          <div style={{ width: 1, height: 16, background: token.colorBorder }} />
        </div>
      )}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 12px", alignItems: "flex-start", scrollSnapType: "x proximity" }}>
        {row.map((n) => (
          <div key={n.id} style={{ scrollSnapAlign: "start", display: "flex" }}>
            <Card node={n} teams={teamsOf.get(n.id) ?? []} width={190}>
              {n.children.length > 0 && (
                <>
                  <ul style={{ margin: "8px 0 6px", padding: 0, listStyle: "none", fontSize: 12 }}>
                    {n.children.map((c) => (
                      <li key={c.id} style={{ lineHeight: 1.5 }}>
                        – <Link to={`/people/${c.id}`}>{personName(c)}</Link>
                        {c.position && <Typography.Text type="secondary" style={{ fontSize: 11 }}> · {c.position}</Typography.Text>}
                      </li>
                    ))}
                  </ul>
                  <Button size="small" block icon={<PlusOutlined />} onClick={() => down(n.id)}>{n.children.length}</Button>
                </>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};
