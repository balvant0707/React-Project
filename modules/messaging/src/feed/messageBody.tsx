import { useTeams, useUserMap } from "@rbp/core";
import { splitBody, userDisplayName } from "./mentions";
import { recordCardType, splitCards } from "./cards";

// The text of a message with its mentions in red and bold and its record cards.
export const MessageBody = ({ body }: { body: string }) => {
  // The cards stand between the pieces of text; the line breaks around a card are not shown twice.
  const pieces = splitCards(body);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < pieces.length; i += 3) {
    const piece = pieces[i];
    if (piece.trim() || i === 0) nodes.push(<MessageText key={i} body={i === 0 ? piece.replace(/\n+$/, "") : piece.replace(/^\n+|\n+$/g, "")} />);
    const Card = i + 2 < pieces.length ? recordCardType(pieces[i + 1])?.Card : undefined;
    if (Card) nodes.push(<Card key={`${i}c`} id={pieces[i + 2]} />);
  }
  return <>{nodes}</>;
};

const MessageText = ({ body }: { body: string }) => {
  const users = useUserMap();
  const { data: groups } = useTeams();
  return (
    <>
      {splitBody(body).map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
        const name = part.kind === "team" ? groups?.find((g) => g.id === part.userId)?.name : (() => { const user = users.get(part.userId); return user ? userDisplayName(user) : undefined; })();
        return (
          <span key={i} className="mention">
            @{name ?? "?"}
          </span>
        );
      })}
    </>
  );
};

// The same for a hook-free context: group names for toDisplayBody.
export const useGroupName = () => {
  const { data: groups } = useTeams();
  return (id: string) => groups?.find((g) => g.id === id)?.name;
};
