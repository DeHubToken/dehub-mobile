/**
 * Extra audio post styles — the 42 painters added on top of the original ten.
 * =========================================================================
 * This file is shared word for word between dehubweb
 * (src/components/app/audio/visualizer-extra.ts) and dehub-mobile
 * (components/Home/visualizer-extra.ts). Change one, copy it to the other.
 *
 * Every painter draws through `Ctx2D`, a small slice of the canvas 2D API.
 * Web hands it the real `CanvasRenderingContext2D`; the app hands it a thin
 * adapter over a Skia canvas. So a style is written once and looks the same
 * on both.
 *
 * Painters draw in CSS pixels and never rely on the previous frame: the
 * caller clears before every frame, and anything that needs memory (particles,
 * history) keeps it in the per-card `state` object. That is what lets the
 * app record each frame as a fresh Skia picture.
 *
 * Colour follows the house rule: hue 0 is monochrome (white on dark, ink on
 * paper). The theme styles are the exception: at hue 0 they use their theme's
 * own colours, since that is the point of them. Any other hue overrides.
 */

/* ─── Drawing surface ──────────────────────────────────────────────────── */

export interface Grad {
  addColorStop(offset: number, color: string): void;
}

export interface Ctx2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Grad;
}

/* ─── Style list ───────────────────────────────────────────────────────── */

export const EXTRA_STYLES = [
  // Theme styles, one per theme.
  { value: 'paper', label: 'Paper' },
  { value: 'warp', label: 'Warp' },
  { value: 'haze', label: 'Neon Haze' },
  { value: 'swarm', label: 'Swarm' },
  { value: 'lava', label: 'Lava Lamp' },
  { value: 'snow', label: 'Snowfall' },
  { value: 'hud', label: 'HUD' },
  { value: 'neoncity', label: 'Neon City' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'coderain', label: 'Code Rain' },
  { value: 'glitch', label: 'Static' },
  { value: 'fireflies', label: 'Fireflies' },
  // Upgrades of the original ten.
  { value: 'liquid', label: 'Liquid Chrome' },
  { value: 'glint', label: 'Glint Trail' },
  { value: 'led', label: 'LED Stack' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'braid', label: 'Braid' },
  { value: 'ribbon', label: 'Ink Ribbon' },
  { value: 'sunflower', label: 'Sunflower' },
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'ridges', label: 'Ridgelines' },
  { value: 'water', label: 'Still Water' },
  { value: 'butterfly', label: 'Butterfly' },
  { value: 'rain', label: 'Rain Pond' },
  { value: 'sonar', label: 'Sonar' },
  { value: 'goo', label: 'Lava Goo' },
  { value: 'heart', label: 'Heartbeat' },
  { value: 'drive', label: 'Night Drive' },
  { value: 'peaks', label: 'Wireframe' },
  { value: 'galaxy', label: 'Galaxy' },
  { value: 'planet', label: 'Planet' },
  // New.
  { value: 'hypno', label: 'Hypno' },
  { value: 'tunnel', label: 'Tunnel' },
  { value: 'moire', label: 'Moiré' },
  { value: 'opart', label: 'Op-Art' },
  { value: 'drift', label: 'Drift' },
  { value: 'flow', label: 'Flow Ink' },
  { value: 'harmono', label: 'Harmonograph' },
  { value: 'kaleido', label: 'Kaleidoscope' },
  { value: 'halftone', label: 'Halftone' },
  { value: 'chladni', label: 'Chladni' },
] as const;

export type ExtraStyle = (typeof EXTRA_STYLES)[number]['value'];

const EXTRA_SET = new Set<string>(EXTRA_STYLES.map((s) => s.value));
export const isExtraStyle = (s: string): s is ExtraStyle => EXTRA_SET.has(s);

/**
 * The style an untouched audio post plays on each theme. Minimal keeps the
 * chrome waveform; System gets Glint Trail; every other theme gets its own.
 * Anything not listed (or a theme added later) falls back to the chrome.
 */
const THEME_DEFAULT: Record<string, string> = {
  minimal: 'static',
  system: 'glint',
  light: 'paper',
  cosmic: 'warp',
  hazy: 'haze',
  swarms: 'swarm',
  lavalamp: 'lava',
  winter: 'snow',
  christmas: 'snow',
  war: 'hud',
  osaka: 'neoncity',
  island: 'ocean',
  hacker: 'coderain',
  horror: 'glitch',
  jungle: 'fireflies',
};
export const defaultStyleForTheme = (theme: string): string => THEME_DEFAULT[theme] ?? 'static';

/** Theme accent as rgb, used for highlights when the hue slider is at 0. */
const THEME_ACCENT: Record<string, [number, number, number]> = {
  war: [79, 227, 224],
  osaka: [255, 111, 181],
  island: [255, 122, 138],
  hacker: [57, 255, 136],
  horror: [255, 43, 43],
  jungle: [226, 176, 96],
};

/* ─── Colour ───────────────────────────────────────────────────────────── */

export interface Palette {
  hue: number;
  light: boolean;
  /** Monochrome at hue 0, else the hue. k is brightness 0–1. */
  ink(k: number, a?: number): string;
  /** Like ink, with a hue shift for multi-colour styles. */
  tint(k: number, a: number, shift: number): string;
  /** Highlight colour: the theme accent at hue 0, else a neighbour of the hue. */
  accent(a?: number): string;
  /** A theme style's own colour at hue 0 (`sigHue`), the slider's otherwise. */
  sig(sigHue: number, k: number, a: number, sat?: number): string;
}

const paletteCache = new Map<string, Palette>();
export function makePalette(hue: number, light: boolean, theme = ''): Palette {
  const key = `${hue}|${light ? 1 : 0}|${theme}`;
  const hit = paletteCache.get(key);
  if (hit) return hit;
  const mono = light ? '24,24,27' : '255,255,255';
  const lit = (k: number) => (light ? 58 - 30 * k : 30 + 42 * k).toFixed(1);
  const monoA = (k: number, a: number) => (a * (0.22 + 0.78 * k)).toFixed(3);
  const acc = THEME_ACCENT[theme];
  const p: Palette = {
    hue,
    light,
    ink: (k, a = 1) => (hue === 0 ? `rgba(${mono},${monoA(k, a)})` : `hsla(${hue},80%,${lit(k)}%,${a})`),
    tint: (k, a, s) =>
      hue === 0 ? `rgba(${mono},${monoA(k, a)})` : `hsla(${(((hue + s) % 360) + 360) % 360},80%,${lit(k)}%,${a})`,
    accent: (a = 1) =>
      hue === 0
        ? acc
          ? `rgba(${acc[0]},${acc[1]},${acc[2]},${a})`
          : `rgba(${mono},${a})`
        : `hsla(${(hue + 35) % 360},90%,${light ? 45 : 66}%,${a})`,
    sig: (sh, k, a, sat = 85) =>
      `hsla(${hue === 0 ? sh : hue},${sat}%,${lit(k)}%,${a})`,
  };
  paletteCache.set(key, p);
  return p;
}

/* ─── Audio frame ──────────────────────────────────────────────────────── */

export interface AudioFrame {
  /** 64 bands, low to high, 0–1. */
  bands: Float32Array;
  /** 128 samples of the waveform, -1–1. */
  wave: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  level: number;
  /** Kick envelope, 1 on the hit and falling. */
  kick: number;
  /** True on the frame a beat / hi-hat lands. */
  beatHit: boolean;
  hatHit: boolean;
  /** Beats so far, and bars (4 beats). */
  beats: number;
  bar: number;
  /** Seconds since phase of the current beat, 0–1. */
  beatPhase: number;
  /** 0–1 through the track. */
  progress: number;
  /** Per-post track shape (the chrome waveform), 0–1. */
  peaks: number[];
  t: number;
  dt: number;
}

const TAU = Math.PI * 2;
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Turns whatever sound data a platform has into an `AudioFrame`. Web feeds it
 * the analyser; the app has no analyser behind its player, so it runs the
 * synthesised groove — the same compromise the app's first ten styles make.
 */
export class AudioListener {
  frame: AudioFrame = {
    bands: new Float32Array(64),
    wave: new Float32Array(128),
    bass: 0, mid: 0, treble: 0, level: 0, kick: 0,
    beatHit: false, hatHit: false, beats: 0, bar: 0, beatPhase: 0,
    progress: 0, peaks: [], t: 0, dt: 0,
  };
  private last = -1;
  private slowB = 0.2;
  private slowT = 0.1;
  private lastBeat = -10;
  private lastHat = -10;
  private beatGap = 0.5;

  private summarise() {
    const f = this.frame;
    let b = 0, m = 0, tr = 0, l = 0;
    for (let i = 0; i < 64; i++) {
      const x = f.bands[i];
      l += x;
      if (i < 6) b += x;
      else if (i < 25) m += x;
      else tr += x;
    }
    f.bass = b / 6;
    f.mid = m / 19;
    f.treble = Math.min(1, (tr / 39) * 1.6);
    f.level = l / 64;
  }

