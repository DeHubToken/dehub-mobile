/**
 * Speaker turns: who is talking when, from a diarised transcript. Times are
 * clip-local seconds, so they feed straight into remove_range and split_points.
 */
import type { RetakeRange } from "./retakes";

export interface SpeakerSegment { speaker: string | null; text: string; start: number | null }
export interface SpeakerTurn { speaker: string; from: number; to: number; text: string }
export interface SpeakerSummary { speaker: string; seconds: number; share: number; firstLine: string }

/** Segments carry only a start, so each turn runs until the next one begins. */
export function speakerTurns(segments: SpeakerSegment[], duration: number, speed = 1): SpeakerTurn[] {
  const rate = speed > 0 ? speed : 1;
  const timed = segments
    .filter(s => s.speaker && typeof s.start === "number" && Number.isFinite(s.start))
    .map(s => ({ speaker: s.speaker as string, from: Math.max(0, (s.start as number) / rate), text: s.text.trim() }))
    .filter(s => s.from < duration)
    .sort((a, b) => a.from - b.from);
  const turns: SpeakerTurn[] = [];
  timed.forEach((s, i) => {
    const to = Math.min(duration, timed[i + 1]?.from ?? duration);
    const last = turns[turns.length - 1];
    if (last && last.speaker === s.speaker) { last.to = to; last.text += ` ${s.text}`; return; }
    if (to - s.from > 0.05) turns.push({ ...s, to });
  });
  return turns;
}

/** Talk time per speaker, biggest first. */
export function summariseSpeakers(turns: SpeakerTurn[]): SpeakerSummary[] {
  const total = turns.reduce((sum, t) => sum + (t.to - t.from), 0) || 1;
  const by = new Map<string, SpeakerSummary>();
  for (const turn of turns) {
    const entry = by.get(turn.speaker) ?? { speaker: turn.speaker, seconds: 0, share: 0, firstLine: turn.text.slice(0, 60) };
    entry.seconds += turn.to - turn.from;
    by.set(turn.speaker, entry);
  }
  return [...by.values()].map(s => ({ ...s, share: s.seconds / total })).sort((a, b) => b.seconds - a.seconds);
}

/** Everything the other speakers say, as cut ranges. */
export function otherSpeakerRanges(turns: SpeakerTurn[], keep: string): RetakeRange[] {
  return turns
    .filter(t => t.speaker !== keep)
    .map(t => ({ from: t.from, to: t.to, text: t.text }))
    .reduce<RetakeRange[]>((out, cut) => {
      const last = out[out.length - 1];
      if (last && cut.from <= last.to + 0.01) { last.to = Math.max(last.to, cut.to); last.text += ` ${cut.text}`; } else out.push({ ...cut });
      return out;
    }, []);
}

/** Cut points at each change of speaker, skipping the very start and end. */
export function speakerChangePoints(turns: SpeakerTurn[], duration: number): number[] {
  return turns.slice(1).map(t => t.from).filter(t => t > 0.1 && t < duration - 0.1);
}

/** Scribe times are seconds into the whole file; make them seconds into the clip's audible part. */
export function segmentsFromTrim(segments: SpeakerSegment[], trimIn: number): SpeakerSegment[] {
  return segments.map(s => ({ ...s, start: typeof s.start === "number" ? s.start - trimIn : s.start })).filter(s => typeof s.start !== "number" || s.start >= -0.05);
}
