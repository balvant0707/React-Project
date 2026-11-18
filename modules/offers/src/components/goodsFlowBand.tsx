// Ported 1:1 from the NPM tool (app/src/components/goodsFlowBand.tsx).
import { Link } from "react-router-dom";
import { Card, Typography, theme } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";

// The flow of goods and money of one deal, shown on top of the offer and the order page:
// Supplier -> Owner Associate -> Customer. Read-only; the values come from the header form of the page.
// "Owner Associate" is the UI name of the tenant (our selling entity) in the offer and order module.

export type FlowParty = {
  name?: string | null;
  // Second line, e.g. the vessel the customer receives the goods for.
  detail?: string | null;
  // Company page of the party, when it is a company.
  companyId?: string | null;
};

const Node = ({ role, hint, party }: { role: string; hint: string; party: FlowParty }) => {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        flex: "1 1 200px",
        minWidth: 0,
        padding: "8px 12px",
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        background: token.colorFillQuaternary,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {role} <span style={{ opacity: 0.7 }}>· {hint}</span>
      </Typography.Text>
      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {party.name ? party.companyId ? <Link to={`/companies/${party.companyId}`}>{party.name}</Link> : party.name : <Typography.Text type="secondary">Not set</Typography.Text>}
      </div>
      {party.detail && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {party.detail}
        </Typography.Text>
      )}
    </div>
  );
};

const Arrow = () => (
  <div style={{ flex: "0 0 auto", textAlign: "center", padding: "0 4px" }}>
    <ArrowRightOutlined />
  </div>
);

export function GoodsFlowBand({ supplier, ownerAssociate, customer }: { supplier: FlowParty; ownerAssociate: FlowParty; customer: FlowParty }) {
  return (
    <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: "12px 16px" } }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Node role="Supplier" hint="produces and delivers" party={supplier} />
        <Arrow />
        <Node role="Owner Associate" hint="sells and invoices" party={ownerAssociate} />
        <Arrow />
        <Node role="Customer" hint="receives the goods" party={customer} />
      </div>
    </Card>
  );
}
