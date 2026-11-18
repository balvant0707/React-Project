// Ported 1:1 from COMPASS (app/src/lib/safetySigns.tsx).
// Pictograms of operating instructions (~/maintenance_tool/docs/operating-instructions.md "Pictograms"). Only the code is stored, so a sign
// looks the same in every language and in the Excel file. The graphics are the public-domain (or CC0) SVG files of
// Wikimedia Commons in app/public/signs/<code>.svg: GHS pictograms (UNECE), ISO 7010 signs, and two DIN 4844-2 signs (explosive
// atmosphere, no unauthorised entry). The source and licence of every file are listed in ~/maintenance_tool/docs/operating-instructions.md. The names
// live in the locale files under safetySigns.codes.<code>.

export type SignGroup = "ghs" | "warning" | "mandatory" | "prohibition" | "emergency" | "fire";

type Sign = { code: string; group: SignGroup };

export const SIGN_GROUPS: SignGroup[] = ["ghs", "warning", "mandatory", "prohibition", "emergency", "fire"];

const group = (g: SignGroup, codes: string[]): Sign[] => codes.map((code) => ({ code, group: g }));

export const SIGNS: Sign[] = [
  ...group("ghs", ["GHS01", "GHS02", "GHS03", "GHS04", "GHS05", "GHS06", "GHS07", "GHS08", "GHS09"]),
  ...group("warning", ["W001", "W002", "W003", "W006", "W008", "W009", "W010", "W011", "W012", "W014", "W015", "W016", "W017", "W018", "W019", "W021", "W022", "W023", "W024", "W025", "W026", "W028", "W029", "D-W021"]),
  ...group("mandatory", ["M001", "M003", "M004", "M008", "M009", "M010", "M011", "M013", "M014", "M015", "M016", "M017", "M018", "M021"]),
  ...group("prohibition", ["P001", "P002", "P003", "P004", "P006", "P010", "P011", "P013", "P015", "P022", "D-P006"]),
  ...group("emergency", ["E001", "E003", "E004", "E009", "E011", "E012"]),
  ...group("fire", ["F001", "F002", "F005"]),
];

const CODES = new Set(SIGNS.map((s) => s.code));

// Platform: the sign files ship with this module (modules/people/public/signs, copied by the port) and are bundled by Vite.
const SIGN_URLS = Object.fromEntries(
  Object.entries(import.meta.glob("../../public/signs/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>).map(([path, url]) => [path.split("/").pop()!.replace(/\.svg$/, ""), url]),
);

export const SafetySign = ({ code, size = 48, title }: { code: string; size?: number; title?: string }) => {
  if (!CODES.has(code)) return null;
  return (
    <img
      src={SIGN_URLS[code]}
      width={size}
      height={size}
      alt={title ?? code}
      title={title}
      draggable={false}
      style={{ flex: "none", display: "block", objectFit: "contain" }}
    />
  );
};
