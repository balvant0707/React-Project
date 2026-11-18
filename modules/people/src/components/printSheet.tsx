// Ported 1:1 from COMPASS (app/src/components/printSheet.tsx).
// Shared styles of the print views (job description, fit review, training attendance sheet): a grey page with an A4
// sheet on screen, the plain sheet on paper. Everything with class `no-print` stays on screen only. Each view adds its
// own rules after these.
export const PRINT_BASE_CSS = `
  .print-page { min-height: 100vh; background: #e9ecef; padding: 16px 16px 48px; }
  .print-toolbar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .print-sheet { max-width: 210mm; margin: 0 auto; background: #fff; color: #000; padding: 18mm; box-shadow: 0 1px 6px rgba(0,0,0,.2); }
  .print-sheet h1 { font-size: 22px; margin: 0 0 4px; color: #000; }
  .print-sheet tr, .print-sheet li, .print-sheet p { break-inside: avoid; }
  @media print {
    @page { size: A4; margin: 15mm; }
    html, body, .print-page { background: #fff !important; }
    .print-page { padding: 0; min-height: 0; }
    .no-print { display: none !important; }
    .print-sheet { box-shadow: none; padding: 0; max-width: none; }
  }
`;
