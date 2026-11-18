// Ported 1:1 from COMPASS (app/src/components/orgTree.tsx).
import { useState, type ReactNode } from "react";
import { Button, theme as antdTheme } from "antd";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";

// A tree as an org chart: parents above, children below, any depth. Plain CSS (nested lists with connector lines),
// no chart library. A node with children can be collapsed, which keeps a large tree readable. Used for goals and for
// the reporting lines of people; the caller renders the node card.
const CSS = `
.org-tree { overflow-x: auto; padding: 8px 0 16px; }
.org-tree ul { display: flex; justify-content: center; margin: 0; padding: 20px 0 0; list-style: none; position: relative; }
.org-tree > ul { padding-top: 0; width: max-content; min-width: 100%; }
.org-tree li { display: flex; flex-direction: column; align-items: center; position: relative; padding: 20px 8px 0; }
.org-tree > ul > li { padding-top: 0; }
.org-tree li::before, .org-tree li::after { content: ""; position: absolute; top: 0; right: 50%; width: 50%; height: 20px; border-top: 1px solid var(--oc-line); }
.org-tree li::after { right: auto; left: 50%; border-left: 1px solid var(--oc-line); }
.org-tree li:only-child::before, .org-tree li:only-child::after { display: none; }
.org-tree li:only-child { padding-top: 0; }
.org-tree li:first-child::before, .org-tree li:last-child::after { border: 0 none; }
.org-tree li:last-child::before { border-right: 1px solid var(--oc-line); border-radius: 0 6px 0 0; }
.org-tree li:first-child::after { border-radius: 6px 0 0 0; }
.org-tree > ul > li::before, .org-tree > ul > li::after { display: none; }
.org-tree ul ul { padding-top: 32px; }
.org-tree ul ul::before { content: ""; position: absolute; top: 0; left: 50%; height: 32px; border-left: 1px solid var(--oc-line); }
.org-tree li:only-child > .org-tree-node { margin-top: 0; }
.org-tree.compact li { padding-left: 3px; padding-right: 3px; }
`;

type OrgTreeNode = { id: string; children: OrgTreeNode[] };

// The collapse button the node card puts at its bottom edge.
export const OrgToggle = ({ count, collapsed, onToggle }: { count: number; collapsed: boolean; onToggle: () => void }) => (
  <Button
    size="small"
    shape="round"
    onClick={onToggle}
    icon={collapsed ? <PlusOutlined /> : <MinusOutlined />}
    style={{ position: "absolute", bottom: -12, left: "50%", transform: "translateX(-50%)", zIndex: 1, fontSize: 11, height: 22, padding: "0 8px" }}
  >
    {count}
  </Button>
);

export function OrgTree<T extends OrgTreeNode>({ roots, renderNode, compact }: { roots: T[]; compact?: boolean; renderNode: (node: T, collapsed: boolean, toggle: () => void) => ReactNode }) {
  const { token } = antdTheme.useToken();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const render = (n: T) => (
    <li key={n.id}>
      {renderNode(n, collapsed.has(n.id), () => toggle(n.id))}
      {n.children.length > 0 && !collapsed.has(n.id) && <ul>{(n.children as T[]).map(render)}</ul>}
    </li>
  );

  return (
    <div className={compact ? "org-tree compact" : "org-tree"} style={{ ["--oc-line" as string]: token.colorBorder }}>
      <style>{CSS}</style>
      <ul>{roots.map(render)}</ul>
    </div>
  );
}
