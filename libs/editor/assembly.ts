import { sliceTimelineClip } from "./timelineAgent";
import { sameHighlightSource } from "./highlights";
import type { Clip, MediaClip, ProjectSnapshot, Track, TransitionKind } from "./types";

export interface AssemblyRequest { seconds?: number; selected: boolean; transition: TransitionKind | null; music: boolean }
export interface AssemblyShot { id: string; offset: number; duration: number }
export interface AssemblyPlan { shots: AssemblyShot[]; transition: TransitionKind | null; soundId: string | null }
const transitions: TransitionKind[] = ["fade", "slide-left", "slide-right", "wipe-left", "wipe-right"];
const finite = (n: number) => Number.isFinite(n);
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const invalid = (): never => { throw new Error("assembly_invalid"); };
const availableDuration = (clip: MediaClip) => clip.kind === "image" ? 600 : clip.sourceDuration !== undefined && finite(clip.sourceDuration)
  ? Math.min(clip.duration, Math.max(0, (clip.sourceDuration - clip.trimIn) / (clip.speed ?? 1))) : clip.duration;

/** Requests for an editable assembly never start a generation provider. */
export function assemblyRequest(prompt: string): AssemblyRequest | null {
  const text = prompt.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/^(?:(?:please|can you|could you|would you|peux-tu|peux tu|s'il te plait)\s+)*(?:make|create|generate|build|assemble|combine|join|creer|cree|assembler|assemble|combiner|combine)\b/.test(text)) return null;
  if (!/\b(?:combine|join|assemble|assembler|combiner)\b/.test(text) && !/\b(?:video|montage|slideshow|film|reel|story|edit)\b/.test(text.split(/\b(?:from|using|with|a partir de|avec)\b/)[0])) return null;
  if (!/\b(?:clips?|videos?|photos?|images?|footage|media|medias?)\b/.test(text) || /\b(?:highlights?|best moments?|meilleurs? moments?|temps forts?)\b/.test(text)) return null;
  if (!/\b(?:from|using|with my|with these|out of|a partir de|avec mes|avec ces|selected|selectionnes?)\b/.test(text) && !/\b(?:combine|join|assemble|assembler|combiner)\b/.test(text)) return null;
  const duration = text.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:seconds?|secs?|s|secondes?)\b/);
  const seconds = duration ? Number(duration[1]) : undefined;
  return { ...(seconds !== undefined ? { seconds } : {}), selected: /\b(?:selected|selectionnes?)\b/.test(text),
    transition: /\b(?:without|no|sans)\s+(?:transitions?|fades?|fondus?)\b/.test(text) ? null : /\b(?:fades?|dissolves?|transitions?|fondus?)\b/.test(text) ? "fade" : null,
    music: /\b(?:music|soundtrack|musique)\b/.test(text) && !/\b(?:without|no|sans)\s+(?:music|soundtrack|musique)\b/.test(text) };
}

export function assemblyMedia(project: ProjectSnapshot): MediaClip[] {
  const hidden = new Set(project.tracks.filter(t => t.hidden).map(t => t.id));
  return project.clips.filter((c): c is MediaClip => (c.kind === "video" || c.kind === "image") && !c.locked && !c.hidden && !hidden.has(c.trackId)
    && finite(c.duration) && c.duration >= 0.05 && finite(c.start) && finite(c.trimIn) && c.trimIn >= 0
    && availableDuration(c) >= 0.05 && (c.kind === "image" || (finite(c.speed ?? 1) && (c.speed ?? 1) > 0)))
    .sort((a, b) => a.start - b.start);
}
export function assemblySounds(project: ProjectSnapshot): MediaClip[] {
  return project.clips.filter((c): c is MediaClip => c.kind === "audio" && !c.hidden && !c.locked && !project.tracks.find(t => t.id === c.trackId)?.hidden
    && finite(c.duration) && c.duration >= 0.05 && finite(c.trimIn) && c.trimIn >= 0 && finite(c.speed ?? 1) && (c.speed ?? 1) > 0 && availableDuration(c) >= 0.05);
}
export function assemblyDuration(plan: AssemblyPlan) { return round(plan.shots.reduce((total, shot) => total + shot.duration, 0)); }

