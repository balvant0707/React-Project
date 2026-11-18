// Ported 1:1 from COMPASS (app/src/components/goalSelect.tsx).
import { Select } from "antd";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { fetchGoals } from "../lib/goals";

// Picker for goals the caller may open. `exclude` removes goals (a goal and its own sub-goals cannot be its parent).
export const GoalSelect = ({
  value,
  onChange,
  exclude,
  placeholder,
  disabled,
  style,
}: {
  value?: string | null;
  onChange?: (v: string | null) => void;
  exclude?: Set<string>;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) => {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals, staleTime: 30_000 });
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder={placeholder ?? t("goals.title")}
      disabled={disabled}
      style={style ?? { width: "100%" }}
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      options={(data ?? []).filter((g) => !exclude?.has(g.id)).map((g) => ({ value: g.id, label: `#${g.goal_number} ${g.title}` }))}
    />
  );
};
