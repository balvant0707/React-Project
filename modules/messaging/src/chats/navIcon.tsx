import type { CSSProperties } from "react";
import { Badge } from "antd";
import { IconMessageCircle } from "@tabler/icons-react";
import { useInboxUnread } from "../hooks/useMessages";

// "Messages" menu icon with the unread count (Refine labels cannot be elements; a collapsed menu shows only the icon).
// The menu's className must reach the outer element.
export const MessagesNavIcon = ({ className, style }: { className?: string; style?: CSSProperties }) => {
  const total = useInboxUnread();
  return (
    <span className={className} style={{ display: "inline-flex", ...style }}>
      <Badge count={total} size="small" overflowCount={99} offset={[6, -2]}>
        <IconMessageCircle size={18} stroke={1.8} />
      </Badge>
    </span>
  );
};
