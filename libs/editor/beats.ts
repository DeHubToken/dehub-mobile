import type { Clip, ClipKeyframes, Keyframe, MediaClip, Track } from "./types";

export interface BeatAnalysis { times: number[]; bpm: number; confidence: number }
export interface ClipBeatMap { mediaId: string; sourceTimes: number[]; bpm: number; confidence: number }

/** Store source seconds so moving, trimming and changing speed keeps markers accurate. */
export function clipBeatMap(clip: MediaClip, result: BeatAnalysis): ClipBeatMap {
  if (!Array.isArray(result.times) || result.times.length > 3000 || !Number.isFinite(result.bpm) || !Number.isFinite(result.confidence)) throw new Error("invalid beats");
  const speed = clip.speed ?? 1;
  const times = [...new Set(result.times.filter(t => Number.isFinite(t) && t >= 0 && t < clip.duration))].sort((a,b) => a-b);
  return { mediaId: clip.mediaId, sourceTimes: times.map(t => clip.trimIn + t * speed), bpm: result.bpm / speed, confidence: Math.max(0, Math.min(1, result.confidence)) };
}

export function clipBeatTimes(clip: Clip): number[] {
  if ((clip.kind !== "audio" && clip.kind !== "video") || clip.hidden || !clip.beats || clip.beats.mediaId !== clip.mediaId) return [];
  const speed = clip.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0 || !Array.isArray(clip.beats.sourceTimes)) return [];
  return clip.beats.sourceTimes.filter(Number.isFinite).slice(0,3000).map(t => (t-clip.trimIn)/speed).filter(t => t >= 0 && t < clip.duration).map(t => clip.start+t);
}

export function timelineBeatTimes(clips: Clip[], tracks: Track[]): number[] {
  return [...new Set(clips.filter(c => !tracks.find(t => t.id === c.trackId)?.hidden && !tracks.find(t => t.id === c.trackId)?.muted).flatMap(clipBeatTimes))].sort((a,b) => a-b);
}

export function snapToBeat(time: number, beats: number[], tolerance: number): number {
  let closest = time, distance = tolerance;
  for (const beat of beats) if (Math.abs(beat-time) < distance) { closest = beat; distance = Math.abs(beat-time); }
  return closest;
}

function durationBounds(c: Clip): [number,number] {
  if (c.kind !== "video") return [0.05, Infinity];
  const seconds = c.duration * (c.speed ?? 1);
  if (!Number.isFinite(seconds) || seconds <= 0 || c.trimIn < 0 || (c.sourceDuration !== undefined && c.trimIn+seconds > c.sourceDuration+1e-5)) return [Infinity,0];
  return [Math.max(0.05, seconds/4), seconds/0.25];
}

/** Keep all source footage; videos change speed to fit the new cut spacing. */
function fitBeatClip(c: Clip, start: number, duration: number): Clip {
  const ratio = duration / c.duration;
  const keyframes = c.keyframes ? Object.fromEntries((Object.entries(c.keyframes) as [string, Keyframe[]][]).map(([prop,keys]) => [prop, keys?.map(k => ({ ...k, t: k.t*ratio }))])) as ClipKeyframes : undefined;
  return { ...c, start, duration, keyframes,
    animateIn: c.animateIn ? { ...c.animateIn, duration: Math.min(duration, c.animateIn.duration*ratio) } : undefined,
    animateOut: c.animateOut ? { ...c.animateOut, duration: Math.min(duration, c.animateOut.duration*ratio) } : undefined,
    transitionOut: c.transitionOut ? { ...c.transitionOut, duration: Math.min(duration/2, c.transitionOut.duration) } : undefined,
    ...(c.kind === "video" ? { speed: c.duration*(c.speed ?? 1)/duration, audio: { ...c.audio, fadeIn: Math.min(duration, (c.audio?.fadeIn ?? 0)*ratio), fadeOut: Math.min(duration, (c.audio?.fadeOut ?? 0)*ratio) } } : {}),
  } as Clip;
}

