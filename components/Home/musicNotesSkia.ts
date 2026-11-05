// Skia drawing for the volume bar notes and the escaped bubbles, the same
// strokes as web's canvas (bubbleLiftCanvas.ts) with anti-aliased clipping.
// Only required behind HAS_SKIA (see libs/skia.ts); every export is a worklet
// so it can draw on the UI thread.
import { Skia, createPicture, type SkCanvas, type SkPaint, type SkPath } from '@shopify/react-native-skia';
import { DOUBLE_HEAD, DOUBLE_STEM, NOTE_HEAD, NOTE_STEM, escapePose, floatingNote, knobCutoff, notePop, popShape, tubeNote } from './bubbleLift';

const STROKE = 1, ROUND = 1, INTERSECT = 1; // PaintStyle.Stroke, StrokeCap/StrokeJoin.Round, ClipOp.Intersect
const DEG = 180 / Math.PI;

interface Ink { fill: SkPaint; stroke: SkPaint; head: SkPath; stem: SkPath; doubleHead: SkPath; doubleStem: SkPath; }

function makeInk(colour: string): Ink {
  'worklet';
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(colour));
  const stroke = fill.copy();
  stroke.setStyle(STROKE);
  stroke.setStrokeCap(ROUND);
  stroke.setStrokeJoin(ROUND);
  stroke.setStrokeWidth(1.05);
  return { fill, stroke,
    head: Skia.Path.MakeFromSVGString(NOTE_HEAD)!, stem: Skia.Path.MakeFromSVGString(NOTE_STEM)!,
    doubleHead: Skia.Path.MakeFromSVGString(DOUBLE_HEAD)!, doubleStem: Skia.Path.MakeFromSVGString(DOUBLE_STEM)! };
}

function paintNote(canvas: SkCanvas, ink: Ink, x: number, y: number, size: number, rotation: number, opacity: number, double = false, bubble = false) {
  'worklet';
  canvas.save();
  canvas.translate(x, y); canvas.rotate(rotation * DEG, 0, 0); canvas.scale(size, size); canvas.translate(-3, 0);
  if (bubble) {
    ink.stroke.setAlphaf(opacity * .22); ink.stroke.setStrokeWidth(.6);
    canvas.drawCircle(3, 0, 6, ink.stroke);
    ink.stroke.setStrokeWidth(1.05);
  }
  ink.fill.setAlphaf(opacity); ink.stroke.setAlphaf(opacity);
  canvas.drawPath(ink.head, ink.fill);
  canvas.drawPath(double ? ink.doubleStem : ink.stem, ink.stroke);
  if (double) canvas.drawPath(ink.doubleHead, ink.fill);
  canvas.restore();
}

function paintPop(canvas: SkCanvas, ink: Ink, x: number, y: number, size: number, rotation: number, opacity: number, pop: number, seed: number) {
  'worklet';
  const s = popShape(pop, seed);
  canvas.save();
  canvas.translate(x, y); canvas.rotate(rotation * DEG, 0, 0); canvas.scale(size, size); canvas.translate(-3, 0);
  ink.stroke.setAlphaf(opacity * s.ringAlpha); ink.stroke.setStrokeWidth(s.ringWidth);
  canvas.drawCircle(3, 0, s.ring, ink.stroke);
  ink.fill.setAlphaf(opacity * s.dropAlpha);
  for (const d of s.drops) canvas.drawCircle(d.x, d.y, d.r, ink.fill);
  canvas.translate(3, 0); canvas.scale(s.glyphScale, s.glyphScale); canvas.translate(-3, 0);
  ink.fill.setAlphaf(opacity * s.glyphAlpha); ink.stroke.setAlphaf(opacity * s.glyphAlpha); ink.stroke.setStrokeWidth(1.05);
  canvas.drawPath(ink.head, ink.fill);
  canvas.drawPath(ink.stem, ink.stroke);
  canvas.restore();
}