/** Allocate a requested budget fairly without stretching or repeating source footage. */
export function assemblyPlan(project: ProjectSnapshot, request: AssemblyRequest, selectedIds: string[]): AssemblyPlan {
  const media = assemblyMedia(project).filter(c => !request.selected || selectedIds.includes(c.id));
  if (!media.length || media.length > 100) invalid();
  const available = media.reduce((n, c) => n + availableDuration(c), 0), target = request.seconds ?? media.reduce((n, c) => n + c.duration, 0);
  if (!finite(target) || target < media.length * 0.05 || target > Math.min(600, available) + 1e-6) invalid();
  let remaining = target;
  const durations = media.map(() => 0), pending = new Set(media.map((_, i) => i));
  while (pending.size) {
    const share = remaining / pending.size;
    const small = [...pending].filter(i => availableDuration(media[i]) < share - 1e-6);
    if (!small.length) { for (const i of pending) durations[i] = share; break; }
    for (const i of small) { durations[i] = availableDuration(media[i]); remaining -= durations[i]; pending.delete(i); }
  }
  const sounds = assemblySounds(project);
  return { shots: media.map((c, i) => ({ id: c.id, offset: 0, duration: round(durations[i]) })), transition: request.transition,
    soundId: request.music && sounds.length === 1 ? sounds[0].id : null };
}

/** A separate project retains source trims, speed, motion, captions and sound. */
export function assemblyProject(original: ProjectSnapshot, plan: AssemblyPlan, identity: { id: string; title: string }, makeId: () => string): ProjectSnapshot {
  const media = assemblyMedia(original), sounds = assemblySounds(original), duration = assemblyDuration(plan);
  if (!identity.id || identity.id === original.id || !plan.shots.length || plan.shots.length > 100 || !finite(duration) || duration > 600
    || new Set(plan.shots.map(s => s.id)).size !== plan.shots.length || (plan.transition !== null && !transitions.includes(plan.transition))
    || (plan.soundId !== null && !sounds.some(c => c.id === plan.soundId))) invalid();
  for (const shot of plan.shots) {
    const source = media.find(c => c.id === shot.id);
    if (!source || !finite(shot.offset) || !finite(shot.duration) || shot.offset < 0 || shot.duration < 0.05 || shot.offset + shot.duration > availableDuration(source) + 1e-6) invalid();
  }
  const trackId = makeId(), clips: Clip[] = [];
  const layerTracks = new Map<string, { track: Track; below: boolean; order: number }>();
  const audioTracks = new Set<string>();
  let cursor = 0;
  for (const [index, shot] of plan.shots.entries()) {
    const source = media.find(c => c.id === shot.id)!;
    const copied = sliceTimelineClip(source, shot.offset, shot.duration, makeId(), cursor) as MediaClip;
    copied.trackId = trackId; copied.transitionOut = undefined;
    if (original.tracks.find(t => t.id === source.trackId)?.muted) copied.audio = { ...copied.audio, volume: 0 };
    const next = plan.shots[index + 1];
    if (next && plan.transition) copied.transitionOut = { kind: plan.transition, duration: Math.min(0.4, shot.duration / 2, next.duration / 2) };
    clips.push(copied);
    const from = source.start + Math.min(shot.offset, source.duration - 0.05), sourceEnd = source.start + source.duration, to = Math.min(from + shot.duration, sourceEnd);
    for (const overlay of original.clips) {
      if (overlay.kind !== "text" && overlay.kind !== "shape" && overlay.kind !== "audio") continue;
      if (overlay.id === plan.soundId) continue;
      const start = Math.max(from, overlay.start), end = Math.min(to, overlay.start + overlay.duration);
      if (end - start < 0.05) continue;
      let destination = overlay.trackId;
      if (overlay.kind === "audio") audioTracks.add(overlay.trackId);
      else {
        const order = original.tracks.findIndex(t => t.id === overlay.trackId), below = order < original.tracks.findIndex(t => t.id === source.trackId);
        const key = `${below}:${overlay.trackId}`;
        if (!layerTracks.has(key)) { const track = original.tracks[order]; if (!track) invalid(); layerTracks.set(key, { track: { ...track, id: makeId() }, below, order }); }
        destination = layerTracks.get(key)!.track.id;
      }
      const copiedOverlay = sliceTimelineClip(overlay, start - overlay.start, end - start, makeId(), cursor + start - from);
      if (source.kind === "image" && overlay.kind !== "audio" && end >= sourceEnd - 1e-6) copiedOverlay.duration += Math.max(0, shot.duration - (to - from));
      clips.push({ ...copiedOverlay, trackId: destination, transitionOut: undefined });
    }
    cursor = round(cursor + shot.duration);
  }
  const layers = [...layerTracks.values()].sort((a, b) => a.order - b.order);
  const tracks: Track[] = [...layers.filter(t => t.below).map(t => t.track), { id: trackId, kind: "video", name: original.title, hidden: false, muted: false },
    ...layers.filter(t => !t.below).map(t => t.track), ...original.tracks.filter(t => audioTracks.has(t.id)).map(t => ({ ...t }))];
  if (plan.soundId) {
    const sound = sounds.find(c => c.id === plan.soundId)!, musicTrackId = makeId();
    if (Math.ceil(duration / availableDuration(sound)) > 1000) invalid();
    for (let time = 0; time < duration - 1e-6;) {
      const length = Math.min(availableDuration(sound), duration - time);
      const part = sliceTimelineClip(sound, 0, length, makeId(), time) as MediaClip;
      part.trackId = musicTrackId; part.transitionOut = undefined;
      clips.push(part); time = round(time + length);
    }
    tracks.push({ id: musicTrackId, kind: "audio", name: original.tracks.find(t => t.id === sound.trackId)?.name ?? original.title, hidden: false, muted: original.tracks.find(t => t.id === sound.trackId)?.muted ?? false });
  }
  const settings = { ...original.settings }; delete settings.pages;
  if (clips.length > 5000) invalid();
  return { ...original, ...identity, settings, clips, tracks, updatedAt: Date.now() };
}