/** Align internal cuts in contiguous groups; track edges, captions and locked layers stay put. */
export function alignBeatCuts(clips: Clip[], tracks: Track[], beats: number[]): { clips: Clip[]; changed: number } {
  const points = [...new Set(beats.filter(t => Number.isFinite(t) && t >= 0))].sort((a,b) => a-b);
  const patches = new Map<string,Clip>();
  const align = (group: Clip[]) => {
    if (group.length < 2 || group.length > 200 || group.some(c => !Number.isFinite(c.start) || !Number.isFinite(c.duration) || c.duration <= 0)) return;
    const start = group[0].start, end = group[group.length-1].start+group[group.length-1].duration;
    const inside = points.filter(t => t > start+0.05 && t < end-0.05);
    if (inside.length < group.length-1) return;
    type Path = { time: number; cost: number; cuts: number[] };
    let paths: Path[] = [{ time: start, cost: 0, cuts: [start] }];
    for (let i = 0; i < group.length; i++) {
      const c = group[i], original = c.start+c.duration;
      const candidates = i === group.length-1 ? [end] : [...inside].sort((a,b) => Math.abs(a-original)-Math.abs(b-original)).slice(0,24).sort((a,b) => a-b);
      const [min,max] = durationBounds(c), next: Path[] = [];
      for (const time of candidates) {
        let best: Path | undefined;
        for (const path of paths) {
          const duration = time-path.time;
          if (duration < min-1e-6 || duration > max+1e-6) continue;
          const cost = path.cost + Math.pow(time-original,2) + Math.pow(duration-c.duration,2)*0.1;
          if (!best || cost < best.cost) best = { time, cost, cuts: [...path.cuts,time] };
        }
        if (best) next.push(best);
      }
      paths = next;
      if (!paths.length) return;
    }
    const best = paths.sort((a,b) => a.cost-b.cost)[0];
    group.forEach((c,i) => { const duration = best.cuts[i+1]-best.cuts[i]; if (Math.abs(c.start-best.cuts[i]) > 1e-6 || Math.abs(c.duration-duration) > 1e-6) patches.set(c.id,fitBeatClip(c,best.cuts[i],duration)); });
  };
  for (const track of tracks) {
    if (track.kind === "audio" || track.hidden || track.role === "captions") continue;
    const ordered = clips.filter(c => c.trackId === track.id).sort((a,b) => a.start-b.start);
    let group: Clip[] = [];
    for (const c of ordered) {
      const previous = group[group.length-1];
      if (c.locked || c.hidden || c.kind === "audio") { align(group); group = []; continue; }
      if (previous && Math.abs(previous.start+previous.duration-c.start) > 1e-5) { align(group); group = []; }
      group.push(c);
    }
    align(group);
  }
  return { clips: clips.map(c => patches.get(c.id) ?? c), changed: patches.size };
}

export function beatCommand(prompt: string, scene: unknown): { op: "beat_sync"; id: string; align: boolean } | null {
  if (!scene || typeof scene !== "object") return null;
  const text = prompt.trim().toLowerCase().replace(/[.!]$/, "");
  const align = /^(?:please )?(?:sync|synchronize|align)(?: the)? (?:cuts|clips|video)(?: to| with)(?: the)? (?:music|beats|beat)$/.test(text);
  if (!align && !/^(?:please )?(?:detect|show|find)(?: the)? beat(?:s| markers)(?: (?:in|on|from) (?:this|the|my|selected) (?:audio|music|clip))?$/.test(text)) return null;
  const value = scene as { layers?: unknown; selected?: unknown };
  const layers: MediaClip[] = Array.isArray(value.layers) ? value.layers.filter(c => c?.kind === "audio" || c?.kind === "video") : [];
  const selected = layers.filter(c => Array.isArray(value.selected) && value.selected.includes(c.id));
  const sounds = layers.filter(c => c.kind === "audio");
  const clip = selected.length === 1 ? selected[0] : !selected.length && sounds.length === 1 ? sounds[0] : undefined;
  return clip && !clip.locked && clip.duration <= 600 ? { op: "beat_sync", id: clip.id, align } : null;
}