  private clock(t: number) {
    const f = this.frame;
    f.dt = this.last < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, t - this.last));
    this.last = t;
    f.t = t;
  }

  /** Real sound. `freq` and `time` are the analyser's byte arrays. */
  fromAnalyser(freq: Uint8Array, time: Uint8Array | null, t: number, progress: number, peaks: number[]) {
    const f = this.frame;
    this.clock(t);
    const n = freq.length;
    const top = n * 0.72;
    for (let i = 0; i < 64; i++) {
      const lo = Math.floor(top * Math.pow(i / 64, 1.7));
      const hi = Math.max(lo + 1, Math.floor(top * Math.pow((i + 1) / 64, 1.7)));
      let s = 0;
      for (let k = lo; k < hi && k < n; k++) s += freq[k];
      const v = Math.pow(s / (hi - lo) / 255, 1.3);
      f.bands[i] = f.bands[i] * 0.45 + v * 0.55;
    }
    if (time && time.length) {
      for (let j = 0; j < 128; j++) {
        const v = (time[Math.floor((j / 128) * time.length)] - 128) / 128;
        f.wave[j] = v * 1.4 * Math.pow(Math.sin((Math.PI * (j + 0.5)) / 128), 0.3);
      }
    }
    this.summarise();
    // Beat: bass jumping clear of its own slow average.
    this.slowB = this.slowB * 0.96 + f.bass * 0.04;
    this.slowT = this.slowT * 0.94 + f.treble * 0.06;
    f.beatHit = f.bass > this.slowB * 1.22 + 0.05 && t - this.lastBeat > 0.26;
    if (f.beatHit) {
      const gap = t - this.lastBeat;
      if (gap < 1.5) this.beatGap = this.beatGap * 0.7 + gap * 0.3;
      this.lastBeat = t;
      f.beats++;
    }
    f.hatHit = f.treble > this.slowT * 1.18 + 0.03 && t - this.lastHat > 0.11;
    if (f.hatHit) this.lastHat = t;
    f.kick = Math.exp(-(t - this.lastBeat) * 7);
    f.beatPhase = Math.min(1, (t - this.lastBeat) / this.beatGap);
    f.bar = Math.floor(f.beats / 4);
    f.progress = progress;
    f.peaks = peaks;
  }

  /** A 118 BPM groove, for platforms (and moments) with no analyser. */
  fromSynth(t: number, progress: number, peaks: number[], energy = 1) {
    const f = this.frame;
    this.clock(t);
    const bpm = 118;
    const bp = (t * bpm) / 60, ph = bp % 1, bi = Math.floor(bp);
    const kick = Math.exp(-ph * 7) + (bi % 4 === 3 && ph > 0.5 ? Math.exp(-((bp + 0.5) % 1) * 9) * 0.7 : 0);
    const sn = bi % 2 === 1 ? Math.exp(-ph * 9) : 0;
    const hat = Math.exp(-((bp * 2) % 1) * 16) * 0.6;
    f.beatHit = bi !== f.beats;
    f.beats = bi;
    const hi = Math.floor(bp * 2);
    f.hatHit = hi !== this.lastHat;
    this.lastHat = hi;
    const swell = 0.5 + 0.5 * Math.sin(t * 0.37);
    for (let i = 0; i < 64; i++) {
      const x = i / 63;
      let v =
        kick * Math.exp(-x * 7) * 1.05 +
        sn * Math.exp(-((x - 0.32) ** 2) / 0.012) * 0.75 +
        sn * 0.22 * x +
        hat * Math.max(0, x - 0.55) * 1.7 +
        0.3 * swell * Math.exp(-x * 2.2) * (0.6 + 0.4 * Math.sin(t * 1.3 + i * 0.45)) +
        0.07 * hash(i + Math.floor(t * 30));
      v = Math.min(1, v * energy);
      f.bands[i] = f.bands[i] * 0.5 + v * 0.5;
    }
    this.summarise();
    for (let j = 0; j < 128; j++) {
      const x = j / 127;
      f.wave[j] =
        (Math.sin(x * TAU * 2 + t * 9) * f.bass * 0.7 +
          Math.sin(x * TAU * 7 + t * 23) * f.mid * 0.4 +
          Math.sin(x * TAU * 19 + t * 41) * f.treble * 0.25) *
        Math.pow(Math.sin(Math.PI * x), 0.3);
    }
    f.kick = kick * energy;
    f.beatPhase = ph;
    f.bar = Math.floor(bi / 4);
    f.progress = progress;
    f.peaks = peaks;
  }

  /** A paused card: hold the last frame, move nothing. */
  hold(t: number, progress: number, peaks: number[]) {
    const f = this.frame;
    this.last = t;
    f.t = t;
    f.dt = 0;
    f.beatHit = false;
    f.hatHit = false;
    f.progress = progress;
    f.peaks = peaks;
    if (f.level === 0) {
      // Never played: give the shape something to stand on.
      for (let i = 0; i < 64; i++) f.bands[i] = 0.12 + 0.25 * (peaks[Math.floor((i / 64) * peaks.length)] ?? 0.4) * Math.exp(-i / 40);
      this.summarise();
    }
  }
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

type State = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Painter = (c: Ctx2D, w: number, h: number, F: AudioFrame, C: Palette, S: State) => void;

const bandAt = (F: AudioFrame, x: number) => {
  const p = Math.max(0, Math.min(1, x)) * 63, i = p | 0, f = p - i;
  return F.bands[i] * (1 - f) + F.bands[Math.min(63, i + 1)] * f;
};
const peakAt = (F: AudioFrame, u: number) => {
  const pk = F.peaks;
  if (!pk.length) return 0.5 + 0.35 * Math.abs(Math.sin(u * 23));
  return pk[Math.min(pk.length - 1, Math.floor(u * pk.length))];
};
const dtOf = (F: AudioFrame) => Math.min(F.dt, 0.05);
const circle = (c: Ctx2D, x: number, y: number, r: number) => {
  c.moveTo(x + r, y);
  c.arc(x, y, Math.max(0.01, r), 0, TAU);
};
function rr(c: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  if (h < 0) { y += h; h = -h; }
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
  c.fill();
}
/** Erase a shape to the card behind — how a nearer layer hides a farther one. */
function knock(c: Ctx2D, build: () => void) {
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'rgba(0,0,0,1)';
  c.beginPath();
  build();
  c.fill();
  c.restore();
}
function line(c: Ctx2D, pts: [number, number][]) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
}
function spawnEvery<T>(list: T[], max: number) {
  if (list.length > max) list.splice(0, list.length - max);
}

/**
 * Filled marching squares: every cell above `thr` in `field` becomes a polygon,
 * all in one path so there are no seams. The cheap way to draw goo on a
 * surface that has no pixel access.
 */
function metaballs(c: Ctx2D, gw: number, gh: number, cw: number, ch: number, field: (x: number, y: number) => number, thr: number) {
  const v = new Float32Array((gw + 1) * (gh + 1));
  for (let y = 0; y <= gh; y++) for (let x = 0; x <= gw; x++) v[y * (gw + 1) + x] = field(x, y);
  c.beginPath();
  const cx = [0, 1, 1, 0], cy = [0, 0, 1, 1];
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const val = [0, 1, 2, 3].map((k) => v[(y + cy[k]) * (gw + 1) + x + cx[k]]);
      const ins = val.map((q) => q >= thr);
      if (!ins[0] && !ins[1] && !ins[2] && !ins[3]) continue;
      let first = true;
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4;
        if (ins[k]) {
          const px = (x + cx[k]) * cw, py = (y + cy[k]) * ch;
          if (first) { c.moveTo(px, py); first = false; } else c.lineTo(px, py);
        }
        if (ins[k] !== ins[n]) {
          const t = (thr - val[k]) / (val[n] - val[k]);
          const px = (x + cx[k] + (cx[n] - cx[k]) * t) * cw, py = (y + cy[k] + (cy[n] - cy[k]) * t) * ch;
          if (first) { c.moveTo(px, py); first = false; } else c.lineTo(px, py);
        }
      }
      c.closePath();
    }
  c.fill();
}

/* ─── Painters ─────────────────────────────────────────────────────────── */