export interface AssemblyState extends AssemblyPlan { sourceId: string | null; media: MediaClip[]; sounds: MediaClip[]; busy: boolean; error: "selectMedia" | "limit" | "changed" | "failed" | null; undo: AssemblyPlan | null }
export const emptyAssembly = (): AssemblyState => ({ sourceId: null, media: [], sounds: [], shots: [], transition: null, soundId: null, busy: false, error: null, undo: null });
export interface AssemblyRuntime { current: () => ProjectSnapshot | null; create: (original: ProjectSnapshot, plan: AssemblyPlan, signal: AbortSignal) => Promise<boolean> }
export async function persistAssembly(original: ProjectSnapshot, next: ProjectSnapshot, runtime: {
  current: () => ProjectSnapshot | null; save: (project: ProjectSnapshot) => Promise<void>; commit: (original: ProjectSnapshot, next: ProjectSnapshot) => void | Promise<void>;
}, signal?: AbortSignal): Promise<boolean> {
  const matches = () => { const now = runtime.current(); return !signal?.aborted && !!now && sameHighlightSource(original, now); };
  if (!matches() || !next.id || next.id === original.id) return false;
  await runtime.save(original); if (!matches()) return false;
  await runtime.save(next); if (!matches()) return false;
  await runtime.commit(original, next); return true;
}
export class AssemblySession {
  state = emptyAssembly();
  private source: ProjectSnapshot | null = null;
  private controller: AbortController | null = null;
  constructor(private runtime: AssemblyRuntime, private changed: (state: AssemblyState) => void) {}
  private patch(value: Partial<AssemblyState>) { this.state = { ...this.state, ...value }; this.changed(this.state); }
  matchesSource(current = this.runtime.current()) { return !!this.source && !!current && sameHighlightSource(this.source, current); }
  dispose() { this.controller?.abort(); this.controller = null; }
  reset() { this.dispose(); this.source = null; this.state = emptyAssembly(); this.changed(this.state); }
  start(request: AssemblyRequest, selected: string[]) {
    if (this.state.busy) return;
    this.reset(); const source = this.runtime.current(); if (!source) { this.patch({ error: "selectMedia" }); return; }
    this.source = source; this.patch({ sourceId: source.id, media: assemblyMedia(source), sounds: assemblySounds(source) });
    try { this.patch(assemblyPlan(source, request, selected)); }
    catch { this.patch({ error: this.state.media.length ? "limit" : "selectMedia" }); }
  }
  private edit(value: Partial<AssemblyPlan>) {
    if (this.state.busy) return;
    if (!this.matchesSource()) { this.patch({ error: "changed" }); return; }
    const plan = { ...this.state, ...value };
    const valid = finite(assemblyDuration(plan)) && assemblyDuration(plan) <= 600 && plan.shots.length <= 100 && plan.shots.every(s => {
      const clip = this.state.media.find(c => c.id === s.id);
      return clip && finite(s.offset) && finite(s.duration) && s.offset >= 0 && s.duration >= 0.05 && s.offset + s.duration <= availableDuration(clip) + 1e-6;
    });
    this.patch({ ...value, error: valid ? null : "limit", undo: { shots: this.state.shots, transition: this.state.transition, soundId: this.state.soundId } });
  }
  toggle(id: string) {
    const clip = this.state.media.find(c => c.id === id); if (!clip) return;
    this.edit({ shots: this.state.shots.some(s => s.id === id) ? this.state.shots.filter(s => s.id !== id) : [...this.state.shots, { id, offset: 0, duration: Math.min(5, clip.duration) }] });
  }
  move(index: number, delta: -1 | 1) {
    if (!Number.isInteger(index) || index < 0 || index >= this.state.shots.length || index + delta < 0 || index + delta >= this.state.shots.length) return;
    const shots = [...this.state.shots]; [shots[index], shots[index + delta]] = [shots[index + delta], shots[index]]; this.edit({ shots });
  }
  range(id: string, offset: number, duration: number) {
    if (this.state.busy || !this.matchesSource()) return;
    const clip = this.state.media.find(c => c.id === id);
    if (!clip) return;
    this.edit({ shots: this.state.shots.map(s => s.id === id ? { id, offset, duration } : s) });
  }
  transition(value: TransitionKind | null) { if (value === null || transitions.includes(value)) this.edit({ transition: value }); }
  sound(id: string | null) { if (id === null || this.state.sounds.some(c => c.id === id)) this.edit({ soundId: id }); }
  /** Review commands change the draft only, never the original timeline. */
  review(prompt: string): boolean {
    const text = prompt.trim().toLowerCase().replace(/[.!?]+$/, "");
    if (this.state.busy || !this.matchesSource()) return false;
    if (/^(?:reverse(?: the)? order|reverse|inverse l'ordre)$/.test(text)) { this.edit({ shots: [...this.state.shots].reverse() }); return true; }
    const remove = /^(?:remove|drop|delete|retire)(?: (?:shot|clip|plan))? (\d+)$/.exec(text);
    if (remove) { const shot = this.state.shots[Number(remove[1]) - 1]; if (!shot) return false; this.toggle(shot.id); return true; }
    if (/^(?:no music|without music|remove music|sans musique)$/.test(text)) { this.sound(null); return true; }
    if (/^(?:no transitions?|without transitions?|hard cuts?|sans transitions?)$/.test(text)) { this.transition(null); return true; }
    if (/^(?:use|add|with) (?:fades?|cross-dissolves?|transitions?)$/.test(text)) { this.transition("fade"); return true; }
    const sound = /^(?:use|add) (?:music|sound|audio) (\d+)$/.exec(text);
    if (sound) { const clip = this.state.sounds[Number(sound[1]) - 1]; if (!clip) return false; this.sound(clip.id); return true; }
    return false;
  }
  undo() { if (!this.state.busy && this.matchesSource() && this.state.undo) { this.edit(this.state.undo); this.patch({ undo: null }); } }
  preview(index: number) { const shot = this.state.shots[index], clip = shot && this.state.media.find(c => c.id === shot.id); return !this.state.busy && this.state.error !== "limit" && this.matchesSource() && clip ? { id: clip.id, start: clip.start + Math.min(shot.offset, clip.duration - 0.05), end: clip.start + Math.min(shot.offset + shot.duration, clip.duration) } : null; }
  async create(): Promise<boolean> {
    if (this.state.busy || !this.state.shots.length || this.state.error === "limit") return false;
    if (!this.source || !this.matchesSource()) { this.patch({ error: "changed" }); return false; }
    const controller = new AbortController(); this.controller = controller; this.patch({ busy: true, error: null });
    try {
      const saved = await this.runtime.create(this.source, { shots: this.state.shots, transition: this.state.transition, soundId: this.state.soundId }, controller.signal);
      if (this.controller !== controller || controller.signal.aborted) return false;
      if (saved) { this.reset(); return true; } this.patch({ error: "changed" }); return false;
    } catch { if (this.controller === controller && !controller.signal.aborted) this.patch({ error: "failed" }); return false; }
    finally { if (this.controller === controller) { this.controller = null; this.patch({ busy: false }); } }
  }
}
