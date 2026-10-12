import type { Clip, Track } from "./types";

/** Reuse sequential preset text lanes and discard only unreferenced tracks. */
export function compactVideoTemplateTracks(timeline: { clips: Clip[]; tracks: Track[] }, label: string) {
  const assignments = new Map<string, string>(), names = new Map<string, string>();
  for (const [index, y] of [0.34, 0.5, 0.66].entries()) {
    const words = timeline.clips.filter(c => c.kind === "text" && !c.locked && c.x === 0.5 && c.y === y && c.maxWidth === 0.78).sort((a, b) => a.start - b.start);
    if (!words.length) continue;
    const ids = new Set(words.map(c => c.id));
    const tracks = timeline.tracks.filter(track => words.some(c => c.trackId === track.id));
    const first = tracks.find(track => track.id === words[0].trackId);
    if (!first || tracks.some(track => track.kind !== "text" || !!track.hidden !== !!first.hidden || !!track.muted !== !!first.muted)
      || words.some((word, i) => i > 0 && word.start < words[i - 1].start + words[i - 1].duration - 0.001)
      || timeline.clips.some(c => tracks.some(track => track.id === c.trackId) && !ids.has(c.id))) continue;
    words.forEach(word => assignments.set(word.id, first.id));
    names.set(first.id, `${label} ${index + 1}`);
  }
  const clips = timeline.clips.map(c => assignments.has(c.id) ? { ...c, trackId: assignments.get(c.id)! } as Clip : c);
  const used = new Set(clips.map(c => c.trackId));
  const tracks = timeline.tracks.filter(track => used.has(track.id)).map(track => names.has(track.id) ? { ...track, name: names.get(track.id)! } : track);
  return { clips, tracks };
}
