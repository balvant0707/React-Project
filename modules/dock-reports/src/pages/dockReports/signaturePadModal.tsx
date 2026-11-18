// Ported 1:1 from the NPM tool (app/src/pages/dockReports/signaturePadModal.tsx).
import { useRef, useState } from "react";
import { Modal, Button, Space, Typography } from "antd";

type Point = { x: number; y: number };

// Logical canvas resolution (independent of on-screen CSS size, see the
// style width/height below) - high enough that a signature stays crisp when
// captured on a small phone-width canvas and later viewed larger.
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 400;

// A real drawing pad, not a file picker - built on the Pointer Events API
// (not separate mouse/touch handlers) so finger, stylus/pen, and mouse all
// drive the same code path on a tablet. Pen input's real pressure data
// widens the stroke; finger/mouse (which report a flat 0.5 or 1, not a
// meaningful reading) stay a fixed, finger-friendly width instead of
// jittering off noise that isn't actually pressure.
export const SignaturePadModal = ({
  open,
  title,
  onCancel,
  onSave,
}: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saving, setSaving] = useState(false);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // The canvas's CSS size (rect) and its internal pixel resolution
    // (CANVAS_WIDTH/HEIGHT) are deliberately different (see the style prop
    // below) - every coordinate has to be rescaled into canvas-pixel space,
    // not just the visible on-screen one.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPoint.current) return;
    const point = pointFromEvent(e);
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    ctx.lineWidth = 3 + pressure * 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    setHasStrokes(true);
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawing.current) e.currentTarget.releasePointerCapture(e.pointerId);
    drawing.current = false;
    lastPoint.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      await onSave(blob);
      clear();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      footer={null}
      width={680}
      // Unmounts the canvas on close (not just hides it) so reopening - for
      // this signer or a different one sharing the same modal instance -
      // always starts from a blank pad rather than the previous signer's
      // leftover strokes.
      destroyOnHidden
    >
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
        Sign with your finger or a stylus.
      </Typography.Text>
      <div style={{ border: "1px solid #d9d9d9", borderRadius: 6, background: "#fff", touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ width: "100%", height: 220, display: "block", cursor: "crosshair", touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
      <Space style={{ marginTop: 12, width: "100%", justifyContent: "space-between" }}>
        <Button onClick={clear} disabled={!hasStrokes || saving}>
          Clear
        </Button>
        <Space>
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="primary" onClick={save} loading={saving} disabled={!hasStrokes}>
            Save Signature
          </Button>
        </Space>
      </Space>
    </Modal>
  );
};
