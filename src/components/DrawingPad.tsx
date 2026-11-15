import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Pencil, RotateCcw, Trash2 } from "lucide-react";

export interface DrawingPadHandle {
  /** PNG of the drawing, or null if nothing has been drawn. */
  toBlob: () => Promise<Blob | null>;
  isEmpty: () => boolean;
}

type Point = { x: number; y: number };
type Stroke = { color: string; size: number; erase: boolean; points: Point[] };

const COLOURS = [
  { name: "Leaf", hex: "#0C1020" },
  { name: "Raspberry", hex: "#EA572C" },
  { name: "Mustard", hex: "#DBDE49" },
  { name: "Tomato", hex: "#EA572C" },
  { name: "Ink", hex: "#1F1B18" },
];
const PAPER = "#FFFAF3";
const LOGICAL_W = 800; // strokes are stored in a fixed 800×600 space, so they scale with the screen
const LOGICAL_H = 600;

/**
 * A small, touch-first drawing pad: pen, eraser, five colours, two sizes, undo, clear.
 * With `background` (an image URL), you draw on top of it — the eraser only
 * removes your own lines, never the picture underneath.
 */
export const DrawingPad = forwardRef<DrawingPadHandle, { onChange?: () => void; background?: string | null }>(function DrawingPad({ onChange, background }, ref) {
  const bgImage = useRef<HTMLImageElement | null>(null);
  const layer = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLOURS[0].hex);
  const [size, setSize] = useState(6);
  const [erase, setErase] = useState(false);
  const [count, setCount] = useState(0); // re-render after undo/clear

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const sx = canvas.width / LOGICAL_W;
    const sy = canvas.height / LOGICAL_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (bgImage.current?.complete) ctx.drawImage(bgImage.current, 0, 0, canvas.width, canvas.height);
    // your lines live on their own layer, so erasing never touches the picture underneath
    if (!layer.current) layer.current = document.createElement("canvas");
    const lc = layer.current;
    if (lc.width !== canvas.width || lc.height !== canvas.height) { lc.width = canvas.width; lc.height = canvas.height; }
    const l = lc.getContext("2d")!;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, lc.width, lc.height);
    l.setTransform(sx, 0, 0, sy, 0, 0);
    l.lineCap = "round";
    l.lineJoin = "round";
    for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      l.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      l.strokeStyle = s.color;
      l.lineWidth = s.erase ? s.size * 3 : s.size;
      l.beginPath();
      s.points.forEach((p, i) => (i === 0 ? l.moveTo(p.x, p.y) : l.lineTo(p.x, p.y)));
      if (s.points.length === 1) l.lineTo(s.points[0].x + 0.1, s.points[0].y);
      l.stroke();
    }
    l.globalCompositeOperation = "source-over";
    ctx.drawImage(lc, 0, 0);
  }, []);

  useEffect(() => {
    if (!background) { bgImage.current = null; redraw(); return; }
    const img = new Image();
    img.onload = () => { bgImage.current = img; redraw(); };
    img.src = background;
  }, [background, redraw]);

  // Size the backing store to the element × device pixel ratio for crisp lines.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  const toLogical = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * LOGICAL_W, y: ((e.clientY - r.top) / r.height) * LOGICAL_H };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { color, size, erase, points: [toLogical(e)] };
    redraw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    current.current.points.push(toLogical(e));
    redraw();
  };
  const up = () => {
    if (!current.current) return;
    strokes.current.push(current.current);
    current.current = null;
    setCount(strokes.current.length);
    onChange?.();
  };

  useImperativeHandle(ref, () => ({
    isEmpty: () => strokes.current.filter((s) => !s.erase).length === 0,
    toBlob: async () => {
      if (strokes.current.filter((s) => !s.erase).length === 0) return null;
      // Export at a fixed 1200×900 regardless of screen size.
      const out = document.createElement("canvas");
      out.width = 1200; out.height = 900;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(canvasRef.current!, 0, 0, out.width, out.height);
      return new Promise((resolve) => out.toBlob(resolve, "image/png"));
    },
  }));

  const tool = (active: boolean) =>
    `grid h-10 w-10 place-items-center rounded-full border-2 transition ${active ? "border-leaf bg-mustard text-leaf" : "border-leaf/20 text-muted hover:border-leaf/50"}`;

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="aspect-[4/3] w-full touch-none rounded-2xl border-2 border-dashed border-leaf/30 bg-paper"
        role="img"
        aria-label="Drawing area"
      />
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Drawing tools">
        <button type="button" className={tool(!erase)} onClick={() => setErase(false)} aria-label="Pen" aria-pressed={!erase}><Pencil size={17} /></button>
        <button type="button" className={tool(erase)} onClick={() => setErase(true)} aria-label="Eraser" aria-pressed={erase}><Eraser size={17} /></button>
        <span className="mx-1 h-6 w-px bg-leaf/20" aria-hidden="true" />
        {COLOURS.map((c) => (
          <button
            key={c.hex} type="button" onClick={() => { setColor(c.hex); setErase(false); }}
            aria-label={c.name} aria-pressed={color === c.hex && !erase}
            className={`h-8 w-8 rounded-full border-2 ${color === c.hex && !erase ? "border-leaf ring-2 ring-mustard ring-offset-2 ring-offset-paper" : "border-white"}`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-leaf/20" aria-hidden="true" />
        <button type="button" className={tool(size === 6)} onClick={() => setSize(6)} aria-label="Thin line" aria-pressed={size === 6}><span className="h-1.5 w-1.5 rounded-full bg-current" /></button>
        <button type="button" className={tool(size === 14)} onClick={() => setSize(14)} aria-label="Thick line" aria-pressed={size === 14}><span className="h-3 w-3 rounded-full bg-current" /></button>
        <span className="flex-1" />
        <button type="button" className={tool(false)} disabled={count === 0} onClick={() => { strokes.current.pop(); setCount(strokes.current.length); redraw(); onChange?.(); }} aria-label="Undo"><RotateCcw size={17} /></button>
        <button type="button" className={tool(false)} disabled={count === 0} onClick={() => { strokes.current = []; setCount(0); redraw(); onChange?.(); }} aria-label="Clear"><Trash2 size={17} /></button>
      </div>
    </div>
  );
});
