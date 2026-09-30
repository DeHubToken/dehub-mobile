/**
 * The slice of the canvas 2D API that `visualizer-extra` paints with, on top
 * of a Skia canvas. It exists so the extra audio styles are written once and
 * shared word for word with web, where the same painters get a real
 * `CanvasRenderingContext2D`.
 *
 * Only what the painters use is here. Paths are drawn with the transform in
 * force when they are filled or stroked, the same as the browser does for
 * every path the painters build (none of them changes the transform halfway
 * through a path).
 *
 * @module components/Home/skia-ctx2d
 */

import {
  BlendMode,
  ClipOp,
  PaintStyle,
  Skia,
  StrokeCap,
  TileMode,
  type SkCanvas,
  type SkPaint,
  type SkPath,
  type SkShader,
} from "@shopify/react-native-skia";
import type { Ctx2D, Grad } from "./visualizer-extra";

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

/* ─── Colour strings ───────────────────────────────────────────────────── */

const colourCache = new Map<string, number[]>();

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** rgba()/rgb()/hsla()/hsl()/#hex → [r, g, b, a], each 0–1. */
export function parseColour(css: string): number[] {
  const hit = colourCache.get(css);
  if (hit) return hit;
  let out = [0, 0, 0, 1];
  const m = css.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (m) {
    const p = m[2].split(",").map((x) => parseFloat(x));
    const a = p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1;
    if (m[1].startsWith("rgb")) out = [p[0] / 255, p[1] / 255, p[2] / 255, a];
    else out = [...hslToRgb(p[0], p[1] / 100, p[2] / 100), a];
  } else if (css[0] === "#") {
    const n = parseInt(css.length === 4 ? css.slice(1).split("").map((c) => c + c).join("") : css.slice(1, 7), 16);
    out = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  out = out.map((v) => Math.max(0, Math.min(1, v)));
  if (colourCache.size > 4000) colourCache.clear();
  colourCache.set(css, out);
  return out;
}

const skColour = (css: string, alpha = 1) => {
  const c = parseColour(css);
  return Float32Array.of(c[0], c[1], c[2], c[3] * alpha);
};

/* ─── Gradients ────────────────────────────────────────────────────────── */

class SkGrad implements Grad {
  private stops: [number, string][] = [];
  constructor(private make: (colours: Float32Array[], pos: number[]) => SkShader) {}
  addColorStop(offset: number, color: string) {
    this.stops.push([offset, color]);
  }
  shader(): SkShader {
    const s = this.stops.length ? this.stops : ([[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0)"]] as [number, string][]);
    return this.make(
      s.map(([, c]) => skColour(c)),
      s.map(([o]) => o),
    );
  }
}

/* ─── Context ──────────────────────────────────────────────────────────── */

interface DrawState {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  globalAlpha: number;
  globalCompositeOperation: string;
}

export class SkiaCtx2D implements Ctx2D {
  private path: SkPath = Skia.Path.Make();
  private open = false;
  private st: DrawState = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  private stack: DrawState[] = [];
  private paint: SkPaint = Skia.Paint();

  constructor(private canvas: SkCanvas) {}

  get fillStyle() { return this.st.fillStyle; }
  set fillStyle(v: unknown) { this.st.fillStyle = v; }
  get strokeStyle() { return this.st.strokeStyle; }
  set strokeStyle(v: unknown) { this.st.strokeStyle = v; }
  get lineWidth() { return this.st.lineWidth; }
  set lineWidth(v: number) { this.st.lineWidth = v; }
  get lineCap() { return this.st.lineCap; }
  set lineCap(v: string) { this.st.lineCap = v; }
  get globalAlpha() { return this.st.globalAlpha; }
  set globalAlpha(v: number) { this.st.globalAlpha = v; }
  get globalCompositeOperation() { return this.st.globalCompositeOperation; }
  set globalCompositeOperation(v: string) { this.st.globalCompositeOperation = v; }

  save() {
    this.stack.push({ ...this.st });
    this.canvas.save();
  }
  restore() {
    const s = this.stack.pop();
    if (s) this.st = s;
    this.canvas.restore();
  }
  translate(x: number, y: number) { this.canvas.translate(x, y); }
  rotate(a: number) { this.canvas.rotate(a * DEG, 0, 0); }
  scale(x: number, y: number) { this.canvas.scale(x, y); }

  beginPath() {
    this.path = Skia.Path.Make();
    this.open = false;
  }
  moveTo(x: number, y: number) {
    this.path.moveTo(x, y);
    this.open = true;
  }
  lineTo(x: number, y: number) {
    if (this.open) this.path.lineTo(x, y);
    else this.moveTo(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    if (!this.open) this.moveTo(cx, cy);
    this.path.quadTo(cx, cy, x, y);
  }
  closePath() {
    this.path.close();
  }
  rect(x: number, y: number, w: number, h: number) {
    this.path.addRect(Skia.XYWHRect(x, y, w, h));
    this.path.moveTo(x, y);
    this.open = true;
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    let sweep: number;
    if (!ccw) sweep = a1 - a0 >= TAU ? TAU : (((a1 - a0) % TAU) + TAU) % TAU;
    else sweep = a0 - a1 >= TAU ? -TAU : -((((a0 - a1) % TAU) + TAU) % TAU);
    const oval = Skia.XYWHRect(x - r, y - r, r * 2, r * 2);
    // Skia treats a whole-turn sweep as empty, so go round in two halves.
    if (Math.abs(sweep) >= TAU - 1e-6) {
      const half = (sweep / 2) * DEG;
      this.path.arcToOval(oval, a0 * DEG, half, !this.open);
      this.path.arcToOval(oval, a0 * DEG + half, half, false);
    } else {
      this.path.arcToOval(oval, a0 * DEG, sweep * DEG, !this.open);
    }
    this.open = true;
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number) {
    // Painters only ever draw whole ellipses.
    if (!rot) {
      this.path.addOval(Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2));
    } else {
      const c = Math.cos(rot), s = Math.sin(rot), n = 24;
      for (let i = 0; i <= n; i++) {
        const t = a0 + ((a1 - a0) * i) / n, ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
        const px = x + ex * c - ey * s, py = y + ex * s + ey * c;
        if (i === 0) this.path.moveTo(px, py);
        else this.path.lineTo(px, py);
      }
      this.path.close();
    }
    this.open = true;
  }

  private setup(style: unknown, stroke: boolean): SkPaint {
    const p = this.paint;
    p.setAntiAlias(true);
    p.setShader(null);
    p.setAlphaf(1);
    if (style instanceof SkGrad) {
      p.setColor(Float32Array.of(0, 0, 0, 1));
      p.setShader(style.shader());
      p.setAlphaf(this.st.globalAlpha);
    } else {
      p.setColor(skColour(typeof style === "string" ? style : "#000", this.st.globalAlpha));
    }
    p.setBlendMode(this.st.globalCompositeOperation === "destination-out" ? BlendMode.DstOut : BlendMode.SrcOver);
    p.setStyle(stroke ? PaintStyle.Stroke : PaintStyle.Fill);
    if (stroke) {
      p.setStrokeWidth(this.st.lineWidth);
      p.setStrokeCap(this.st.lineCap === "round" ? StrokeCap.Round : this.st.lineCap === "square" ? StrokeCap.Square : StrokeCap.Butt);
    }
    return p;
  }

  fill() {
    this.canvas.drawPath(this.path, this.setup(this.st.fillStyle, false));
  }
  stroke() {
    this.canvas.drawPath(this.path, this.setup(this.st.strokeStyle, true));
  }
  clip() {
    this.canvas.clipPath(this.path, ClipOp.Intersect, true);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), this.setup(this.st.fillStyle, false));
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), this.setup(this.st.strokeStyle, true));
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad {
    return new SkGrad((c, p) => Skia.Shader.MakeLinearGradient({ x: x0, y: y0 }, { x: x1, y: y1 }, c, p, TileMode.Clamp));
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Grad {
    return new SkGrad((c, p) =>
      Skia.Shader.MakeTwoPointConicalGradient({ x: x0, y: y0 }, r0, { x: x1, y: y1 }, r1, c, p, TileMode.Clamp),
    );
  }
}
