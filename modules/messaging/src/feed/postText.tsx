import { useMemo } from "react";
import { useTeams, useUserMap } from "@rbp/core";
import { sanitizeHtml, toHtml } from "../richText";
import { MENTION_TOKEN, userDisplayName } from "./mentions";
import { recordCardType } from "./cards";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A card is a paragraph of its own: <p>[[<kind>:<uuid>]]</p> (what the post editor writes).
const CARD_PARAGRAPH = /<p>\s*\[\[([a-z_]+):([0-9a-fA-F-]{36})\]\]\s*<\/p>/g;

// The text of a post: sanitized HTML, mentions in red and bold, task cards where the editor put them. The names are put
// in after the sanitizing and escaped, so a name cannot bring markup along.
export const PostText = ({ body }: { body: string | null | undefined }) => {
  const users = useUserMap();
  const { data: groups } = useTeams();
  const pieces = useMemo(() => (body ?? "").split(new RegExp(CARD_PARAGRAPH.source, "g")), [body]);
  const render = (html: string) => {
    const clean = sanitizeHtml(toHtml(html)).replace(MENTION_TOKEN, (_, kind: string, id: string) => {
      const user = kind === "user" ? users.get(id) : undefined;
      const name = kind === "team" ? groups?.find((g) => g.id === id)?.name : user ? userDisplayName(user) : undefined;
      return `<span class="mention">@${escapeHtml(name ?? "?")}</span>`;
    });
    return clean ? <div className="rich-text" dangerouslySetInnerHTML={{ __html: clean }} /> : null;
  };
  return (
    <>
      {pieces.map((piece, i) => {
        if (i % 3 === 0) return <div key={i}>{render(piece)}</div>;
        if (i % 3 === 2) return null;
        const Card = recordCardType(piece)?.Card;
        return Card ? <Card key={i} id={pieces[i + 1]} /> : null;
      })}
    </>
  );
};
