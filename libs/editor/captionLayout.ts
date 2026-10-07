import type { MediaClip, TextClip, Track } from "./types";

export interface CaptionWord { text: string; start: number; end: number }
export type CaptionStyle = "classic" | "boxed" | "bold";

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
  const lines = groupWords(words);
  const track: Track = { id: id(), kind: "text", name: "Captions", role: "captions", hidden: false, muted: false };
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  const clips: TextClip[] = [];
  lines.forEach((line, i) => {
    const start = clip.start + Math.max(0, line.start) / speed;
    const next = lines[i + 1] ? clip.start + lines[i + 1].start / speed : Infinity;
    const end = Math.min(clip.start + clip.duration, clip.start + line.end / speed + 0.15, next);
    if (end - start < 0.01) return;
    clips.push({
      id: id(), trackId: track.id, kind: "text", trimIn: 0, start, duration: end - start,
      text: line.text, fontFamily: "'Montserrat', sans-serif", fontSize: style === "bold" ? 78 : 64,
      fontWeight: 800, color: style === "bold" ? "#f9ee58" : "#ffffff", align: "centre", x: 0.5, y: 0.84,
      stroke: style === "boxed" ? null : { color: "#000000", width: 8 },
      background: style === "boxed" ? { color: "#000000", opacity: 0.75, padding: 18, radius: 12 } : null,
      animateIn: style === "bold" ? { kind: "pop", duration: Math.min(0.12, (end - start) / 2) } : undefined,
    });
  });
  return { track, clips };
}