export interface VolumeFrame {
  clock: number; fade: number; level: number;
  width: number; layoutHeight: number; trackHeight: number; inset: number; radius: number;
  ink: string; showTraveller: boolean;
}

/** The volume bar overlay: notes inside the fill, the traveller and the beat echo. Canvas is (width + 36) x (layoutHeight + 64). */
export function volumePicture(f: VolumeFrame) {
  'worklet';
  const W = f.width + 36, H = f.layoutHeight + 64;
  return createPicture(canvas => {
    if (f.fade <= .01 || f.width <= 0) return;
    const value = Math.max(0, Math.min(1, f.level)), span = Math.max(0, f.width - f.inset * 2);
    const h = f.trackHeight, cy = f.layoutHeight / 2 + 32, thumb = f.inset + value * span;
    const ink = makeInk(f.ink);
    canvas.save();
    canvas.translate(0, cy);
    canvas.save();
    canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(f.inset, -h / 2, span, h), h / 2, h / 2), INTERSECT, true);
    canvas.clipPath(Skia.Path.MakeFromSVGString(knobCutoff(thumb, f.radius, h / 2))!, INTERSECT, true);
    const count = Math.min(64, Math.ceil(f.width / 9));
    for (let i = 0; i < count; i++) {
      const n = tubeNote(i, f.clock, f.width, h);
      paintNote(canvas, ink, n.x, n.y, n.size, n.rotation, n.opacity * f.fade, i % 4 === 0);
    }
    canvas.restore();
    // The rare traveller that slips past the knob before it escapes.
    const p = escapePose(f.clock, thumb, f.radius, h);
    if (f.showTraveller && !p.ready) {
      canvas.save();
      canvas.clipRect(Skia.XYWHRect(f.inset, -h / 2, f.width + 36, h), INTERSECT, true);
      const tail = p.x > thumb + f.radius ? makeInk('#dae9ef') : ink;
      paintNote(canvas, tail, p.x, p.y, .48 * h / 8, -.18, p.opacity * f.fade * .9);
      canvas.restore();
    }
    canvas.restore();
    // Beat echo: two thin arcs breathing off the knob at 112 BPM.
    const echo = Skia.Paint();
    echo.setAntiAlias(true); echo.setStyle(STROKE); echo.setStrokeCap(ROUND); echo.setColor(Skia.Color('#f0f8fa'));
    const beats = f.clock * 112 / 60;
    for (let j = 0; j < 2; j++) {
      const age = (((beats + j) / 2) % 1) * 2 / 1.15;
      if (age >= 1) continue;
      const r = f.radius + 2 + age * 12;
      echo.setAlphaf(.55 * f.fade * (.55 + .45 * value) * Math.pow(1 - age, 1.6));
      echo.setStrokeWidth(1.3 * (1 - age * .5));
      canvas.drawArc(Skia.XYWHRect(thumb - r, cy - r, r * 2, r * 2), -.62 * DEG, 1.24 * DEG, false, echo);
    }
  }, { width: W, height: H });
}

export interface FloatingBubble { id: number; x: number; y: number; seed: number; born: number; }

/** Every escaped bubble, floating then popping, over the whole window. */
export function bubblesPicture(notes: readonly FloatingBubble[], clock: number, width: number, height: number, colour: string) {
  'worklet';
  return createPicture(canvas => {
    if (!notes.length) return;
    const ink = makeInk(colour);
    for (const note of notes) {
      const age = clock - note.born, pop = notePop(age);
      if (pop >= 1) continue;
      const p = floatingNote(age, note.seed, note.x, note.y, width, height);
      if (pop > 0) paintPop(canvas, ink, p.x, p.y, p.size, p.rotation, p.opacity, pop, note.seed);
      else paintNote(canvas, ink, p.x, p.y, p.size, p.rotation, p.opacity, false, true);
    }
  }, { width, height });
}
