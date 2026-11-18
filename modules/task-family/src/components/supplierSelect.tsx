// Ported 1:1 from COMPASS (app/src/components/supplierSelect.tsx).
import { useState } from "react";
import { App as AntdApp, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { useSuppliers } from "../hooks/useItems";
import { errorText } from "@rbp/core";

// Picks a supplier; a typed name that does not exist yet can be added on the spot (whoever may enter costs or keep the
// catalogue may add suppliers, RLS decides). Inactive suppliers are offered only when already selected.
export const SupplierSelect = ({ value, onChange, canCreate = true, style }: { value?: string | null; onChange?: (id: string | null) => void; canCreate?: boolean; style?: React.CSSProperties }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: suppliers } = useSuppliers();
  const [term, setTerm] = useState("");
  const typed = term.trim();
  const exists = (suppliers ?? []).some((s) => s.name.toLowerCase() === typed.toLowerCase());

  const create = async () => {
    const { data, error } = await supabaseClient.from("suppliers").insert({ name: typed }).select("id").single();
    if (error) return message.error(errorText(error));
    await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    setTerm("");
    onChange?.(data.id);
  };

  return (
    <Select
      allowClear
      showSearch
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      onSearch={setTerm}
      searchValue={term}
      optionFilterProp="label"
      placeholder={t("items.supplierPlaceholder")}
      style={style}
      options={(suppliers ?? []).filter((s) => s.is_active || s.id === value).map((s) => ({ value: s.id, label: s.name }))}
      notFoundContent={null}
      popupRender={(menu) => (
        <>
          {menu}
          {canCreate && typed && !exists && (
            <div style={{ padding: "6px 12px", cursor: "pointer" }} onMouseDown={(e) => e.preventDefault()} onClick={() => void create()}>
              <PlusOutlined /> {t("items.addSupplierNamed", { name: typed })}
            </div>
          )}
        </>
      )}
    />
  );
};
