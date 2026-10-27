/**
 * Retake removal: when a speaker restarts a line, keep the last take and cut
 * the abandoned ones. Works on transcript sentences in clip-local seconds.
 */
import type { HighlightSentence } from "./highlights";
import { applyTimelineOp } from "./timelineAgent";
import type { ProjectSnapshot } from "./types";

export interface RetakeRange { from: number; to: number; text: string }

const tokens = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
const FILLERS = new Set(["um", "uh", "erm", "er", "ah", "like", "so", "okay", "ok"]);

/** An earlier sentence is a retake when a later one, soon after, starts with the same words. */
export function findRetakes(sentences: HighlightSentence[], window = 20): RetakeRange[] {
  const words = sentences.map(s => tokens(s.text).filter((w, i, all) => !(FILLERS.has(w) && i === 0 && all.length > 1)));
  const cuts: RetakeRange[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const a = words[i];
    if (a.length < 2) continue;
    for (let j = i + 1; j < sentences.length && sentences[j].start - sentences[i].end <= window; j++) {
      const b = words[j], n = Math.min(3, a.length, b.length);
      if (n < 2 || b.length < a.length * 0.6) continue;
      if (a.slice(0, n).every((w, k) => w === b[k])) {
        // Cut up to the start of the take that replaces it, so the pause goes too.
        const to = sentences[i + 1].start;
        cuts.push({ from: sentences[i].start, to: Math.max(sentences[i].end, to), text: sentences[i].text });
        break;
      }
    }
  }
  // Merge touching cuts.
  return cuts.reduce<RetakeRange[]>((out, cut) => {
    const last = out[out.length - 1];
    if (last && cut.from <= last.to + 0.01) { last.to = Math.max(last.to, cut.to); last.text += ` ${cut.text}`; } else out.push({ ...cut });
    return out;
  }, []);
}

/** Cuts the ranges from the clip, closes the gaps, and keeps its captions in sync. */
export function removeRetakes(project: ProjectSnapshot, clipId: string, ranges: RetakeRange[], makeId: () => string): ProjectSnapshot | null {
  const clip = project.clips.find(c => c.id === clipId);
  if (!clip || clip.kind !== "video" || clip.locked || !ranges.length) return null;
  const captionTracks = new Set(project.tracks.filter(t => t.role === "captions").map(t => t.id));
  let timeline = { clips: project.clips, tracks: project.tracks };
  for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
    const next = applyTimelineOp(timeline, { op: "remove_range", id: clipId, from: range.from, to: range.to }, makeId);
    if (!next) return null;
    const from = clip.start + range.from, to = clip.start + range.to, delta = to - from;
    const clips = next.clips.flatMap(c => {
      if (!captionTracks.has(c.trackId)) return [c];
      if (c.start >= from - 0.01 && c.start + c.duration <= to + 0.01) return [];
      return c.start >= to - 0.01 ? [{ ...c, start: c.start - delta }] : [c];
    });
    timeline = { clips, tracks: next.tracks };
  }
  return { ...project, clips: timeline.clips, tracks: timeline.tracks };
}
