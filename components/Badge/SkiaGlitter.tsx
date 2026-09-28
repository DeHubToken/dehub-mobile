/**
 * SkiaGlitter — the promotion's light and glitter, drawn with Skia.
 *
 * The same drawing as the web ceremony's canvas (dehubweb
 * `src/components/app/badge-showcase/ascension.ts`), beat for beat: the old
 * badge shatters into wedges cut from its own artwork, glitter bursts out and
 * spirals home at the web's full count, motes streak in with trails, and
 * every light is added rather than layered, so glows brighten the badge the
 * way they do on the web. One picture is recorded per frame on the UI thread
 * off the ceremony's clock.
 *
 * Only loaded through `libs/skia` — builds without Skia keep the view-drawn
 * particles in `Ascension`. The badges themselves stay views either way, so
 * the hand-off to the sticker is identical.
 */
import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  BlendMode,
  Canvas,
  ClipOp,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  TileMode,
  useImage,
  type SkCanvas,
  type SkImage,
} from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import type { BadgeMotion } from "../../libs/badgeMotion";
import type { AscensionCenter, AscensionTimeline } from "./Ascension";

interface Props {
  clock: SharedValue<number>;
  tl: AscensionTimeline;
  c: AscensionCenter;
  W: number;
  H: number;
  restTilt: number;
  motion: BadgeMotion;
  /** The outgoing badge's artwork, cut into the shatter wedges. */
  fromSource: number | null;
}

const TAU = Math.PI * 2;

// The web's own counts. badgeMotion's shardGrid and motes are sized for the
// view fallback, which cannot afford these.
const wedgesFor = (i: number) => 10 + Math.round(i * 12);
const motesFor = (i: number) => Math.round((60 + i * 190) * 0.6);

