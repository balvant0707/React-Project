// From COMPASS (app/src/components/documentType.tsx), until 2026-11-12 a copy in assets. Changed: the phrase category is a
// prop (default COMPASS's 'document_type'), so NPM's file types per record type (hull events: 'attachement_type_hullevent')
// use the same tag and select; the phrase hooks are the core's.
import { Select, Tag } from "antd";
import { usePhraseText, usePhrases, type Phrase } from "@rbp/core";

// Document types of attachments: an admin-managed phrase list (Settings > Configuration > Phrases, English and German
// text). attachments.category_phrase_id points at a phrase.
export const DOCUMENT_TYPE_CATEGORY = "document_type";

const PALETTE = ["blue", "geekblue", "green", "orange", "purple", "cyan", "magenta", "gold", "lime", "volcano"];

export const useDocumentTypes = (category = DOCUMENT_TYPE_CATEGORY) => usePhrases(category);
export const useDocTypeLabel = usePhraseText;

const colorOf = (p: Phrase) => {
  if (p.code === "safety_data_sheet") return "red";
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export const DocTypeTag = ({ value, category }: { value: string; category?: string }) => {
  const { data: types } = useDocumentTypes(category);
  const label = useDocTypeLabel();
  const phrase = types?.find((p) => p.id === value);
  if (!phrase) return null;
  return <Tag color={colorOf(phrase)} style={{ marginInlineEnd: 0 }}>{label(phrase)}</Tag>;
};

export const DocumentTypeSelect = ({
  value,
  onChange,
  placeholder,
  style,
  variant,
  category,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: React.ReactNode;
  style?: React.CSSProperties;
  variant?: "borderless" | "outlined";
  category?: string;
}) => {
  const { data: types } = useDocumentTypes(category);
  const label = useDocTypeLabel();
  return (
    <Select
      size="small"
      allowClear
      showSearch
      variant={variant}
      value={value ?? undefined}
      placeholder={placeholder}
      options={(types ?? []).map((p) => ({ value: p.id, label: label(p) }))}
      optionFilterProp="label"
      labelRender={({ value: v }) => <DocTypeTag value={String(v)} category={category} />}
      onChange={(v) => onChange(v ?? null)}
      style={style}
    />
  );
};
