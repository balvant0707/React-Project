// Ported 1:1 from COMPASS (app/src/components/lookPickers.tsx).
import { Select } from "antd";
import { useTranslation } from "react-i18next";
import { ICONS, ICON_KEYS, iconFor } from "@rbp/ui";
import { COLOR_KEYS, usePalette } from "@rbp/ui";

// Pickers for the admin pages: an icon from the registry (lib/icons.tsx) and a colour key of the palette
// (lib/palette.ts). Empty = the default (default icon of the kind, gray). Used as antd form controls (value/onChange).

// `placeholderLabel` = what an empty value means (default: "Default", for assets "Inherited").
export const IconSelect = ({ value, onChange, fallback, placeholderLabel }: { value?: string | null; onChange?: (v: string | null) => void; fallback: string; placeholderLabel?: string }) => {
  const { t } = useTranslation();
  const Default = iconFor(null, fallback);
  return (
    <Select
      allowClear
      showSearch
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      placeholder={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Default size={18} stroke={2} aria-hidden />
          {placeholderLabel ?? t("looks.defaultIcon")}
        </span>
      }
      optionFilterProp="label"
      options={ICON_KEYS.map((key) => {
        const Glyph = ICONS[key];
        return {
          value: key,
          label: t(`looks.icons.${key}`),
          render: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Glyph size={18} stroke={2} aria-hidden />
              {t(`looks.icons.${key}`)}
            </span>
          ),
        };
      })}
      optionRender={(o) => o.data.render}
      labelRender={(o) => {
        const Glyph = ICONS[String(o.value)];
        return Glyph ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Glyph size={18} stroke={2} aria-hidden />
            {o.label}
          </span>
        ) : (
          o.label
        );
      }}
    />
  );
};

export const ColorSelect = ({ value, onChange }: { value?: string | null; onChange?: (v: string | null) => void }) => {
  const { t } = useTranslation();
  const { swatch } = usePalette();
  const chip = (key: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: swatch(key).dot, flex: "none" }} />
      {t(`looks.colors.${key}`)}
    </span>
  );
  return (
    <Select
      allowClear
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      placeholder={chip("gray")}
      options={COLOR_KEYS.map((key) => ({ value: key, label: chip(key) }))}
    />
  );
};
