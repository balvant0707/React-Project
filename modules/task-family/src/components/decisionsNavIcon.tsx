// Ported 1:1 from COMPASS (app/src/components/decisionsNavIcon.tsx).
import type { CSSProperties } from "react";
import { Badge } from "antd";
import { IconScale } from "@tabler/icons-react";
import { useDecisionCount } from "../hooks/useDecisions";

// Menu icon of "To decide" with the number of tasks waiting for my decision; the icon carries the badge for the same
// reasons as the Messages icon (components/messages/navIcon.tsx).
export const DecisionsNavIcon = ({ className, style }: { className?: string; style?: CSSProperties }) => {
  const { data } = useDecisionCount();
  return (
    <span className={className} style={{ display: "inline-flex", ...style }}>
      <Badge count={data ?? 0} size="small" overflowCount={99} offset={[6, -2]}>
        <IconScale size={18} stroke={1.8} />
      </Badge>
    </span>
  );
};
