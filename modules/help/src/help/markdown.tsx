// Ported 1:1 from COMPASS (app/src/help/markdown.tsx).
import { Fragment, type ReactNode } from "react";
import { Typography, theme as antdTheme } from "antd";
import { foldText } from "@rbp/ui";

const { useToken } = antdTheme;

// A deliberately small Markdown subset for the manual (src/help/<language>/*.md). Supported: headings (# ## ###, an
// explicit id as `{#id}`), paragraphs, flat bullet and numbered lists, `> ` callouts, pipe tables, **bold**, *italic*,
// `code` and [links](/route | help:chapter#section | https://...). The text is ours (no user input), and everything is
// rendered as React nodes, never as raw HTML.

export type Block =
  | { type: "heading"; level: 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "callout"; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

const slugify = (text: string) =>
  foldText(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function parseBlocks(markdown: string): { title: string; blocks: Block[] } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let title = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*?)\s*(\{#([a-z0-9-]+)\})?\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) title = heading[2];
      else blocks.push({ type: "heading", level: level as 2 | 3, text: heading[2], id: heading[4] ?? slugify(heading[2]) });
      i++;
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", head, rows });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) parts.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ type: "callout", text: parts.join(" ") });
      continue;
    }
    const bullet = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[1]) === ordered) {
          items.push(m[2]);
          i++;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`; // continuation line
          i++;
        } else break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*\|)/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) parts.push(lines[i++].trim());
    blocks.push({ type: "paragraph", text: parts.join(" ") });
  }
  return { title, blocks };
}

// Markdown source without the markup, for the search index and snippets.
export const plainText = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");

export const blockText = (b: Block) => {
  switch (b.type) {
    case "heading":
    case "paragraph":
    case "callout":
      return plainText(b.text);
    case "list":
      return b.items.map(plainText).join(" ");
    case "table":
      return [...b.head, ...b.rows.flat()].map(plainText).join(" ");
  }
};

export type LinkHandler = (href: string) => void;

// help:chapter#section -> /help/chapter#section; anything else is returned as is.
export const resolveHref = (href: string) => (href.startsWith("help:") ? `/help/${href.slice(5)}` : href);

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g;

function Inline({ text, onLink }: { text: string; onLink: LinkHandler }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("`")) return <Typography.Text key={i} code>{part.slice(1, -1)}</Typography.Text>;
        if (part.startsWith("**")) return <strong key={i}><Inline text={part.slice(2, -2)} onLink={onLink} /></strong>;
        if (part.startsWith("*")) return <em key={i}><Inline text={part.slice(1, -1)} onLink={onLink} /></em>;
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          const href = resolveHref(link[2]);
          const internal = href.startsWith("/");
          return (
            <a
              key={i}
              href={href}
              {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              onClick={(e) => {
                if (!internal || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onLink(link[2]);
              }}
            >
              {link[1]}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export const idFor = (sectionId: string) => `help-${sectionId}`;

export function Blocks({ blocks, onLink }: { blocks: Block[]; onLink: LinkHandler }): ReactNode {
  const { token } = useToken();
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <Typography.Title key={i} id={idFor(b.id)} level={b.level === 2 ? 3 : 5} style={{ marginTop: b.level === 2 ? 32 : 20, scrollMarginTop: 72 }}>
                {b.text}
              </Typography.Title>
            );
          case "paragraph":
            return <Typography.Paragraph key={i}><Inline text={b.text} onLink={onLink} /></Typography.Paragraph>;
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={i} style={{ paddingInlineStart: 24, marginBottom: 16 }}>
                {b.items.map((item, j) => (
                  <li key={j} style={{ marginBottom: 4 }}><Inline text={item} onLink={onLink} /></li>
                ))}
              </Tag>
            );
          }
          case "callout":
            return (
              <div key={i} style={{ borderLeft: `3px solid ${token.colorPrimary}`, background: token.colorFillQuaternary, padding: "8px 14px", margin: "0 0 16px", borderRadius: token.borderRadius }}>
                <Inline text={b.text} onLink={onLink} />
              </div>
            );
          case "table":
            return (
              <div key={i} style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} style={{ textAlign: "left", padding: "6px 10px", borderBottom: `2px solid ${token.colorBorder}`, whiteSpace: "nowrap" }}><Inline text={h} onLink={onLink} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} style={{ padding: "6px 10px", borderBottom: `1px solid ${token.colorBorderSecondary}`, verticalAlign: "top" }}><Inline text={cell} onLink={onLink} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
