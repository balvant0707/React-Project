// Ported 1:1 from the NPM tool (app/src/components/surfacePrepPicker.tsx).
import { useState } from "react";
import { Input, Button, Modal, Checkbox } from "antd";
import type { PhraseOption as Option } from "@rbp/core";

// Surface preparation: a free-text field plus a "Pick from phrases" composer, not a strict phrase_id select - an actual
// prep note is often a mix of a canned phrase and something specific to what was found, so the underlying column stays
// plain text. `disabled` greys the field out (specification form); `readOnly` keeps it readable (dock report).
export const SurfacePrepPicker = ({
  value,
  onChange,
  options,
  disabled,
  readOnly,
}: {
  value: string | null;
  onChange: (text: string) => void;
  options: Option[];
  disabled?: boolean;
  readOnly?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);

  // Pre-check whichever phrases are already present in the composed text
  // (one phrase per line, verbatim - see the join below) instead of always
  // opening empty, so re-opening the picker on an existing value shows what
  // was actually selected before.
  const openPicker = () => {
    const currentLines = (value ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    setChecked(options.filter((o) => currentLines.includes(o.label)).map((o) => o.value));
    setOpen(true);
  };

  return (
    <>
      <Input.TextArea value={value ?? ""} rows={2} onChange={(e) => onChange(e.target.value)} disabled={disabled} readOnly={readOnly} />
      {!disabled && !readOnly && (
        <Button size="small" type="link" style={{ padding: 0 }} onClick={openPicker}>
          Pick from phrases
        </Button>
      )}
      <Modal
        title="Compose surface preparation"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => {
          const selectedTexts = options.filter((o) => checked.includes(o.value)).map((o) => o.label);
          // One phrase per line, not ". "-joined - a phrase can itself contain
          // a period (e.g. "min. Sa 2...") which a ". " join makes
          // indistinguishable from a real phrase boundary once a PDF export
          // re-splits this into bullets.
          onChange(selectedTexts.join("\n"));
          setOpen(false);
        }}
      >
        <Checkbox.Group value={checked} onChange={(v) => setChecked(v as string[])} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((o) => (
            <Checkbox key={o.value} value={o.value}>
              {o.label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Modal>
    </>
  );
};