const P: Record<ExtraStyle, Painter> = {
  /* 1 Default, upgraded */
  liquid(c, w, h, F, C) {
    const n = 56, bw = w / n, mid = h / 2;
    const g = c.createLinearGradient(0, h * 0.1, 0, h * 0.9);
    g.addColorStop(0, C.ink(1, 1)); g.addColorStop(0.4, C.ink(0.55, 0.95)); g.addColorStop(0.5, C.ink(0, 0.95));
    g.addColorStop(0.56, C.ink(1, 1)); g.addColorStop(1, C.ink(0.45, 0.9));
    for (let i = 0; i < n; i++) {
      const u = i / n, d = (u - F.progress) * n, bl = F.level * 1.3 * Math.exp((-d * d) / 18);
      const bh = Math.max(3, (peakAt(F, u) * 0.6 + bl * 0.35) * h * 0.8);
      const wob = Math.sin(i * 0.35 - F.t * 5) * F.bass * h * 0.08 + Math.sin(i * 0.9 + F.t * 2) * F.treble * h * 0.02;
      c.fillStyle = u < F.progress ? g : C.ink(0.25, 0.35);
      rr(c, i * bw + bw * 0.18, mid - bh / 2 + wob, bw * 0.64, bh, bw * 0.32);
    }
    const x = F.progress * w, pg = c.createLinearGradient(x - 8, 0, x + 8, 0);
    pg.addColorStop(0, C.accent(0)); pg.addColorStop(0.5, C.accent(0.9)); pg.addColorStop(1, C.accent(0));
    c.fillStyle = pg; c.fillRect(x - 8, h * 0.06, 16, h * 0.88);
  },
  glint(c, w, h, F, C, S) {
    const p: { x: number; y: number; vx: number; vy: number; l: number }[] = (S.p ||= []);
    const n = 56, bw = w / n, mid = h / 2, dt = dtOf(F);
    for (let i = 0; i < n; i++) {
      const u = i / n, played = u < F.progress, d = (u - F.progress) * n, bl = F.level * 1.3 * Math.exp((-d * d) / 18);
      const bh = Math.max(2, (peakAt(F, u) * 0.6 + bl * 0.35) * h * 0.8);
      const heat = played ? Math.exp(-(F.progress - u) * 7) : 0;
      c.fillStyle = played ? C.ink(0.45 + 0.55 * heat, 0.55 + 0.45 * heat) : C.ink(0.2, 0.3);
      c.fillRect(i * bw + bw * 0.22, mid - bh / 2, bw * 0.56, bh);
      if (heat > 0.3) { c.fillStyle = C.accent(heat * 0.35); c.fillRect(i * bw + bw * 0.22, mid - bh / 2 - 3, bw * 0.56, 2); }
    }
    const x = F.progress * w;
    if (F.hatHit && dt > 0) for (let k = 0; k < 3; k++) p.push({ x, y: mid + (Math.random() - 0.5) * h * 0.6, vx: -(25 + Math.random() * 60), vy: (Math.random() - 0.5) * 30, l: 1 });
    c.fillStyle = C.accent(1);
    for (const q of p) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.l -= dt * 1.1;
      if (q.l <= 0) continue;
      const s = 4 * q.l;
      c.globalAlpha = q.l; c.fillRect(q.x - s, q.y - 0.5, s * 2, 1); c.fillRect(q.x - 0.5, q.y - s, 1, s * 2);
    }
    c.globalAlpha = 1;
    S.p = p.filter((q) => q.l > 0);
    c.fillStyle = C.accent(0.95); c.fillRect(x - 1, h * 0.08, 2, h * 0.84);
  },
  /* 2 Bars */
  led(c, w, h, F, C, S) {
    const n = 22, rows = 14, cw = w / n, ch = (h - 8) / rows;
    const pk: Float32Array = (S.pk ||= new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const v = Math.pow(bandAt(F, (i / (n - 1)) * 0.85), 0.7), lit = Math.round(v * rows);
      pk[i] = Math.max(pk[i] - dtOf(F) * 6, lit);
      for (let r = 0; r < rows; r++) {
        const on = r < lit, top = r >= rows - 3;
        c.fillStyle = on ? (top ? C.accent(0.95) : C.ink(0.35 + (0.65 * r) / rows, 0.95)) : C.ink(0, 0.1);
        c.fillRect(i * cw + 1.5, h - 4 - (r + 1) * ch + 1.5, cw - 3, ch - 3);
      }
      const pr = Math.min(rows - 1, Math.round(pk[i]));
      if (pr > 0) { c.fillStyle = C.accent(0.8); c.fillRect(i * cw + 1.5, h - 4 - (pr + 1) * ch + 1.5, cw - 3, ch - 3); }
    }
  },
  bounce(c, w, h, F, C, S) {
    const n = 18, fl = h * 0.74, bw = w / n, dt = dtOf(F);
    if (!S.y) { S.y = new Float32Array(n); S.v = new Float32Array(n); }
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, Math.pow(bandAt(F, (i / n) * 0.75), 0.55) * 1.25), tg = v * fl * 0.92;
      S.v[i] += (tg - S.y[i]) * 260 * dt; S.v[i] *= Math.pow(0.015, dt); S.y[i] = Math.max(bw * 0.55, S.y[i] + S.v[i] * dt);
      const x = i * bw + bw * 0.22, cw = bw * 0.56;
      c.fillStyle = C.ink(0.5 + 0.5 * v, 1); rr(c, x, fl - S.y[i], cw, S.y[i], cw / 2);
      c.fillStyle = C.ink(0.5, 0.16); rr(c, x, fl + 3, cw, S.y[i] * 0.4, cw / 2);
    }
    c.fillStyle = C.ink(0.3, 0.35); c.fillRect(0, fl + 1, w, 1);
  },
  /* 3 Wave */
  braid(c, w, h, F, C) {
    const mid = h / 2, amps = [F.bass, F.mid, F.treble], fr = [1.5, 2.5, 3.5], sp = [1.3, -1.7, 2.3];
    c.lineCap = 'round';
    for (let k = 2; k >= 0; k--) {
      const amp = amps[k] * h * 0.3 + h * 0.05;
      c.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = mid + Math.sin((x / w) * TAU * fr[k] + F.t * sp[k] + k * 2.1) * amp * Math.sin((Math.PI * x) / w);
        if (x) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.strokeStyle = C.tint(1 - k * 0.2, 0.95 - k * 0.15, k * 45); c.lineWidth = 4.5 - k * 1.2; c.stroke();
    }
  },
  ribbon(c, w, h, F, C, S) {
    const mid = h / 2, top: [number, number][] = [], bot: [number, number][] = [], ox = Math.cos(-0.9), oy = Math.sin(-0.9);
    for (let j = 0; j < 128; j += 2) {
      const x = w * 0.04 + (j / 127) * w * 0.92, y = mid + F.wave[j] * h * 0.38, t = 2 + F.level * h * 0.08 + Math.abs(F.wave[j]) * h * 0.06;
      top.push([x + ox * t, y + oy * t]); bot.push([x - ox * t, y - oy * t]);
    }
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, C.ink(0.3, 0.6)); g.addColorStop(0.5, C.ink(1, 1)); g.addColorStop(1, C.ink(0.3, 0.6));
    c.fillStyle = g; line(c, top.concat(bot.reverse())); c.closePath(); c.fill();
    const d: { x: number; y: number; vy: number; r: number; l: number }[] = (S.d ||= []), dt = dtOf(F);
    if (F.beatHit && dt > 0) {
      const j = (Math.random() * 120) | 0;
      for (let k = 0; k < 4; k++) d.push({ x: w * 0.04 + (j / 127) * w * 0.92 + (Math.random() - 0.5) * 20, y: mid + F.wave[j] * h * 0.38, vy: 20 + Math.random() * 40, r: 1 + Math.random() * 2.5, l: 1 });
    }
    c.fillStyle = C.ink(1, 0.8); c.beginPath();
    for (const q of d) { q.y += q.vy * dt; q.l -= dt * 0.8; if (q.l > 0) circle(c, q.x, q.y, q.r * q.l); }
    c.fill();
    S.d = d.filter((q) => q.l > 0);
  },
  /* 4 Radial */
  sunflower(c, w, h, F, C) {
    const cx = w / 2, cy = h / 2, N = 240, sc = ((Math.min(w, h) * 0.47) / Math.sqrt(N)) * (1 + F.bass * 0.08), rot = F.t * 0.15;
    for (let i = 1; i < N; i++) {
      const r = sc * Math.sqrt(i), a = i * 2.39996 + rot, v = bandAt(F, (i / N) * 0.9), s = 0.7 + v * 3.4 * (0.4 + (0.6 * i) / N);
      c.fillStyle = C.tint(0.35 + 0.65 * v, 0.95, i * 0.6); c.beginPath(); circle(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, s); c.fill();
    }
    c.fillStyle = C.accent(0.9); c.beginPath(); circle(c, cx, cy, 3 + F.kick * 3); c.fill();
  },
  vinyl(c, w, h, F, C, S) {
    const cx = w * 0.42, cy = h / 2, R = Math.min(h * 0.44, w * 0.34);
    S.r = (S.r || 0) + dtOf(F) * 3.5;
    c.fillStyle = C.ink(0.05, 0.35); c.beginPath(); circle(c, cx, cy, R); c.fill();
    for (let g = 0; g < 22; g++) {
      const r = R * (0.36 + (0.62 * g) / 22), v = bandAt(F, g / 22);
      c.strokeStyle = C.ink(0.25 + 0.75 * v, 0.2 + 0.7 * v); c.lineWidth = 0.7 + v * 1.6; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
    }
    c.save(); c.translate(cx, cy); c.rotate(S.r);
    c.fillStyle = C.ink(1, 0.1);
    for (const a of [0, Math.PI]) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a - 0.18, a + 0.18); c.closePath(); c.fill(); }
    c.fillStyle = C.accent(0.95); c.beginPath(); circle(c, 0, 0, R * 0.3); c.fill();
    knock(c, () => { circle(c, R * 0.18, 0, R * 0.04); circle(c, 0, 0, R * 0.035); });
    c.restore();
    const px = cx + R * 1.18, py = cy - R * 0.95, nx = cx + R * 0.66, ny = cy + R * 0.22 + F.bass * 2;
    c.strokeStyle = C.ink(0.85, 0.95); c.lineWidth = 3; c.lineCap = 'round';
    line(c, [[px, py], [px - R * 0.05, cy + R * 0.1], [nx, ny]]); c.stroke();
    c.fillStyle = C.ink(0.85, 1); c.beginPath(); circle(c, px, py, 5); c.fill();
  },
  /* 5 Spectrum */
  aurora(c, w, h, F, C, S) {
    const st: number[][] = (S.st ||= Array.from({ length: 26 }, (_, i) => [hash(i), hash(i + 50) * 0.5, hash(i + 90)]));
    c.fillStyle = C.ink(1, 0.35);
    for (const s of st) { c.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(F.t * 1.5 + s[2] * 9)); c.fillRect(s[0] * w, s[1] * h, 1.2, 1.2); }
    c.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      const base = h * (0.22 + 0.13 * k), g = c.createLinearGradient(0, base - h * 0.1, 0, base + h * 0.7);
      g.addColorStop(0, C.tint(1, 0.7, k * 55)); g.addColorStop(0.35, C.tint(0.7, 0.3, k * 55)); g.addColorStop(1, C.tint(0.4, 0, k * 55));
      c.fillStyle = g;
      const tops: [number, number][] = [];
      for (let x = 0; x <= w; x += 3) {
        const v = bandAt(F, (x / w) * 0.8 + k * 0.05);
        const top = base + Math.sin(x * 0.012 + F.t * (0.6 + 0.2 * k) + k * 2) * h * 0.09 + Math.sin(x * 0.031 - F.t * 1.1) * h * 0.03;
        tops.push([x, top]); c.fillRect(x, top, 2.4, h * (0.12 + v * 0.55));
      }
      c.strokeStyle = C.tint(1, 0.85, k * 55); c.lineWidth = 1.2; line(c, tops); c.stroke();
    }
  },
  ridges(c, w, h, F, C, S) {
    const hist: Float32Array[] = (S.h ||= []);
    S.f = (S.f || 0) + 1;
    if (F.dt > 0 && S.f % 4 === 0) { hist.push(F.bands.slice()); spawnEvery(hist, 18); }
    if (!hist.length) hist.push(F.bands.slice());
    const L = hist.length, x0 = w * 0.1, x1 = w * 0.9;
    c.lineWidth = 1.3;
    for (let li = 0; li < L; li++) {
      const col = hist[li], age = (L - 1 - li) / 17, y0 = h * 0.93 - age * h * 0.72, pts: [number, number][] = [];
      for (let x = x0; x <= x1; x += 3) {
        const u = (x - x0) / (x1 - x0), env = Math.exp(-((u - 0.5) ** 2) / 0.025), v = col[Math.min(63, (u * 44) | 0)];
        pts.push([x, y0 - env * v * h * 0.3 - (1 - env) * v * h * 0.025 - env * hash(x + li * 7) * h * 0.012]);
      }
      knock(c, () => { pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.lineTo(x1, y0 + 3); c.lineTo(x0, y0 + 3); c.closePath(); });
      c.strokeStyle = C.ink(0.35 + 0.65 * (1 - age), 0.95); line(c, pts); c.stroke();
    }
  },
  /* 6 Mirror */
  water(c, w, h, F, C) {
    const n = 40, bw = w / n, hz = h * 0.58, vs: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = bandAt(F, (Math.abs(i - n / 2) / (n / 2)) * 0.8), bh = Math.max(2, v * hz * 0.9);
      vs.push(v); c.fillStyle = C.ink(0.5 + 0.5 * v, 1); c.fillRect(i * bw + bw * 0.2, hz - bh, bw * 0.6, bh);
    }
    for (let y = hz + 2; y < h; y += 3) {
      const d = (y - hz) / (h - hz), off = Math.sin(y * 0.28 - F.t * 5) * (1 + F.bass * 4) * (0.4 + d);
      c.fillStyle = C.ink(0.7, (1 - d) * 0.45);
      for (let i = 0; i < n; i++) if (y - hz < vs[i] * hz * 0.63) c.fillRect(i * bw + bw * 0.2 + off, y, bw * 0.6, 2);
    }
    c.fillStyle = C.ink(0.6, 0.4); c.fillRect(0, hz, w, 1);
  },
  butterfly(c, w, h, F, C) {
    const cx = w / 2, cy = h / 2, n = 30, half = w * 0.46;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        c.beginPath(); c.moveTo(cx, cy);
        for (let i = 0; i <= n; i++) {
          const u = i / n, v = bandAt(F, u * 0.85);
          c.lineTo(cx + sx * u * half, cy + sy * (v * h * 0.44 * (1 - u * 0.6) + 2) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.02)), 0.4));
        }
        c.lineTo(cx + sx * half, cy); c.closePath();
        c.fillStyle = C.tint(0.8, 0.2, sy * 25); c.fill(); c.strokeStyle = C.tint(1, 0.9, sy * 25); c.lineWidth = 1.4; c.stroke();
      }
    c.lineWidth = 1; c.strokeStyle = C.ink(0.7, 0.35); c.beginPath();
    for (let i = 0; i <= n; i += 2) {
      const u = i / n, hh = bandAt(F, u * 0.85) * h * 0.44 * (1 - u * 0.6);
      c.moveTo(cx + u * half, cy - hh); c.lineTo(cx + u * half, cy + hh); c.moveTo(cx - u * half, cy - hh); c.lineTo(cx - u * half, cy + hh);
    }
    c.stroke();
    c.fillStyle = C.accent(0.95); rr(c, cx - 2, cy - h * 0.18, 4, h * 0.36, 2);
  },
  /* 7 Rings */
  rain(c, w, h, F, C, S) {
    const r: { x: number; y: number; r: number; m: number }[] = (S.r ||= []), dt = dtOf(F);
    const spawn = (big: boolean) => { const y = h * (0.25 + Math.random() * 0.7); r.push({ x: Math.random() * w, y, r: 1, m: (big ? 60 : 26) * (0.4 + y / h) }); };
    if (dt > 0) { if (F.beatHit) spawn(true); if (F.hatHit && Math.random() < 0.5) spawn(false); if (Math.random() < dt * 3 * (0.2 + F.level)) spawn(F.bass > 0.4); }
    c.lineWidth = 1.5;
    for (const q of r) {
      q.r += dt * q.m * 1.4;
      const a = 1 - q.r / q.m;
      if (a <= 0) continue;
      c.strokeStyle = C.ink(1, a * 0.9); c.beginPath(); c.ellipse(q.x, q.y, q.r, q.r * 0.36, 0, 0, TAU); c.stroke();
      if (q.r > 8) { c.strokeStyle = C.ink(0.7, a * 0.5); c.beginPath(); c.ellipse(q.x, q.y, q.r * 0.62, q.r * 0.62 * 0.36, 0, 0, TAU); c.stroke(); }
    }
    S.r = r.filter((q) => q.r < q.m);
  },
  sonar(c, w, h, F, C, S) {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46, dt = dtOf(F);
    S.a = (S.a || 0) + dt * 2.2 * (0.6 + F.level);
    const b: { a: number; r: number; born: number }[] = (S.b ||= []);
    c.strokeStyle = C.ink(0.4, 0.25); c.lineWidth = 1; c.beginPath();
    for (let k = 1; k <= 4; k++) circle(c, cx, cy, (R * k) / 4);
    c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    c.lineWidth = 2;
    for (let k = 0; k < 26; k++) {
      const a = S.a - k * 0.03;
      c.strokeStyle = C.accent((1 - k / 26) * 0.5); c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke();
    }
    if (F.beatHit && dt > 0) b.push({ a: Math.random() * TAU, r: 0.2 + Math.random() * 0.75, born: S.a });
    for (const q of b) {
      const d = (((S.a - q.a) % TAU) + TAU) % TAU, al = Math.exp(-d * 1.4);
      c.fillStyle = C.accent(Math.max(0.08, al)); c.beginPath(); circle(c, cx + Math.cos(q.a) * q.r * R, cy + Math.sin(q.a) * q.r * R, 2 + al * (2 + F.bass * 4)); c.fill();
    }
    S.b = b.filter((q) => S.a - q.born < TAU * 2);
  },
  /* 8 Pulse */
  goo(c, w, h, F, C) {
    const gw = 44, gh = Math.max(12, Math.round((gw * h) / w)), lv = [F.bass, F.mid, F.treble, F.level], balls: number[][] = [];
    for (let k = 0; k < 4; k++)
      balls.push([gw * (0.5 + Math.cos(F.t * (0.4 + k * 0.13) + k * 1.7) * 0.28), gh * (0.5 + Math.sin(F.t * (0.5 + k * 0.11) + k * 2.3) * 0.3), (gh * (0.08 + lv[k] * 0.12)) ** 2]);
    const field = (x: number, y: number) => { let f = 0; for (const q of balls) { const dx = x - q[0], dy = y - q[1]; f += q[2] / (dx * dx + dy * dy + 0.5); } return f; };
    c.fillStyle = C.ink(0.55, 0.9); metaballs(c, gw, gh, w / gw, h / gh, field, 1);
    c.fillStyle = C.ink(1, 0.9); metaballs(c, gw, gh, w / gw, h / gh, field, 2.2);
  },
  heart(c, w, h, F, C) {
    const bp = F.beatPhase, th = Math.exp(-bp * 10) + (bp > 0.18 ? 0.6 * Math.exp(-(bp - 0.18) * 14) : 0);
    const cx = w / 2, cy = h * 0.4, R = Math.min(w, h) * 0.22 * (0.85 + Math.min(1.2, th * F.level * 1.6 + th * 0.2) * 0.22);
    c.fillStyle = C.accent(0.12); c.beginPath(); circle(c, cx, cy, R * 1.35); c.fill();
    blob(c, F, cx, cy, R, 0.35); c.fillStyle = C.ink(0.8, 0.3); c.fill(); c.strokeStyle = C.ink(1, 0.95); c.lineWidth = 2; c.stroke();
    const ecg = (p: number) => { p = ((p % 1) + 1) % 1; return -Math.exp(-((p - 0.03) ** 2) / 0.0005) + Math.exp(-((p - 0.07) ** 2) / 0.0008) * 0.35 - Math.exp(-((p - 0.21) ** 2) / 0.0006) * 0.5 + Math.exp(-((p - 0.4) ** 2) / 0.004) * 0.12; };
    const base = h * 0.84, now = F.beats + bp, pts: [number, number][] = [];
    for (let x = 0; x <= w; x += 1.5) pts.push([x, base + ecg(now - ((w - x) / w) * 2.5) * h * 0.12]);
    c.strokeStyle = C.ink(0.9, 0.9); c.lineWidth = 1.5; line(c, pts); c.stroke();
    c.fillStyle = C.accent(1); c.beginPath(); circle(c, w - 2, base + ecg(now) * h * 0.12, 3); c.fill();
  },
  /* 9 Terrain */
  drive(c, w, h, F, C, S) {
    const hz = h * 0.46;
    const st: number[][] = (S.st ||= Array.from({ length: 40 }, (_, i) => [hash(i + 3), hash(i + 7) * 0.9, hash(i + 11)]));
    for (const s of st) { c.fillStyle = C.ink(1, 0.25 + 0.75 * Math.abs(Math.sin(F.t * 2 + s[2] * 20)) * (0.4 + F.treble)); c.fillRect(s[0] * w, s[1] * hz, 1.3, 1.3); }
    sun(c, w, hz, C, h * 0.3 * (1 + F.bass * 0.06));
    grid(c, w, h, hz, F, C, S, 1 + F.level * 3);
    knock(c, () => { c.moveTo(w / 2 - 2, hz); c.lineTo(w / 2 + 2, hz); c.lineTo(w * 0.72, h); c.lineTo(w * 0.28, h); c.closePath(); });
    c.strokeStyle = C.ink(1, 0.9); c.lineWidth = 1.5; c.beginPath(); c.moveTo(w / 2, hz); c.lineTo(w * 0.28, h); c.moveTo(w / 2, hz); c.lineTo(w * 0.72, h); c.stroke();
    c.fillStyle = C.accent(0.95);
    for (let k = 0; k < 6; k++) {
      const z = ((k + S.z * 1.3) % 6) / 6, z2 = z + 0.06, y1 = hz + (h - hz) * z * z, y2 = hz + (h - hz) * z2 * z2, wd = 1 + z * 4;
      c.fillRect(w / 2 - wd / 2, y1, wd, Math.max(1, y2 - y1));
    }
  },
  peaks(c, w, h, F, C, S) {
    S.s = (S.s || 0) + dtOf(F) * (1 + F.level * 1.5);
    for (let k = 0; k < 3; k++) {
      const base = h * (0.5 + 0.17 * k), seg = w / (7 + k * 2), scroll = S.s * (18 + 26 * k), off = scroll % seg, idx = Math.floor(scroll / seg), pts: [number, number][] = [];
      for (let j = -1; j <= Math.ceil(w / seg) + 1; j++) {
        const id = j + idx, peak = id % 2 === 0;
        const hh = peak ? (0.35 + 0.65 * hash(id * 1.7 + k * 100)) * h * (0.34 - 0.07 * k) * (0.55 + bandAt(F, (((id % 8) + 8) % 8) / 8) * 0.9) : h * 0.02 * hash(id + k);
        pts.push([j * seg - off, base - hh]);
      }
      knock(c, () => { c.moveTo(pts[0][0], h); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(pts[pts.length - 1][0], h); c.closePath(); });
      c.strokeStyle = C.ink(0.45 + 0.25 * k, 0.95); c.lineWidth = 1.2; line(c, pts);
      for (let i = 1; i < pts.length - 1; i += 2) { c.moveTo(pts[i][0], pts[i][1]); c.lineTo((pts[i - 1][0] + pts[i + 1][0]) / 2, base + h * 0.06); }
      c.stroke();
    }
  },
  /* 10 Orb */
  galaxy(c, w, h, F, C, S) {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.62;
    const g0: { arm: number; d: number; o: number }[] = (S.g ||= Array.from({ length: 280 }, (_, i) => ({ arm: i % 2, d: Math.pow(hash(i * 3.3), 0.6), o: (hash(i * 7.7) - 0.5) * 0.55 })));
    S.sp = (S.sp || 0) + dtOf(F) * (0.5 + F.level * 2.4);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.3);
    g.addColorStop(0, C.accent(0.55 * (0.5 + F.bass))); g.addColorStop(1, C.accent(0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (const p of g0) {
      const a = p.arm * Math.PI + p.d * 5.2 + p.o + S.sp / (0.35 + p.d), r = p.d * R, v = bandAt(F, p.d * 0.8);
      c.fillStyle = C.tint(0.5 + 0.5 * (1 - p.d), 0.35 + 0.65 * v, p.d * 70);
      c.beginPath(); circle(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5, 0.6 + (1 - p.d) * 1.5 + v * 1.8); c.fill();
    }
  },
  planet(c, w, h, F, C) {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.24 * (1 + F.bass * 0.12), N = 160;
    const ring = (front: boolean) => {
      c.save(); c.translate(cx, cy); c.rotate(-0.3);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + F.t * 0.35, sa = Math.sin(a);
        if (front ? sa < 0 : sa >= 0) continue;
        const r2 = R * (1.45 + ((i % 7) / 7) * 0.65 + hash(i + Math.floor(F.t * 20)) * F.treble * 0.18);
        c.fillStyle = C.ink(0.5 + 0.5 * ((i % 7) / 7), 0.9); c.fillRect(Math.cos(a) * r2 - 1, sa * r2 * 0.26 - 1, 2, 2);
      }
      c.restore();
    };
    ring(false);
    knock(c, () => circle(c, cx, cy, R));
    const g = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, C.ink(1, 1)); g.addColorStop(0.7, C.ink(0.35, 1)); g.addColorStop(1, C.ink(0.08, 1));
    c.fillStyle = g; c.beginPath(); circle(c, cx, cy, R); c.fill();
    ring(true);
    const ma = F.t * 0.9;
    c.fillStyle = C.accent(0.95); c.beginPath(); circle(c, cx + Math.cos(ma) * R * 2.3, cy + Math.sin(ma) * R * 0.5 - R * 0.4, 2.5 + F.kick * 1.5); c.fill();
  },
  /* New */
  hypno(c, w, h, F, C, S) {
    const cx = w / 2, cy = h / 2, M = Math.hypot(w, h) * 0.55 * (1 + F.kick * 0.05), TH = 7 * Math.PI;
    S.r = (S.r || 0) + dtOf(F) * (1.2 + F.level * 5);
    c.lineCap = 'round';
    for (let arm = 0; arm < 2; arm++) {
      c.strokeStyle = arm ? C.ink(0.25, 0.7) : C.ink(1, 0.95);
      let px = cx, py = cy;
      for (let t = 0.1; t <= TH; t += 0.07) {
        const r = (t / TH) * M, a = t + arm * Math.PI - S.r, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        c.lineWidth = 1 + (r / M) * 18; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
        px = x; py = y;
      }
    }
    c.fillStyle = C.accent(1); c.beginPath(); circle(c, cx, cy, 3 + F.kick * 3); c.fill();
  },
  tunnel(c, w, h, F, C, S) {
    S.z = (S.z || 0) + dtOf(F) * (0.25 + F.level * 1.1);
    const N = 18, base = Math.min(w, h) * 0.09, cx = w / 2 + Math.sin(F.t * 0.7) * w * 0.07 * (F.bass + 0.2), cy = h / 2 + Math.cos(F.t * 0.9) * h * 0.07 * (F.bass + 0.2);
    const zs: number[] = [];
    for (let i = 0; i < N; i++) zs.push(1 - ((i / N + S.z) % 1));
    zs.sort((a, b) => b - a);
    for (const zz of zs) {
      const s = base / (zz * zz + 0.04), v = bandAt(F, zz * 0.8);
      c.save(); c.translate(w / 2 + (cx - w / 2) * zz, h / 2 + (cy - h / 2) * zz); c.rotate(zz * 2.2 + F.t * 0.3 + F.treble * 0.4);
      c.strokeStyle = C.ink(0.5 + 0.5 * v, Math.min(1, (1 - zz) * 1.6) * (0.45 + 0.55 * v)); c.lineWidth = 1 + (1 - zz) * 3;
      c.strokeRect(-s / 2, -s * 0.31, s, s * 0.62); c.restore();
    }
  },
  moire(c, w, h, F, C) {
    const M = Math.hypot(w, h);
    const sets = [[w * 0.42, h / 2], [w * 0.58 + Math.cos(F.t * 0.5) * w * 0.08 * (0.4 + F.bass), h / 2 + Math.sin(F.t * 0.7) * h * 0.1 * (0.4 + F.mid)]];
    c.lineWidth = 1.6; c.strokeStyle = C.ink(1, 0.8);
    for (const [x, y] of sets) { c.beginPath(); for (let r = 5; r < M; r += 5.5) circle(c, x, y, r); c.stroke(); }
  },
  opart(c, w, h, F, C) {
    const cols = 18, rows = Math.max(6, Math.round((cols * h) / w)), lx = w / 2 + Math.sin(F.t * 0.6) * w * 0.15, ly = h / 2 + Math.cos(F.t * 0.8) * h * 0.12;
    const s = 0.35 + F.bass * 0.55, L = Math.min(w, h) * 0.5, g: [number, number][][] = [];
    for (let j = 0; j <= rows; j++) {
      const row: [number, number][] = [];
      for (let i = 0; i <= cols; i++) {
        const dx = (i / cols) * w - lx, dy = (j / rows) * h - ly, f = 1 + s * Math.exp(-(dx * dx + dy * dy) / (L * L));
        row.push([lx + dx * f, ly + dy * f]);
      }
      g.push(row);
    }
    c.fillStyle = C.ink(1, 0.95); c.beginPath();
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        if ((i + j) % 2) continue;
        const a = g[j][i], b = g[j][i + 1], d = g[j + 1][i + 1], e = g[j + 1][i];
        c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]); c.closePath();
      }
    c.fill();
  },
  drift(c, w, h, F, C, S) {
    S.r = (S.r || 0) + dtOf(F) * 0.12 * (1 + F.level * 2);
    const cols = [null, C.hue === 0 ? C.ink(0.3, 1) : `hsla(${C.hue},80%,40%,1)`, C.ink(1, 1), C.hue === 0 ? C.ink(0.65, 1) : `hsla(${(C.hue + 180) % 360},85%,${C.light ? 45 : 62}%,1)`];
    const disc = (cx: number, cy: number, R: number, dir: number) => {
      const rings = 4, seg = 20;
      for (let k = 0; k < rings; k++) {
        const r0 = R * (0.22 + (0.78 * k) / rings), r1 = R * (0.22 + (0.78 * (k + 1)) / rings) * (1 + F.kick * 0.02), d = (k % 2 ? -1 : 1) * dir, rot = S.r * d;
        for (let q = 1; q < 4; q++) {
          c.fillStyle = cols[d > 0 ? q : 4 - q] as string; c.beginPath();
          for (let s = 0; s < seg; s++) {
            const a0 = rot + ((s + q / 4) * TAU) / seg, a1 = a0 + TAU / seg / 4 + 0.002;
            c.moveTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1); c.arc(cx, cy, r1, a0, a1); c.arc(cx, cy, r0, a1, a0, true); c.closePath();
          }
          c.fill();
        }
      }
    };
    const R = Math.min(w * 0.3, h * 0.46);
    disc(w / 2, h / 2, R, 1);
    if (w > h * 1.3) { disc(w * 0.12, h * 0.3, R * 0.42, -1); disc(w * 0.88, h * 0.7, R * 0.42, -1); }
  },
  flow(c, w, h, F, C, S) {
    const dt = dtOf(F), TAIL = 8;
    type Q = { x: number[]; y: number[]; l: number; i: number };
    const ps: Q[] = (S.p ||= Array.from({ length: 300 }, (_, i) => { const x = hash(i * 1.3) * w, y = hash(i * 2.9) * h; return { x: [x, x + 0.8], y: [y, y + 0.4], l: 1 + hash(i) * 4, i }; }));
    const sp = 20 + F.level * 130;
    for (const p of ps) {
      if (dt > 0) {
        const x = p.x[p.x.length - 1], y = p.y[p.y.length - 1];
        const a = Math.sin(x * 0.008 + F.t * 0.2) * 2 + Math.cos(y * 0.011 - F.t * 0.15) * 2 + F.bass * 1.6 * Math.sin(x * 0.02 + y * 0.02 + F.t);
        p.x.push(x + Math.cos(a) * sp * dt); p.y.push(y + Math.sin(a) * sp * dt);
        if (p.x.length > TAIL) { p.x.shift(); p.y.shift(); }
        p.l -= dt;
        const nx = p.x[p.x.length - 1], ny = p.y[p.y.length - 1];
        if (p.l < 0 || nx < 0 || nx > w || ny < 0 || ny > h) { const rx = Math.random() * w, ry = Math.random() * h; p.x = [rx, rx + 0.8]; p.y = [ry, ry + 0.4]; p.l = 2 + Math.random() * 4; }
      }
    }
    c.lineWidth = 1.2; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = C.tint(0.6 + 0.2 * k, 0.7, k * 40); c.beginPath();
      for (const p of ps) { if (p.i % 3 !== k || p.x.length < 2) continue; c.moveTo(p.x[0], p.y[0]); for (let j = 1; j < p.x.length; j++) c.lineTo(p.x[j], p.y[j]); }
      c.stroke();
    }
  },
  harmono(c, w, h, F, C) {
    const cx = w / 2, cy = h / 2, ax = w * 0.4 * (0.7 + F.bass * 0.4), ay = h * 0.42 * (0.7 + F.mid * 0.4), d = 0.02 * Math.sin(F.t * 0.2), p = F.t * 0.4, N = 1000;
    c.lineWidth = 1;
    for (let ch = 0; ch < 4; ch++) {
      c.beginPath();
      for (let i = (ch * N) / 4; i <= ((ch + 1) * N) / 4; i++) {
        const s = (i / N) * TAU * 7, dec = Math.exp(-s * 0.035);
        const x = cx + (Math.sin(3 * s + p) * ax + Math.sin(5 * s) * F.treble * 0.1 * ax) * dec;
        const y = cy + (Math.sin((2 + d) * s) * ay + Math.cos(7 * s + p) * F.treble * 0.06 * ay) * dec;
        if (i === (ch * N) / 4) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = C.tint(1 - ch * 0.18, 0.9 - ch * 0.18, ch * 30); c.stroke();
    }
  },
  kaleido(c, w, h, F, C) {
    const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2, seg = 12, wedge = TAU / seg;
    for (let i = 0; i < seg; i++) {
      c.save(); c.translate(cx, cy); c.rotate(i * wedge + F.t * 0.1); if (i % 2) c.scale(1, -1);
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, -0.001, wedge / 2 + 0.004); c.closePath(); c.clip();
      for (let k = 0; k < 7; k++) {
        const v = bandAt(F, k / 7), d = R * (0.1 + k * 0.13) + Math.sin(F.t * (0.5 + k * 0.2)) * R * 0.05, ang = (0.5 + 0.5 * Math.sin(F.t * 0.7 + k)) * (wedge / 2);
        c.fillStyle = C.tint(0.4 + 0.6 * v, 0.85, k * 35); c.beginPath(); circle(c, Math.cos(ang) * d, Math.sin(ang) * d, 2 + v * R * 0.07); c.fill();
      }
      const a2 = (0.5 + 0.5 * Math.sin(F.t * 0.4)) * (wedge / 2);
      c.strokeStyle = C.ink(0.7, 0.35); c.lineWidth = 1; c.beginPath(); c.moveTo(R * 0.05, 0); c.lineTo(Math.cos(a2) * R, Math.sin(a2) * R); c.stroke();
      c.restore();
    }
  },
  halftone(c, w, h, F, C) {
    const sp = 11, cx = w / 2 + Math.sin(F.t * 0.4) * w * 0.2, cy = h / 2 + Math.cos(F.t * 0.3) * h * 0.2, md = Math.hypot(w, h) * 0.7;
    c.fillStyle = C.ink(1, 0.95); c.beginPath();
    for (let y = sp / 2; y < h; y += sp)
      for (let x = ((y / sp) | 0) % 2 ? sp : sp / 2; x < w; x += sp) {
        const d = Math.hypot(x - cx, y - cy), v = 0.5 + 0.5 * Math.sin(d * 0.06 - F.t * 4);
        const r = sp * 0.52 * Math.min(1, v * (0.2 + F.bass * 0.9) + bandAt(F, d / md) * 0.55);
        if (r > 0.4) circle(c, x, y, r);
      }
    c.fill();
  },
  chladni(c, w, h, F, C, S) {
    const MODES = [[1, 2], [2, 3], [1, 4], [3, 5], [2, 5], [4, 5], [3, 4], [1, 3]];
    const p: Float32Array = (S.p ||= Float32Array.from({ length: 1800 }, (_, i) => hash(i * 0.77 + 3)));
    const [n, m] = MODES[Math.floor(F.bar / 2) % MODES.length], PI = Math.PI, k = F.dt > 0 ? 0.04 * (0.35 + F.level * 1.4) : 0;
    c.fillStyle = C.ink(1, 0.95); c.beginPath();
    for (let i = 0; i < 1800; i += 2) {
      let x = p[i], y = p[i + 1];
      const f = Math.abs(Math.cos(n * PI * x) * Math.cos(m * PI * y) - Math.cos(m * PI * x) * Math.cos(n * PI * y));
      x = Math.min(1, Math.max(0, x + (Math.random() - 0.5) * f * k * 2)); y = Math.min(1, Math.max(0, y + (Math.random() - 0.5) * f * k * 2));
      p[i] = x; p[i + 1] = y; c.rect(x * w, y * h, 1.5, 1.5);
    }
    c.fill();
  },

  /* ── Theme styles ── */
  paper(c, w, h, F, C) {
    // Light: cut-paper layers with a soft shadow under each sheet.
    const L = 5;
    for (let k = 0; k < L; k++) {
      const base = h * (0.35 + k * 0.14), pts: [number, number][] = [];
      for (let x = -4; x <= w + 4; x += 6) {
        const v = bandAt(F, (x / w) * 0.7 + k * 0.05);
        pts.push([x, base - v * h * 0.22 - Math.sin(x * 0.02 + F.t * (0.4 + k * 0.15) + k) * h * 0.04]);
      }
      const shape = (dy: number) => { c.beginPath(); c.moveTo(-4, h); pts.forEach((p) => c.lineTo(p[0], p[1] + dy)); c.lineTo(w + 4, h); c.closePath(); };
      shape(3); c.fillStyle = 'rgba(0,0,0,0.14)'; c.fill();
      const t = k / (L - 1);
      c.fillStyle = C.hue === 0 ? (C.light ? `rgb(${238 - t * 150},${236 - t * 150},${232 - t * 150})` : `rgb(${40 + t * 170},${40 + t * 170},${44 + t * 170})`) : `hsla(${C.hue},55%,${C.light ? 86 - t * 50 : 20 + t * 45}%,1)`;
      shape(0); c.fill();
    }
    c.fillStyle = C.accent(0.9); c.beginPath(); circle(c, w * 0.8, h * 0.2, 6 + F.kick * 4); c.fill();
  },
  warp(c, w, h, F, C, S) {
    // Cosmic: stars streak past, faster as the song builds.
    const dt = dtOf(F), cx = w / 2, cy = h / 2;
    const st: { x: number; y: number; z: number }[] = (S.s ||= Array.from({ length: 170 }, (_, i) => ({ x: hash(i) * 2 - 1, y: hash(i + 99) * 2 - 1, z: hash(i + 7) })));
    for (const [hx, hy, sh] of [[0.3, 0.35, 0], [0.72, 0.65, 60]]) {
      const g = c.createRadialGradient(w * hx, h * hy, 0, w * hx, h * hy, Math.min(w, h) * 0.5);
      g.addColorStop(0, C.sig(260 + sh, 0.6, 0.18 + F.bass * 0.25)); g.addColorStop(1, C.sig(260 + sh, 0.4, 0));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    const sp = 0.15 + F.level * 1.6, sc = Math.max(w, h) * 0.5;
    c.lineCap = 'round';
    for (const s of st) {
      s.z -= dt * sp;
      if (s.z <= 0.02) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; }
      const z2 = Math.min(1, s.z + 0.02 + sp * 0.05);
      const x1 = cx + (s.x / s.z) * sc * 0.3, y1 = cy + (s.y / s.z) * sc * 0.3, x2 = cx + (s.x / z2) * sc * 0.3, y2 = cy + (s.y / z2) * sc * 0.3;
      c.strokeStyle = C.hue === 0 ? `rgba(255,255,255,${Math.min(1, (1 - s.z) * 1.3)})` : C.ink(1, Math.min(1, (1 - s.z) * 1.3));
      c.lineWidth = 0.6 + (1 - s.z) * 2; c.beginPath(); c.moveTo(x2, y2); c.lineTo(x1, y1); c.stroke();
    }
  },
  haze(c, w, h, F, C) {
    // Hazy Nights: neon smoke ribbons over a ringed sun.
    const sunR = Math.min(w, h) * 0.26 * (1 + F.kick * 0.06);
    for (let k = 0; k < 5; k++) { c.strokeStyle = C.sig(320 - k * 12, 0.8, 0.9 - k * 0.15); c.lineWidth = 2; c.beginPath(); circle(c, w / 2, h * 0.45, sunR + k * 7 + F.bass * k * 4); c.stroke(); }
    for (let k = 0; k < 5; k++) {
      const base = h * (0.3 + k * 0.13), thick = h * (0.06 + bandAt(F, k / 5) * 0.14), top: [number, number][] = [], bot: [number, number][] = [];
      for (let x = 0; x <= w; x += 5) {
        const y = base + Math.sin(x * 0.012 + F.t * (0.5 + k * 0.17) + k * 1.3) * h * 0.06 + Math.sin(x * 0.03 - F.t) * h * 0.015;
        const t = thick * (0.6 + 0.4 * Math.sin(x * 0.02 + F.t * 0.8 + k));
        top.push([x, y - t]); bot.push([x, y + t]);
      }
      const g = c.createLinearGradient(0, base - thick * 1.5, 0, base + thick * 1.5);
      g.addColorStop(0, C.sig(290 - k * 15, 0.7, 0)); g.addColorStop(0.5, C.sig(300 - k * 15, 0.75, 0.35)); g.addColorStop(1, C.sig(290 - k * 15, 0.7, 0));
      c.fillStyle = g; line(c, top.concat(bot.reverse())); c.closePath(); c.fill();
    }
  },
  swarm(c, w, h, F, C, S) {
    // Swarms: a flock chasing a wandering point, scattering on each kick.
    const dt = dtOf(F);
    const b: { x: number; y: number; vx: number; vy: number }[] = (S.b ||= Array.from({ length: 150 }, (_, i) => ({ x: hash(i) * w, y: hash(i + 5) * h, vx: 0, vy: 0 })));
    const tx = w / 2 + Math.sin(F.t * 0.7) * w * 0.33, ty = h / 2 + Math.sin(F.t * 1.1) * h * 0.3;
    for (const q of b) {
      if (dt > 0) {
        let ax = (tx - q.x) * 2.2, ay = (ty - q.y) * 2.2;
        ax += Math.sin(q.y * 0.04 + F.t * 2 + q.vx * 0.01) * 170; ay += Math.cos(q.x * 0.04 + F.t * 2) * 170;
        if (F.beatHit) { const dx = q.x - tx, dy = q.y - ty, d = Math.hypot(dx, dy) + 1, f = 150 * (0.4 + F.bass); q.vx += (dx / d) * f; q.vy += (dy / d) * f; }
        q.vx = (q.vx + ax * dt) * Math.pow(0.2, dt); q.vy = (q.vy + ay * dt) * Math.pow(0.2, dt);
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.x < -30 || q.x > w + 30 || q.y < -30 || q.y > h + 30) { q.x = tx + (Math.random() - 0.5) * 40; q.y = ty + (Math.random() - 0.5) * 40; q.vx = q.vy = 0; }
      }
    }
    for (let k = 0; k < 2; k++) {
      c.fillStyle = C.sig(175 + k * 20, 0.7 + k * 0.3, 0.9); c.beginPath();
      b.forEach((q, i) => {
        if (i % 2 !== k) return;
        const a = Math.atan2(q.vy, q.vx), s = 3 + F.level * 2, ca = Math.cos(a), sa = Math.sin(a);
        c.moveTo(q.x + ca * s, q.y + sa * s); c.lineTo(q.x - ca * s - sa * s * 0.45, q.y - sa * s + ca * s * 0.45); c.lineTo(q.x - ca * s + sa * s * 0.45, q.y - sa * s - ca * s * 0.45); c.closePath();
      });
      c.fill();
    }
  },
  lava(c, w, h, F, C) {
    // Lava Lamp: wax rising and falling inside a glass lamp.
    const lw = Math.min(w * 0.36, h * 0.5), lx = w / 2 - lw / 2, top = h * 0.06, bot = h * 0.94;
    const gw = 26, gh = 40, cw = lw / gw, ch = (bot - top) / gh, lv = [F.bass, F.mid, F.treble, F.level, F.bass];
    const balls: number[][] = [];
    for (let k = 0; k < 5; k++) {
      const cyc = (Math.sin(F.t * (0.22 + k * 0.05) + k * 1.9) + 1) / 2;
      balls.push([gw * (0.3 + 0.4 * hash(k + 1)) + Math.sin(F.t * 0.5 + k) * 3, gh * (0.12 + 0.76 * cyc), (gw * (0.13 + lv[k] * 0.1)) ** 2]);
    }
    const field = (x: number, y: number) => { let f = y > gh - 2 ? 1.5 : 0; for (const q of balls) { const dx = x - q[0], dy = (y - q[1]) * 0.8; f += q[2] / (dx * dx + dy * dy + 0.5); } return f; };
    c.save(); c.translate(lx, top);
    c.fillStyle = C.sig(15, 0.75, 0.95); metaballs(c, gw, gh, cw, ch, field, 1);
    c.fillStyle = C.sig(40, 1, 0.85); metaballs(c, gw, gh, cw, ch, field, 2.4);
    c.restore();
    c.strokeStyle = C.sig(20, 0.5, 0.6); c.lineWidth = 2;
    c.beginPath(); c.moveTo(lx + lw * 0.2, top); c.lineTo(lx + lw * 0.8, top); c.lineTo(lx + lw, bot); c.lineTo(lx, bot); c.closePath(); c.stroke();
    c.fillStyle = C.sig(20, 0.3, 0.8);
    c.beginPath(); c.moveTo(lx - 6, bot); c.lineTo(lx + lw + 6, bot); c.lineTo(lx + lw * 0.85, h); c.lineTo(lx + lw * 0.15, h); c.closePath(); c.fill();
  },
  snow(c, w, h, F, C, S) {
    // Winter: snowfall that gusts on the bass and drifts into the spectrum.
    const dt = dtOf(F);
    const fl: { x: number; y: number; z: number; p: number }[] = (S.f ||= Array.from({ length: 140 }, (_, i) => ({ x: hash(i) * w, y: hash(i + 3) * h, z: 0.3 + hash(i + 9) * 0.7, p: hash(i + 13) * 6 })));
    S.wind = (S.wind || 0) * Math.pow(0.4, dt) + (F.beatHit ? 60 * F.bass : 0);
    const ice = (k: number, a: number) => (C.hue === 0 ? `rgba(${230 + k * 25},${240 + k * 15},255,${a})` : C.ink(k, a));
    c.fillStyle = ice(1, 0.95); c.beginPath();
    for (const q of fl) {
      q.y += dt * (18 + q.z * 30) * (0.7 + F.level); q.x += dt * (Math.sin(F.t * 0.8 + q.p) * 12 + S.wind) * q.z;
      if (q.y > h) { q.y = -4; q.x = Math.random() * w; }
      if (q.x > w + 4) q.x -= w + 8; if (q.x < -4) q.x += w + 8;
      circle(c, q.x, q.y, 0.6 + q.z * 1.8);
    }
    c.fill();
    const g = c.createLinearGradient(0, h * 0.6, 0, h);
    g.addColorStop(0, ice(1, 0.85)); g.addColorStop(1, ice(0.7, 0.55));
    c.fillStyle = g; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) { const u = 0.2 + (x / w) * 0.5, v = (bandAt(F, u) + bandAt(F, u + 0.04) + bandAt(F, u - 0.04)) / 3; c.lineTo(x, h - h * 0.06 - v * h * 0.08 - Math.sin(x * 0.03 + 1) * 3 - Math.sin(x * 0.011) * 5); }
    c.lineTo(w, h); c.closePath(); c.fill();
  },
  hud(c, w, h, F, C, S) {
    // War: a targeting HUD. Tick ring follows the spectrum, a lock box fires on each kick.
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34, dt = dtOf(F);
    S.rot = (S.rot || 0) + dt * 0.4;
    c.strokeStyle = C.accent(0.9); c.lineWidth = 1.5; c.beginPath(); circle(c, cx, cy, R); c.stroke();
    c.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU + S.rot, v = bandAt(F, (i < 36 ? i : 72 - i) / 36 * 0.85), l = 3 + v * R * 0.35;
      c.moveTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3)); c.lineTo(cx + Math.cos(a) * (R + 3 + l), cy + Math.sin(a) * (R + 3 + l));
    }
    c.lineWidth = 2; c.stroke();
    c.strokeStyle = C.ink(0.8, 0.8); c.lineWidth = 1; c.beginPath();
    c.moveTo(cx - R * 0.6, cy); c.lineTo(cx - R * 0.15, cy); c.moveTo(cx + R * 0.15, cy); c.lineTo(cx + R * 0.6, cy);
    c.moveTo(cx, cy - R * 0.6); c.lineTo(cx, cy - R * 0.15); c.moveTo(cx, cy + R * 0.15); c.lineTo(cx, cy + R * 0.6); c.stroke();
    const k = F.kick, s = R * (0.3 + (1 - k) * 0.5);
    c.strokeStyle = C.accent(0.3 + k * 0.7); c.lineWidth = 2; c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(cx + sx * s, cy + sy * s * 0.6); c.lineTo(cx + sx * s, cy + sy * s); c.lineTo(cx + sx * s * 0.6, cy + sy * s); }
    c.stroke();
    const meter = (x: number, v: number) => { for (let i = 0; i < 10; i++) { c.fillStyle = i < v * 10 ? C.accent(0.9) : C.ink(0.3, 0.2); c.fillRect(x, h * 0.85 - i * (h * 0.07), 8, h * 0.05); } };
    meter(w * 0.06, F.bass); meter(w * 0.94 - 8, F.treble);
    const sy = ((F.t * 0.35) % 1) * h;
    c.fillStyle = C.accent(0.12); c.fillRect(0, sy, w, 2);
    c.strokeStyle = C.ink(0.6, 0.6); c.lineWidth = 1.5; c.beginPath();
    for (const [x, y, dx, dy] of [[6, 6, 1, 1], [w - 6, 6, -1, 1], [w - 6, h - 6, -1, -1], [6, h - 6, 1, -1]]) { c.moveTo(x + dx * 14, y); c.lineTo(x, y); c.lineTo(x, y + dy * 14); }
    c.stroke();
  },
  neoncity(c, w, h, F, C, S) {
    // Osaka: a skyline whose windows light up with the music.
    const hz = h * 0.9;
    c.fillStyle = C.sig(320, 0.8, 0.9); c.beginPath(); circle(c, w * 0.78, h * 0.22, Math.min(w, h) * 0.08 * (1 + F.kick * 0.1)); c.fill();
    const bs: number[][] = (S.b ||= (() => { const out: number[][] = []; let x = 0, i = 0; while (x < 1) { const bw = 0.04 + hash(i * 3.1) * 0.06; out.push([x, bw, 0.25 + hash(i * 5.7) * 0.5, i]); x += bw + 0.004; i++; } return out; })());
    for (const [x0, bw, bh0, i] of bs) {
      const u = x0 + bw / 2, v = bandAt(F, (Math.abs(u - 0.5) * 2) * 0.8), bh = (bh0 + v * 0.18) * h * 0.85, x = x0 * w, bwp = bw * w;
      knock(c, () => c.rect(x, hz - bh, bwp, bh));
      c.fillStyle = C.sig(265, 0.12, 0.9); c.fillRect(x, hz - bh, bwp, bh);
      c.fillStyle = C.sig(330, 1, 0.95); c.fillRect(x, hz - bh, bwp, 1.5);
      const cols = Math.max(1, Math.floor(bwp / 6)), rows = Math.floor(bh / 7);
      c.fillStyle = C.sig(i % 3 ? 45 : 190, 0.85, 0.9); c.beginPath();
      for (let r = 1; r < rows; r++) for (let q = 0; q < cols; q++) if (hash(i * 31 + r * 7 + q + Math.floor(F.beats / 2) * 0.13) < v * 1.1 - 0.05) c.rect(x + 2 + q * 6, hz - bh + r * 7, 3, 3);
      c.fill();
    }
    c.fillStyle = C.sig(330, 0.9, 0.9); c.fillRect(0, hz, w, 1.5);
    for (let y = hz + 4; y < h; y += 4) { c.fillStyle = C.sig(320, 0.7, 0.25 * (1 - (y - hz) / (h - hz))); c.fillRect(w * 0.1 + Math.sin(y + F.t * 3) * 6, y, w * 0.8, 1); }
  },
  ocean(c, w, h, F, C) {
    // Island: sunset over rolling waves, with the sun's glitter on the water.
    const hz = h * 0.52, R = Math.min(w, h) * 0.24;
    c.save(); c.beginPath(); c.rect(0, 0, w, hz); c.clip();
    const g = c.createLinearGradient(0, hz - R, 0, hz);
    g.addColorStop(0, C.sig(40, 0.95, 1)); g.addColorStop(1, C.sig(350, 0.75, 1));
    c.fillStyle = g; c.beginPath(); circle(c, w / 2, hz + R * 0.2, R * (1 + F.bass * 0.04)); c.fill(); c.restore();
    c.fillStyle = C.sig(35, 1, 0.9);
    for (let y = hz + 3; y < h; y += 5) { const t = (y - hz) / (h - hz), ww = R * (0.8 - t * 0.5) * (0.6 + F.treble * 0.6) * (0.6 + 0.4 * Math.sin(y * 0.7 + F.t * 6)); if (ww > 1) c.fillRect(w / 2 - ww / 2, y, ww, 1.5); }
    for (let k = 0; k < 4; k++) {
      const base = hz + (h - hz) * (0.15 + k * 0.25), amp = h * (0.02 + k * 0.012) * (0.5 + (k % 2 ? F.mid : F.bass) * 1.4), pts: [number, number][] = [];
      for (let x = -6; x <= w + 6; x += 5) pts.push([x, base + Math.sin(x * (0.03 - k * 0.004) - F.t * (1 + k * 0.4) + k) * amp]);
      knock(c, () => { c.moveTo(-6, h); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(w + 6, h); c.closePath(); });
      c.fillStyle = C.sig(195 - k * 8, 0.25 + k * 0.12, 0.55 + k * 0.1); c.beginPath(); c.moveTo(-6, h); pts.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(w + 6, h); c.closePath(); c.fill();
      c.strokeStyle = C.sig(180, 0.95, 0.8); c.lineWidth = 1.3; line(c, pts); c.stroke();
    }
  },
  coderain(c, w, h, F, C, S) {
    // Hacker: columns of pixel glyphs falling at the speed of their band.
    const cell = 9, cols = Math.floor(w / cell), rows = Math.ceil(h / cell) + 12, dt = dtOf(F);
    const y: Float32Array = (S.y && S.y.length === cols) ? S.y : (S.y = Float32Array.from({ length: cols }, (_, i) => hash(i) * rows));
    const G = [0x7b6f, 0x2c97, 0x73e7, 0x79cf, 0x5bc9, 0x6b5b, 0x4f92, 0x3aea, 0x55d5, 0x1f93, 0x7497, 0x2ed4];
    const green = (k: number, a: number) => (C.hue === 0 ? `rgba(${Math.round(57 + k * 150)},255,${Math.round(136 + k * 100)},${a})` : C.ink(k, a));
    const buckets: [number, number, number][][] = [[], [], []];
    for (let i = 0; i < cols; i++) {
      const v = bandAt(F, (i / cols) * 0.85);
      y[i] += dt * (4 + v * 26);
      if (y[i] > rows) y[i] = -Math.random() * 8;
      const head = Math.floor(y[i]);
      for (let t = 0; t < 12; t++) { const r = head - t; if (r < 0 || r * cell > h) continue; buckets[t === 0 ? 0 : t < 5 ? 1 : 2].push([i, r, Math.floor(hash(i * 13 + r * 7 + Math.floor(F.t * 6)) * G.length)]); }
    }
    buckets.forEach((list, b) => {
      c.fillStyle = green(b === 0 ? 1 : b === 1 ? 0.55 : 0.3, b === 0 ? 1 : b === 1 ? 0.85 : 0.45); c.beginPath();
      for (const [i, r, gi] of list) { const bits = G[gi]; for (let p = 0; p < 15; p++) if (bits & (1 << p)) c.rect(i * cell + 1 + (p % 3) * 2, r * cell + Math.floor(p / 3) * 1.6, 1.6, 1.3); }
      c.fill();
    });
  },
  glitch(c, w, h, F, C) {
    // Horror: TV static, a red pulse on each kick, and a waveform that tears.
    c.fillStyle = C.ink(0.8, 0.28 + F.level * 0.2); c.beginPath();
    for (let i = 0; i < 420; i++) { const x = Math.random() * w, y = Math.random() * h; c.rect(x, y, 1 + Math.random() * 3, 1); }
    c.fill();
    const red = (a: number) => (C.hue === 0 ? `rgba(255,43,43,${a})` : C.accent(a));
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, red(0)); g.addColorStop(1, red(0.15 + F.kick * 0.45));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const mid = h / 2, slices = 7;
    for (let s = 0; s < slices; s++) {
      const y0 = (s / slices) * h, y1 = ((s + 1) / slices) * h, off = F.kick > 0.4 && hash(s + F.beats * 3) > 0.5 ? (hash(s * 7 + F.beats) - 0.5) * 40 * F.kick : 0;
      c.save(); c.beginPath(); c.rect(0, y0, w, y1 - y0); c.clip(); c.translate(off, 0);
      const pts: [number, number][] = [];
      for (let j = 0; j < 128; j++) pts.push([(j / 127) * w, mid + F.wave[j] * h * 0.4]);
      c.strokeStyle = red(0.95); c.lineWidth = 2; line(c, pts); c.stroke();
      c.strokeStyle = C.ink(1, 0.5); c.lineWidth = 1; c.translate(2, 0); line(c, pts); c.stroke();
      c.restore();
    }
    if (F.kick > 0.6) { c.fillStyle = C.ink(1, 0.08 * F.kick); c.fillRect(0, hash(F.beats) * h, w, h * 0.08); }
  },
  fireflies(c, w, h, F, C, S) {
    // Jungle: vines sway from the canopy and fireflies blink on the hi-hats.
    for (let k = 0; k < 6; k++) {
      const x0 = w * (0.08 + k * 0.17), len = h * (0.35 + bandAt(F, k / 6) * 0.5), pts: [number, number][] = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([x0 + Math.sin(F.t * 0.9 + k * 1.3 + t * 2) * 14 * t, t * len]); }
      c.strokeStyle = C.sig(110, 0.45, 0.9, 55); c.lineWidth = 2; line(c, pts); c.stroke();
      c.fillStyle = C.sig(100 + k * 6, 0.6, 0.9, 60); c.beginPath();
      for (let i = 2; i <= 16; i += 2) { const [x, y] = pts[i]; c.ellipse(x + (i % 4 ? 4 : -4), y, 4, 2, i % 4 ? 0.5 : -0.5, 0, TAU); }
      c.fill();
    }
    const ff: { x: number; y: number; p: number; lit: number }[] = (S.f ||= Array.from({ length: 36 }, (_, i) => ({ x: hash(i) * w, y: (0.2 + hash(i + 4) * 0.8) * h, p: hash(i + 8) * 9, lit: 0 })));
    const dt = dtOf(F);
    for (const q of ff) {
      if ((F.hatHit && Math.random() < 0.3) || (F.dt > 0 && Math.random() < F.dt * 0.6)) q.lit = 1;
      q.lit = Math.max(0, q.lit - dt * 1.6);
      q.x += dt * Math.sin(F.t * 0.6 + q.p) * 10; q.y += dt * Math.cos(F.t * 0.5 + q.p) * 8;
      const a = 0.3 + q.lit * 0.7, r = 1.8 + q.lit * 2.5;
      const g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4);
      g.addColorStop(0, C.sig(48, 0.95, a)); g.addColorStop(1, C.sig(48, 0.95, 0));
      c.fillStyle = g; c.fillRect(q.x - r * 4, q.y - r * 4, r * 8, r * 8);
      c.fillStyle = C.sig(55, 1, a); c.beginPath(); circle(c, q.x, q.y, r * 0.6); c.fill();
    }
  },
};