function clamp01(x: number) {
  "worklet";
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function outCubic(x: number) {
  "worklet";
  return 1 - Math.pow(1 - x, 3);
}
function inOutCubic(x: number) {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function lerp(a: number, b: number, t: number) {
  "worklet";
  return a + (b - a) * t;
}

/** The sticker burst's tint: a cosine rainbow washed toward white. */
function holo(hue: number, wash: number, alpha: number) {
  "worklet";
  const ch = (o: number) => Math.round(255 * lerp(1, 0.5 + 0.5 * Math.cos(TAU * (hue + o)), wash));
  return Skia.Color(`rgba(${ch(0)},${ch(0.33)},${ch(0.67)},${alpha})`);
}

export default function SkiaGlitter({ clock, tl, c, W, H, restTilt, motion, fromSource }: Props) {
  const oldImage = useImage(tl.hasOld ? fromSource : null);

  /* ---------- seeded once, so a re-render never reshuffles anything ---------- */

  const shards = useMemo(() => {
    if (!tl.hasOld) return [];
    const n = wedgesFor(tl.i);
    const r = c.R * 0.62;
    return Array.from({ length: n }, (_, k) => {
      const a0 = (k / n) * TAU;
      const a1 = ((k + 1) / n) * TAU;
      const mid = (a0 + a1) / 2;
      const throwOut = 1.6 + Math.random() * 1.6;
      // A wedge of the badge, as a clip around its own centre.
      const wedge = Skia.Path.Make();
      wedge.moveTo(0, 0);
      wedge.addArc(Skia.XYWHRect(-r * 1.5, -r * 1.5, r * 3, r * 3), (a0 * 180) / Math.PI, ((a1 - a0) * 180) / Math.PI);
      wedge.close();
      return {
        wedge,
        dx: Math.cos(mid) * throwOut,
        dy: Math.sin(mid) * throwOut - 0.35,
        spin: (Math.random() - 0.5) * 6,
        lag: Math.random() * 0.15,
        grav: 0.8 + Math.random() * 1.3,
      };
    });
  }, [tl.hasOld, tl.i, c.R]);

  const flakes = useMemo(
    () =>
      Array.from({ length: Math.round(70 + tl.i * 130) }, () => ({
        a0: Math.random() * TAU,
        out: 0.7 + Math.random() * 1.9,
        lag: Math.random() * 0.4,
        swirl: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.4),
        size: 1.6 + Math.random() * 3.2,
        rot: Math.random() * TAU,
        rotV: (Math.random() - 0.5) * 14,
        hue: Math.random(),
        star: Math.random() < 0.22,
      })),
    [tl.i],
  );

  const motes = useMemo(
    () =>
      Array.from({ length: motesFor(tl.i) }, () => ({
        a0: Math.random() * TAU,
        spread: 0.45 + Math.random() * 0.75,
        lag: Math.random() * 0.4,
        swirl: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.5),
        r: 0.7 + Math.random() * 1.6,
        hue: Math.random(),
      })),
    [tl.i],
  );

  const pops = useMemo(
    () =>
      Array.from({ length: motion.fx.fireworks }, (_, b) => {
        const bx = 0.14 + Math.random() * 0.72;
        const by = 0.12 + Math.random() * 0.4;
        const at = tl.FORM + 80 + b * 170 + Math.random() * 60;
        return Array.from({ length: 18 + Math.round(Math.random() * 12) }, () => {
          const a = Math.random() * TAU;
          const v = 90 + Math.random() * 170;
          return {
            bx,
            by,
            at,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 900 + Math.random() * 700,
            size: 1.4 + Math.random() * 2.4,
            rot: Math.random() * TAU,
            rotV: (Math.random() - 0.5) * 12,
            hue: Math.random(),
          };
        });
      }).flat(),
    [motion.fx.fireworks, tl.FORM],
  );

  const fall = useMemo(
    () =>
      motion.fx.embers
        ? Array.from({ length: 40 }, () => ({
            x: Math.random(),
            y: -0.05 - Math.random() * 0.3,
            at: tl.FORM + Math.random() * 500,
            vy: 0.08 + Math.random() * 0.1,
            sway: Math.random() * TAU,
            size: 1.4 + Math.random() * 2.4,
            rot: Math.random() * TAU,
            rotV: (Math.random() - 0.5) * 6,
            hue: Math.random(),
          }))
        : [],
    [motion.fx.embers, tl.FORM],
  );

  // Unit shapes, scaled per flake rather than rebuilt every frame.
  const shapes = useMemo(() => {
    const diamond = Skia.Path.Make();
    diamond.moveTo(0, -1);
    diamond.lineTo(0.62, 0);
    diamond.lineTo(0, 1);
    diamond.lineTo(-0.62, 0);
    diamond.close();
    const circle = Skia.Path.Make();
    circle.addCircle(c.cx, c.cy, c.R * 0.98);
    return { diamond, circle };
  }, [c.cx, c.cy, c.R]);

  const picture = useDerivedValue(() => {
    const t = clock.value;
    const { cx, cy, R } = c;
    const recorder = Skia.PictureRecorder();
    const cv: SkCanvas = recorder.beginRecording(Skia.XYWHRect(0, 0, W, H));

    const add = Skia.Paint();
    add.setAntiAlias(true);
    add.setBlendMode(BlendMode.Plus);

    const flake = (x: number, y: number, size: number, rot: number, hue: number, alpha: number, star: boolean) => {
      if (alpha <= 0.01) return;
      const glint = 0.35 + 0.65 * Math.pow(Math.abs(Math.sin(rot)), 3);
      add.setShader(null);
      add.setColor(holo(hue + rot * 0.05, 0.4 + 0.3 * glint, 1));
      add.setAlphaf(Math.min(1, alpha * (0.45 + 0.55 * glint)));
      cv.save();
      cv.translate(x, y);
      cv.rotate((rot * 180) / Math.PI, 0, 0);
      if (star) {
        const s = size * (1.4 + glint * 1.6);
        cv.drawRect(Skia.XYWHRect(-s, -0.6, s * 2, 1.2), add);
        cv.drawRect(Skia.XYWHRect(-0.6, -s, 1.2, s * 2), add);
      }
      cv.scale(size, size);
      cv.drawPath(shapes.diamond, add);
      cv.restore();
    };

    const bloom = (x: number, y: number, r: number, a: number) => {
      if (a <= 0.002) return;
      add.setAlphaf(1);
      add.setShader(
        Skia.Shader.MakeRadialGradient(
          { x, y },
          r * 2.4,
          [Skia.Color(`rgba(255,255,255,${0.3 * a})`), holo(0.6, 0.25, 0.1 * a), Skia.Color("rgba(255,255,255,0)")],
          [0.04, 0.4, 1],
          TileMode.Clamp,
        ),
      );
      cv.drawCircle(x, y, r * 2.4, add);
      add.setShader(null);
    };

    /* ---- the charge: a few flakes lifting off the rim ---- */
    if (tl.hasOld && t > tl.LIFT && t < tl.POP) {
      const k = (t - tl.LIFT) / tl.CHARGE;
      bloom(cx, cy, R * 0.62, k * 0.9);
      for (let n = 0; n < 14; n++) {
        const a = (n / 14) * TAU + t * 0.0016;
        const d = R * (0.7 + 0.25 * Math.sin(t * 0.01 + n));
        flake(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.8, t * 0.01 + n, n / 14, k * 0.9, n % 4 === 0);
      }
    }

    /* ---- the pop: wedges of the old art ---- */
    if (tl.hasOld && t >= tl.POP && t < tl.POP + tl.OUT * 1.4) {
      const k = clamp01((t - tl.POP) / (tl.OUT * 1.4));
      bloom(cx, cy, R * 0.7, (1 - k) * 1.1);
      const img: SkImage | null = oldImage;
      if (img) {
        const r = R * 0.62;
        const src = Skia.XYWHRect(0, 0, img.width(), img.height());
        const dst = Skia.XYWHRect(-r, -r, r * 2, r * 2);
        const plain = Skia.Paint();
        plain.setAntiAlias(true);
        for (const sh of shards) {
          const lp = clamp01((k - sh.lag) / (1 - sh.lag));
          if (lp <= 0) continue;
          const e = outCubic(lp);
          plain.setAlphaf((1 - e * e) * 0.95);
          cv.save();
          cv.translate(cx + sh.dx * r * e, cy + sh.dy * r * e + sh.grav * r * e * e);
          cv.rotate(restTilt + ((sh.spin * e) * 180) / Math.PI, 0, 0);
          cv.clipPath(sh.wedge, ClipOp.Intersect, true);
          cv.drawImageRect(img, src, dst, plain);
          cv.restore();
        }
      }
    }

    /* ---- glitter: out, hang, spiral home ---- */
    const burstAt = tl.hasOld ? tl.POP : 0;
    if (t >= burstAt && t < tl.FORM + 120) {
      for (const f of flakes) {
        const outK = tl.hasOld ? outCubic(clamp01((t - burstAt) / tl.OUT)) : 1;
        const sk = clamp01((t - tl.SWIRL_AT - f.lag * tl.SWIRL * 0.5) / (tl.SWIRL * (1 - f.lag * 0.5)));
        const inK = inOutCubic(sk);
        const d = R * f.out * outK * (1 - inK);
        const a = f.a0 + f.swirl * inK * 2.4 + (tl.hasOld ? 0 : t * 0.0004);
        const appear = tl.hasOld ? 1 : clamp01(t / 260);
        const near = d < R * 0.18 ? d / (R * 0.18) : 1;
        const late = t > tl.FORM ? 1 - (t - tl.FORM) / 120 : 1;
        flake(cx + Math.cos(a) * d, cy + Math.sin(a) * d, f.size, f.rot + (t / 1000) * f.rotV, f.hue, appear * near * late, f.star);
      }
      const gather = clamp01((t - tl.SWIRL_AT) / tl.SWIRL);
      bloom(cx, cy, R * (0.4 + 0.5 * gather), gather * gather * (0.8 + 0.6 * tl.i));
    }

    if (motes.length && t >= tl.SWIRL_AT && t < tl.FORM) {
      const far = Math.max(W, H) * 0.75;
      const line = Skia.Paint();
      line.setAntiAlias(true);
      line.setBlendMode(BlendMode.Plus);
      line.setStyle(PaintStyle.Stroke);
      line.setStrokeCap(StrokeCap.Round);
      for (const m of motes) {
        const lp = clamp01((t - tl.SWIRL_AT - m.lag * tl.SWIRL * 0.6) / (tl.SWIRL * (1 - m.lag * 0.6)));
        if (lp <= 0) continue;
        const e = outCubic(lp);
        const ea = outCubic(clamp01(lp + 0.04));
        const d = far * m.spread * (1 - e);
        const da = far * m.spread * (1 - ea);
        const a = m.a0 + m.swirl * e * 1.3;
        const aa = m.a0 + m.swirl * ea * 1.3;
        const fade = lp > 0.9 ? (1 - lp) / 0.1 : Math.min(1, lp * 4);
        line.setColor(holo(m.hue, 0.3, 0.6 * 0.8 * fade));
        line.setStrokeWidth(m.r);
        cv.drawLine(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cx + Math.cos(aa) * da, cy + Math.sin(aa) * da, line);
      }
    }

    /* ---- the new badge lands: a soft flash, rings, a foil sweep ---- */
    if (t >= tl.FORM) {
      const k = clamp01((t - tl.FORM) / tl.SETTLE);
      if (motion.fx.flash && t < tl.FORM + 260) {
        const fa = 1 - (t - tl.FORM) / 260;
        const white = Skia.Paint();
        white.setColor(Skia.Color(`rgba(255,255,255,${0.22 * fa * fa})`));
        cv.drawRect(Skia.XYWHRect(0, 0, W, H), white);
      }
      bloom(cx, cy, R, (1 - k) * (0.9 + 0.9 * tl.i));

      const ring = Skia.Paint();
      ring.setAntiAlias(true);
      ring.setBlendMode(BlendMode.Plus);
      ring.setStyle(PaintStyle.Stroke);
      for (let w = 0; w < motion.shockwaves; w++) {
        const wp = clamp01(((t - tl.FORM) / 900 - w * 0.16) / (1 - w * 0.16));
        if (wp <= 0 || wp >= 1) continue;
        ring.setColor(holo(0.1 + w * 0.2 + wp * 0.4, 0.35, (1 - wp) * 0.5));
        ring.setStrokeWidth(Math.max(0.6, 3 * (1 - wp)));
        cv.drawCircle(cx, cy, R * (0.9 + outCubic(wp) * 3.6), ring);
      }

      if (motion.fx.streak && k < 1) {
        const sweep = inOutCubic(clamp01((t - tl.FORM - 120) / 520));
        if (sweep > 0 && sweep < 1) {
          const w = R * 2.4;
          const x = cx - w / 2 + sweep * w;
          add.setAlphaf(1);
          add.setShader(
            Skia.Shader.MakeLinearGradient(
              { x: x - R * 0.5, y: 0 },
              { x: x + R * 0.5, y: 0 },
              [Skia.Color("rgba(255,255,255,0)"), Skia.Color(`rgba(255,255,255,${0.5 * Math.sin(sweep * Math.PI)})`), Skia.Color("rgba(255,255,255,0)")],
              [0, 0.5, 1],
              TileMode.Clamp,
            ),
          );
          cv.save();
          cv.clipPath(shapes.circle, ClipOp.Intersect, true);
          cv.drawRect(Skia.XYWHRect(cx - R, cy - R, R * 2, R * 2), add);
          cv.restore();
          add.setShader(null);
        }
      }
    }

    /* ---- glitter bursts around the stage, then a slow fall ---- */
    for (const s of pops) {
      const age = t - s.at;
      if (age <= 0 || age > s.life) continue;
      const u = age / s.life;
      const sec = age / 1000;
      const x = s.bx * W + s.vx * sec * (1 - u * 0.4);
      const y = s.by * H + s.vy * sec * (1 - u * 0.4) + 140 * sec * sec;
      flake(x, y, s.size, s.rot + sec * s.rotV, s.hue, (1 - u) * (1 - u), false);
    }

    for (const e of fall) {
      const age = t - e.at;
      if (age <= 0) continue;
      const sec = age / 1000;
      const y = (e.y + e.vy * sec) * H;
      const x = (e.x + Math.sin(e.sway + sec * 1.7) * 0.012) * W;
      const fade = Math.min(1, sec * 2) * clamp01((tl.TAIL - t) / 800);
      flake(x, y, e.size, e.rot + sec * e.rotV, e.hue, fade * 0.8, false);
    }

    return recorder.finishRecordingAsPicture();
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}
