import type { ClipAnimationKind, ClipShadow, MediaClip, TextBackground, TextClip, TextStroke, Track } from "./types";

export interface CaptionWord { text: string; start: number; end: number }

export const CAPTION_STYLES = ["classic", "boxed", "bold", "wordpop", "rapid", "beast", "stacked", "serif", "bubble"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  classic: "Classic", boxed: "Boxed", bold: "Bold", wordpop: "Word Pop", rapid: "Rapid Reveal",
  beast: "Beast Mode", stacked: "Stacked", serif: "Serif", bubble: "Bubble",
};

export function isCaptionStyle(value: unknown): value is CaptionStyle {
  return typeof value === "string" && (CAPTION_STYLES as readonly string[]).includes(value);
}

interface CaptionLook {
  /** Words per caption and the longest a caption may stay on screen. */
  maxWords: number; maxSeconds: number;
  fontFamily: string; fontSize: number; fontWeight: number;
  /** Colours cycle caption by caption. */
  colors: string[];
  uppercase?: boolean; letterSpacing?: number; y: number;
  stroke: TextStroke | null; background: TextBackground | null; shadow?: ClipShadow | null;
  animateIn?: ClipAnimationKind; animateSeconds?: number;
}

const BLACK_STROKE = (width: number): TextStroke => ({ color: "#000000", width });
const SOFT_SHADOW: ClipShadow = { color: "#000000", opacity: 0.55, blur: 18, offsetX: 0, offsetY: 4 };

const LOOKS: Record<CaptionStyle, CaptionLook> = {
  classic: { maxWords: 5, maxSeconds: 2.6, fontFamily: "'Montserrat', sans-serif", fontSize: 64, fontWeight: 800, colors: ["#ffffff"], y: 0.84, stroke: BLACK_STROKE(8), background: null },
  boxed: { maxWords: 5, maxSeconds: 2.6, fontFamily: "'Montserrat', sans-serif", fontSize: 64, fontWeight: 800, colors: ["#ffffff"], y: 0.84, stroke: null, background: { color: "#000000", opacity: 0.75, padding: 18, radius: 12 } },
  bold: { maxWords: 5, maxSeconds: 2.6, fontFamily: "'Montserrat', sans-serif", fontSize: 78, fontWeight: 800, colors: ["#f9ee58"], y: 0.84, stroke: BLACK_STROKE(8), background: null, animateIn: "pop", animateSeconds: 0.12 },
  wordpop: { maxWords: 1, maxSeconds: 1.2, fontFamily: "'Montserrat', sans-serif", fontSize: 92, fontWeight: 900, colors: ["#ffffff"], uppercase: true, y: 0.72, stroke: BLACK_STROKE(10), background: null, shadow: SOFT_SHADOW, animateIn: "pop", animateSeconds: 0.1 },
  rapid: { maxWords: 2, maxSeconds: 0.9, fontFamily: "'Anton', sans-serif", fontSize: 104, fontWeight: 400, colors: ["#ffffff", "#f9ee58"], uppercase: true, letterSpacing: 2, y: 0.7, stroke: BLACK_STROKE(9), background: null, animateIn: "zoom-in", animateSeconds: 0.08 },
  beast: { maxWords: 3, maxSeconds: 1.4, fontFamily: "'Montserrat', sans-serif", fontSize: 96, fontWeight: 900, colors: ["#ffffff", "#f9ee58", "#4ade80"], uppercase: true, y: 0.68, stroke: BLACK_STROKE(14), background: null, shadow: SOFT_SHADOW, animateIn: "bounce", animateSeconds: 0.16 },
  stacked: { maxWords: 3, maxSeconds: 1.6, fontFamily: "'Montserrat', sans-serif", fontSize: 72, fontWeight: 800, colors: ["#ffffff"], uppercase: true, y: 0.78, stroke: null, background: null, shadow: SOFT_SHADOW, animateIn: "rise", animateSeconds: 0.18 },
  serif: { maxWords: 6, maxSeconds: 2.8, fontFamily: "'DM Serif Display', serif", fontSize: 70, fontWeight: 400, colors: ["#f4ecd8"], y: 0.82, stroke: null, background: null, shadow: SOFT_SHADOW, animateIn: "fade", animateSeconds: 0.2 },
  bubble: { maxWords: 4, maxSeconds: 2.2, fontFamily: "'Montserrat', sans-serif", fontSize: 62, fontWeight: 800, colors: ["#ffffff"], y: 0.8, stroke: null, background: { color: "#ff4fa0", opacity: 1, padding: 22, radius: 44 }, animateIn: "pop", animateSeconds: 0.14 },
};

export function groupWords(words: CaptionWord[], maxWords = 5, maxSeconds = 2.6): CaptionWord[] {
  const lines: CaptionWord[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (cur.length) lines.push({ text: cur.map((w) => w.text).join(" "), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    if (!w.text.trim() || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end <= w.start) continue;
    const prev = cur[cur.length - 1];
    if (cur.length && (cur.length >= maxWords || w.end - cur[0].start > maxSeconds || (prev && w.start - prev.end > 0.6))) flush();
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  return lines;
}

/** Convert speech timestamps to ordinary editable text layers without overlaps. */
export function captionLayers(clip: MediaClip, words: CaptionWord[], id: () => string, style: CaptionStyle = "classic") {
  const look = LOOKS[style] ?? LOOKS.classic;
  const lines = groupWords(words, look.maxWords, look.maxSeconds);
  const track: Track = { id: id(), kind: "text", name: "Captions", role: "captions", hidden: false, muted: false };
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  const clips: TextClip[] = [];
  lines.forEach((line, i) => {
    const start = clip.start + Math.max(0, line.start) / speed;
    const next = lines[i + 1] ? clip.start + lines[i + 1].start / speed : Infinity;
    const end = Math.min(clip.start + clip.duration, clip.start + line.end / speed + 0.15, next);
    if (end - start < 0.01) return;
    const text: TextClip = {
      id: id(), trackId: track.id, kind: "text", trimIn: 0, start, duration: end - start,
      text: look.uppercase ? line.text.replace(/[.,]+$/, "") : line.text, fontFamily: look.fontFamily, fontSize: look.fontSize,
      fontWeight: look.fontWeight, color: look.colors[clips.length % look.colors.length], align: "centre", x: 0.5, y: look.y, maxWidth: 0.9, maxHeight: 0.28,
      stroke: look.stroke, background: look.background,
      animateIn: look.animateIn ? { kind: look.animateIn, duration: Math.min(look.animateSeconds ?? 0.12, (end - start) / 2) } : undefined,
    };
    if (look.uppercase) text.uppercase = true;
    if (look.letterSpacing) text.letterSpacing = look.letterSpacing;
    if (look.shadow) text.shadow = look.shadow;
    clips.push(text);
  });
  return { track, clips };
}
