// Platform: COMPASS's "Operating instructions" card of the settings page (app/src/pages/admin/settings/index.tsx) as an editor of
// the core settings page (slot admin.settings.editors). The key/value row holds the JSON list of language codes.
import { Select } from "antd";

// German first (the master language of operating instructions), two-letter codes only (COMPASS instructionLanguages).
const instructionLanguages = (codes: string[] | undefined) =>
  ["de", ...new Set((codes ?? []).map((c) => c.trim().toLowerCase()).filter((c) => /^[a-z]{2}$/.test(c) && c !== "de"))];

const parse = (value: string): string[] => {
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const LanguagesSetting = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <Select mode="tags" style={{ width: 240 }} tokenSeparators={[",", " "]} value={parse(value)}
    onChange={(codes: string[]) => onChange(JSON.stringify(instructionLanguages(codes)))}
    options={["de", "en", "pl", "tr", "ru", "uk", "ro", "ar"].map((l) => ({ value: l, label: l }))} />
);