/* Shared pieces used by more than one painter. */
function blob(c: Ctx2D, F: AudioFrame, cx: number, cy: number, R: number, amp: number) {
  const n = 64, rs: number[] = [];
  for (let i = 0; i < n; i++) { const x = i < n / 2 ? i / (n / 2) : (n - i) / (n / 2); rs.push(R * (0.75 + bandAt(F, x * 0.8) * amp)); }
  const sm = rs.map((r, i) => (rs[(i + n - 1) % n] + 2 * r + rs[(i + 1) % n]) / 4);
  const pt = (i: number) => { const a = (i / n) * TAU - Math.PI / 2; return [cx + Math.cos(a) * sm[i % n], cy + Math.sin(a) * sm[i % n]]; };
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pt(i), q = pt(i + 1), mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i) c.quadraticCurveTo(p[0], p[1], mx, my); else c.moveTo(mx, my);
  }
  c.closePath();
}
function sun(c: Ctx2D, w: number, hz: number, C: Palette, r: number) {
  const g = c.createLinearGradient(0, hz - r, 0, hz);
  g.addColorStop(0, C.accent(0.95)); g.addColorStop(1, C.ink(0.6, 0.7));
  c.save(); c.beginPath(); c.rect(0, 0, w, hz); c.clip();
  c.fillStyle = g; c.beginPath(); circle(c, w / 2, hz, r); c.fill();
  knock(c, () => { for (let k = 0; k < 5; k++) { const y = hz - r * 0.08 - k * r * 0.14, th = (5 - k) * r * 0.022; c.rect(w / 2 - r, y - th, r * 2, th); } });
  c.restore();
}
function grid(c: Ctx2D, w: number, h: number, hz: number, F: AudioFrame, C: Palette, S: State, speed: number) {
  S.z = (S.z || 0) + dtOf(F) * speed;
  c.strokeStyle = C.ink(0.8, 0.7); c.lineWidth = 1;
  for (let r = 0; r < 12; r++) {
    const z = (r + (S.z % 1)) / 12, y = hz + (h - hz) * z * z;
    c.beginPath();
    for (let x = 0; x <= w; x += 4) { const yy = y - bandAt(F, Math.abs(x / w - 0.5) * 1.6) * h * 0.12 * z; if (x) c.lineTo(x, yy); else c.moveTo(x, yy); }
    c.stroke();
  }
  c.beginPath();
  for (let k = -10; k <= 10; k++) { c.moveTo(w / 2, hz); c.lineTo(w / 2 + k * w * 0.12, h); }
  c.strokeStyle = C.ink(0.6, 0.35); c.stroke();
}

/**
 * Paint one frame of an extra style. The caller has already cleared the
 * surface and scaled it so one unit is one CSS pixel; `w`/`h` are CSS pixels.
 */
export function drawExtra(style: ExtraStyle, c: Ctx2D, w: number, h: number, F: AudioFrame, C: Palette, state: State) {
  c.save();
  try {
    P[style](c, w, h, F, C, state);
  } finally {
    c.restore();
  }
}
