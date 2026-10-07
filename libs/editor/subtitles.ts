import type { Clip, TextClip, Track } from "./types";
export const SUBTITLE_FORMATS = ["srt", "vtt"] as const;
export type SubtitleFormat = typeof SUBTITLE_FORMATS[number];
export interface SubtitleCue { start: number; end: number; text: string }
function seconds(value: string): number | null {
  const match = /^(?:(\d{1,3}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/.exec(value.trim());
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : null;
}
export function parseSubtitles(source: string): SubtitleCue[] {
  if (source.length > 2_000_000) throw new Error("subtitle file too large");
  const cues: SubtitleCue[] = [];
  for (const block of source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    if (/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0].trim())) continue;
    const index = lines.findIndex(line => line.includes("-->"));
    if (index < 0) continue;
    const timing = /^(\S+)\s+-->\s+(\S+)/.exec(lines[index].trim());
    const start = timing ? seconds(timing[1]) : null, end = timing ? seconds(timing[2]) : null;
    const text = lines.slice(index + 1).join("\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
    if (start === null || end === null || end <= start || !text) continue;
    cues.push({ start, end, text: text.slice(0, 2000) });
    if (cues.length > 5000) throw new Error("too many subtitles");
  }
  return cues.sort((a, b) => a.start - b.start);
}
export function subtitleLayers(cues: SubtitleCue[], makeId: () => string, offset = 0) {
  const track: Track = { id: makeId(), kind: "text", name: "Captions", role: "captions", hidden: false, muted: false };
  const clips: TextClip[] = cues.map(cue => ({
    id: makeId(), trackId: track.id, kind: "text", start: cue.start + offset, duration: cue.end - cue.start, trimIn: 0,
    text: cue.text, fontFamily: "'Montserrat', sans-serif", fontSize: 64, fontWeight: 800, color: "#ffffff", align: "centre", x: 0.5, y: 0.84,
    stroke: { color: "#000000", width: 8 },
  }));
  return { track, clips };
}
export function subtitleClips(clips: Clip[], tracks: Track[]): TextClip[] {
  const ids = new Set(tracks.filter(track => !track.hidden && (track.role === "captions" || track.name === "Captions")).map(track => track.id));
  return clips.filter((clip): clip is TextClip => clip.kind === "text" && !clip.hidden && ids.has(clip.trackId));
}
function timestamp(value: number, format: SubtitleFormat) {
  const total = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(total / 3_600_000), minutes = Math.floor(total / 60_000) % 60, secs = Math.floor(total / 1000) % 60;
  return [hours, minutes, secs].map(v => String(v).padStart(2, "0")).join(":") + (format === "srt" ? "," : ".") + String(total % 1000).padStart(3, "0");
}
export function exportSubtitles(clips: TextClip[], format: SubtitleFormat): string {
  const cues = clips.filter(clip => clip.duration > 0 && clip.text.trim()).sort((a, b) => a.start - b.start).map((clip, i) => {
    const text = clip.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return (format === "srt" ? `${i + 1}\n` : "") + `${timestamp(clip.start, format)} --> ${timestamp(clip.start + clip.duration, format)}\n${text}`;
  });
  return (format === "vtt" ? "WEBVTT\n\n" : "") + cues.join("\n\n") + "\n";
}
