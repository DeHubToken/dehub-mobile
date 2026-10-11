import { assemblyFilePrompt, namedAssemblySelection } from "./namedAssembly";
import { assemblyFocus, type AssemblySceneMatcher } from "./assemblyScenes";
import { sliceTimelineClip } from "./timelineAgent";
import { sameHighlightSource } from "./highlights";
import { assemblyCatalog, assemblyCatalogMatches, assemblyLibrarySource, selectedAssemblyAssets, type AssemblyAsset } from "./assemblyLibrary";
import type { Clip, MediaClip, ProjectSnapshot, Track, TransitionKind } from "./types";

export interface AssemblyRequest { seconds?: number; selected: boolean; transition: TransitionKind | null; music: boolean; filePrompt?: string; musicExcluded?: boolean; focus?: string }
export interface AssemblyShot { id: string; part?: number; offset: number; duration: number }
export const assemblyShotKey = (shot: AssemblyShot): string => JSON.stringify([shot.id, shot.part ?? 0]);
const validShotPart = (shot: AssemblyShot) => shot.part === undefined || Number.isSafeInteger(shot.part) && shot.part > 0;
let assemblyScopeCounter = 0;
const freshShotScope = () => `${Date.now()}:${++assemblyScopeCounter}`;
const freshShotScopes = (shots: AssemblyShot[]) => Object.fromEntries(shots.map(shot => [assemblyShotKey(shot), freshShotScope()]));
export interface AssemblyPlan { shots: AssemblyShot[]; transition: TransitionKind | null; soundId: string | null }
const transitions: TransitionKind[] = ["fade", "slide-left", "slide-right", "wipe-left", "wipe-right"];
const finite = (n: number) => Number.isFinite(n);
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const invalid = (): never => { throw new Error("assembly_invalid"); };
const availableDuration = (clip: MediaClip) => clip.kind === "image" ? 600 : clip.sourceDuration !== undefined && finite(clip.sourceDuration)
  ? Math.min(clip.duration, Math.max(0, (clip.sourceDuration - clip.trimIn) / (clip.speed ?? 1))) : clip.duration;

/** Requests for an editable assembly never start a generation provider. */
export function assemblyRequest(prompt: string): AssemblyRequest | null {
  const files = assemblyFilePrompt(prompt);
  const text = files.text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/^(?:(?:please|can you|could you|would you|peux-tu|peux tu|s'il te plait)\s+)*(?:make|create|generate|build|assemble|combine|join|creer|cree|assembler|assemble|combiner|combine)\b/.test(text)) return null;
  if (!/\b(?:combine|join|assemble|assembler|combiner)\b/.test(text) && !/\b(?:video|montage|slideshow|film|reel|story|edit)\b/.test(text.split(/\b(?:from|using|with|a partir de|avec)\b/)[0])) return null;
  if (!/\b(?:clips?|videos?|photos?|images?|footage|media|medias?)\b/.test(text) || /\b(?:highlights?|best moments?|meilleurs? moments?|temps forts?)\b/.test(text)) return null;
  if (!/\b(?:from|using|with my|with these|out of|a partir de|avec mes|avec ces|selected|selectionnes?)\b/.test(text) && !(files.named && /\b(?:with|avec)\b/.test(text)) && !/\b(?:combine|join|assemble|assembler|combiner)\b/.test(text)) return null;
  const duration = text.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:seconds?|secs?|s|secondes?)\b/);
  const seconds = duration ? Number(duration[1]) : undefined;
  const focus = files.named ? undefined : assemblyFocus(prompt);
  return { ...(focus ? { focus } : {}), ...(files.named ? { filePrompt: prompt, musicExcluded: /\b(?:without|no|sans)\s+(?:music|soundtrack|musique|audio)\b/.test(text) } : {}),
    ...(seconds !== undefined ? { seconds } : {}), selected: /\b(?:selected|selectionnes?)\b/.test(text),
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
export function assemblyProject(original: ProjectSnapshot, plan: AssemblyPlan, identity: { id: string; title: string }, makeId: () => string, library: readonly AssemblyAsset[] = []): ProjectSnapshot {
  const sources = assemblyLibrarySource(original, library);
  const media = assemblyMedia(sources), sounds = assemblySounds(sources), duration = assemblyDuration(plan);
  if (!identity.id || identity.id === original.id || !plan.shots.length || plan.shots.length > 100 || !finite(duration) || duration > 600
    || new Set(plan.shots.map(assemblyShotKey)).size !== plan.shots.length || plan.shots.some(shot => !validShotPart(shot)) || (plan.transition !== null && !transitions.includes(plan.transition))
    || (plan.soundId !== null && !sounds.some(c => c.id === plan.soundId))) invalid();
  for (const shot of plan.shots) {
    const source = media.find(c => c.id === shot.id);
    if (!source || !finite(shot.offset) || !finite(shot.duration) || shot.offset < 0 || shot.duration < 0.05 || shot.offset + shot.duration > availableDuration(source) + 1e-6) invalid();
  }
  const primaryIds = new Set(plan.shots.map(shot => shot.id));
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
    const overlays = original.clips.some(clip => clip.id === source.id) ? original.clips : [];
    for (const overlay of overlays) {
      if (overlay.id === plan.soundId) continue;
      // Chosen footage becomes the main sequence; other media layers keep their composition.
      if ((overlay.kind === "video" || overlay.kind === "image") && (primaryIds.has(overlay.id) || overlay.trackId === source.trackId)) continue;
      const length = overlay.kind === "video" || overlay.kind === "audio" ? availableDuration(overlay) : overlay.duration;
      const start = Math.max(from, overlay.start), end = Math.min(to, overlay.start + length);
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
      if (source.kind === "image" && overlay.kind !== "audio" && overlay.kind !== "video" && end >= sourceEnd - 1e-6) copiedOverlay.duration += Math.max(0, shot.duration - (to - from));
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
    tracks.push({ id: musicTrackId, kind: "audio", name: sources.tracks.find(t => t.id === sound.trackId)?.name ?? original.title, hidden: false, muted: sources.tracks.find(t => t.id === sound.trackId)?.muted ?? false });
  }
  const settings = { ...original.settings }; delete settings.pages;
  if (clips.length > 5000) invalid();
  return { ...original, ...identity, settings, clips, tracks, updatedAt: Date.now() };
}

export interface AssemblyState extends AssemblyPlan { sourceId: string | null; media: MediaClip[]; sounds: MediaClip[]; busy: boolean; error: "selectMedia" | "limit" | "changed" | "failed" | "noMatch" | "matchLimit" | "matchDuration" | "matchFailed" | null; undo: AssemblyPlan | null; focus?: string; matching?: boolean; matchProgress?: number; sceneMatches?: Record<string, string>; shotScopes?: Record<string, string> }
export const emptyAssembly = (): AssemblyState => ({ sourceId: null, media: [], sounds: [], shots: [], transition: null, soundId: null, busy: false, error: null, undo: null, focus: "", matching: false, matchProgress: 0, sceneMatches: {}, shotScopes: {} });
export interface AssemblyRuntime { current: () => ProjectSnapshot | null; library?: () => AssemblyAsset[] | Promise<AssemblyAsset[]>; match?: AssemblySceneMatcher; create: (original: ProjectSnapshot, plan: AssemblyPlan, signal: AbortSignal, library: AssemblyAsset[]) => Promise<boolean> }
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
  private catalog: AssemblyAsset[] = [];
  private request: AssemblyRequest | null = null;
  private editedRanges = false;
  private sceneLimits = new Map<string, { offset: number; duration: number }>();
  private undoSceneLimits: Map<string, { offset: number; duration: number }> | null = null;
  private undoEditedRanges = false;
  private controller: AbortController | null = null;
  constructor(private runtime: AssemblyRuntime, private changed: (state: AssemblyState) => void) {}
  private patch(value: Partial<AssemblyState>) {
    if (value.shots && !value.shotScopes) value = { ...value, shotScopes: Object.fromEntries(value.shots.map(shot => {
      const key = assemblyShotKey(shot); return [key, this.state.shotScopes?.[key] ?? freshShotScope()];
    })) };
    this.state = { ...this.state, ...value }; this.changed(this.state);
  }
  matchesSource(current = this.runtime.current()) { return !!this.source && !!current && sameHighlightSource(this.source, current); }
  dispose() { this.controller?.abort(); this.controller = null; }
  reset() { this.dispose(); this.source = null; this.catalog = []; this.request = null; this.editedRanges = false; this.sceneLimits.clear(); this.undoSceneLimits = null; this.undoEditedRanges = false; this.state = emptyAssembly(); this.changed(this.state); }
  start(request: AssemblyRequest, selected: string[], library: readonly AssemblyAsset[] = []) {
    if (this.state.busy) return;
    this.reset(); const source = this.runtime.current(); if (!source) { this.patch({ error: "selectMedia" }); return; }
    this.source = source; this.catalog = assemblyCatalog(library); this.request = request;
    const sources = assemblyLibrarySource(source, this.catalog);
    this.patch({ sourceId: source.id, media: assemblyMedia(sources), sounds: assemblySounds(sources), transition: request.transition, focus: request.focus ?? "" });
    if (request.filePrompt) {
      const chosen = namedAssemblySelection(request.filePrompt, this.state.media, this.state.sounds, library, request.selected ? selected : undefined);
      if (!chosen) { this.patch({ error: "selectMedia" }); return; }
      try {
        const plan = assemblyPlan(sources, { ...request, selected: true }, chosen.ids);
        this.patch({ ...plan, shots: chosen.ids.map(id => plan.shots.find(shot => shot.id === id)!),
          soundId: request.musicExcluded ? null : chosen.soundId ?? plan.soundId });
      } catch { this.patch({ error: "limit" }); }
      return;
    }
    if (!assemblyMedia(source).length && this.state.media.length) return;
    try { this.patch(assemblyPlan(source, request, selected)); }
    catch { this.patch({ error: this.state.media.length ? "limit" : "selectMedia" }); }
  }
  private edit(value: Partial<AssemblyPlan>, editedRanges = this.editedRanges, shotScopes?: Record<string, string>) {
    if (this.state.busy) return;
    if (!this.matchesSource()) { this.patch({ error: "changed" }); return; }
    const plan = { ...this.state, ...value };
    this.undoSceneLimits = new Map(this.sceneLimits); this.undoEditedRanges = this.editedRanges; this.editedRanges = editedRanges;
    const target = !this.editedRanges && (this.catalog.length || this.sceneLimits.size) ? this.request?.seconds : undefined;
    const valid = finite(assemblyDuration(plan)) && assemblyDuration(plan) <= 600
      && (target === undefined || !plan.shots.length || Math.abs(assemblyDuration(plan) - target) <= 1e-6)
      && plan.shots.length <= 100 && new Set(plan.shots.map(assemblyShotKey)).size === plan.shots.length && plan.shots.every(s => {
      const clip = this.state.media.find(c => c.id === s.id);
      return clip && validShotPart(s) && finite(s.offset) && finite(s.duration) && s.offset >= 0 && s.duration >= 0.05 && s.offset + s.duration <= availableDuration(clip) + 1e-6;
    });
    this.patch({ ...value, ...(shotScopes ? { shotScopes } : {}), sceneMatches: {}, error: valid ? null : "limit", undo: { shots: this.state.shots, transition: this.state.transition, soundId: this.state.soundId } });
  }
  focus(value: string) { if (!this.state.busy && this.matchesSource()) this.patch({ focus: value.slice(0, 240), sceneMatches: {} }); }
  async match(optIn: true): Promise<boolean> {
    if (optIn !== true || this.state.busy || !this.source || !this.request || !this.matchesSource() || !this.runtime.match) return false;
    const source = this.source, request = this.request, focus = this.state.focus?.trim() ?? "", chosen = new Set(this.state.shots.map(shot => shot.id));
    const media = this.state.media.filter(clip => chosen.has(clip.id));
    if (focus.length < 2 || !media.length || media.length > 10) { this.patch({ error: "matchLimit" }); return false; }
    const previous: AssemblyPlan = { shots: this.state.shots, transition: this.state.transition, soundId: this.state.soundId };
    const controller = new AbortController(); this.controller = controller;
    const current = () => this.controller === controller && !controller.signal.aborted && this.matchesSource();
    this.patch({ busy: true, matching: true, matchProgress: 0, error: null });
    try {
      const scenes = await this.runtime.match(media, focus, controller.signal, fraction => {
        if (current()) this.patch({ matchProgress: Math.max(0, Math.min(1, fraction)) });
        else if (this.controller === controller && !controller.signal.aborted) { this.patch({ error: "changed" }); controller.abort(); }
      });
      if (!current()) { if (this.controller === controller && !controller.signal.aborted) this.patch({ error: "changed" }); return false; }
      if (!Array.isArray(scenes) || scenes.length > 100
        || scenes.some((scene, index) => { const clip = media.find(value => value.id === scene.id); return !clip || !finite(scene.offset) || !finite(scene.duration) || !finite(scene.score) || scene.score < 0.75 || scene.score > 1 || scene.offset < 0 || scene.duration < 0.05 || scene.offset + scene.duration > availableDuration(clip) + 1e-6 || typeof scene.text !== "string" || scene.text.length < 4 || scene.text.length > 240
          || scenes.slice(0, index).some(prior => prior.id === scene.id && scene.offset < prior.offset + prior.duration && scene.offset + scene.duration > prior.offset); })) throw new Error("assembly_scene_invalid");
      if (!scenes.length) { this.patch({ error: "noMatch" }); return false; }
      if (this.catalog.length && this.runtime.library && !assemblyCatalogMatches(source, previous, this.catalog, await this.runtime.library())) {
        if (current()) this.patch({ error: "changed" }); return false;
      }
      if (!current()) return false;
      const ranked = [...scenes].sort((a, b) => b.score - a.score || previous.shots.findIndex(shot => shot.id === a.id) - previous.shots.findIndex(shot => shot.id === b.id) || a.offset - b.offset);
      const sourceOrder = [...new Set(previous.shots.map(shot => shot.id))];
      const ordered = request.filePrompt ? sourceOrder.flatMap(id => ranked.filter(scene => scene.id === id).sort((a, b) => a.offset - b.offset)) : ranked;
      const clips = ordered.map((scene, index) => sliceTimelineClip(media.find(clip => clip.id === scene.id)!, scene.offset, scene.duration, String(index), index));
      let plan: AssemblyPlan;
      try { plan = assemblyPlan({ ...assemblyLibrarySource(source, this.catalog), clips }, { ...request, selected: true }, clips.map(clip => clip.id)); }
      catch { this.patch({ error: "matchDuration" }); return false; }
      const occurrences = new Map<string, number>();
      plan = { shots: ordered.map((scene, index) => {
        const part = occurrences.get(scene.id) ?? 0; occurrences.set(scene.id, part + 1);
        return { id: scene.id, ...(part ? { part } : {}), offset: scene.offset, duration: plan.shots[index].duration };
      }), transition: previous.transition, soundId: previous.soundId };
      this.undoSceneLimits = new Map(this.sceneLimits); this.undoEditedRanges = this.editedRanges;
      this.sceneLimits = new Map(plan.shots.map((shot, index) => [assemblyShotKey(shot), { offset: ordered[index].offset, duration: ordered[index].duration }]));
      this.editedRanges = false;
      this.patch({ ...plan, undo: previous, shotScopes: freshShotScopes(plan.shots), sceneMatches: Object.fromEntries(plan.shots.map((shot, index) => [assemblyShotKey(shot), ordered[index].text])), error: null });
      return true;
    } catch (error) {
      if (this.controller === controller && !controller.signal.aborted) this.patch({ error: this.matchesSource() ? error instanceof Error && error.message === "assembly_scene_limit" ? "matchLimit" : "matchFailed" : "changed" });
      return false;
    } finally { if (this.controller === controller) { this.controller = null; this.patch({ busy: false, matching: false }); } }
  }
  reviewManually(): boolean {
    if (this.state.busy || !this.matchesSource() || !["noMatch", "matchLimit", "matchDuration", "matchFailed"].includes(this.state.error ?? "")) return false;
    const undo = this.state.undo, undoLimits = this.undoSceneLimits, undoEditedRanges = this.undoEditedRanges;
    this.edit({});
    this.undoSceneLimits = undoLimits; this.undoEditedRanges = undoEditedRanges;
    this.patch({ focus: "", matchProgress: 0, undo });
    return this.state.error === null;
  }
  private selectShots(shots: AssemblyShot[]) {
    if (!this.editedRanges && this.request && shots.length && (this.catalog.length || this.sceneLimits.size)) {
      try {
        const clips = shots.map((shot, index) => {
          const source = this.state.media.find(clip => clip.id === shot.id)!;
          const limit = this.sceneLimits.get(assemblyShotKey(shot));
          const capacity = limit && limit.offset === shot.offset ? limit.duration : availableDuration(source) - shot.offset;
          return sliceTimelineClip(source, shot.offset, capacity, String(index), index);
        });
        const allocated = assemblyPlan({ ...assemblyLibrarySource(this.source!, this.catalog), clips },
          { ...this.request, seconds: this.request.seconds ?? assemblyDuration({ shots, transition: null, soundId: null }), selected: true }, clips.map(clip => clip.id));
        shots = shots.map((shot, index) => ({ ...shot, duration: allocated.shots[index].duration }));
      } catch { this.edit({ shots }); this.patch({ error: "limit" }); return; }
    }
    this.edit({ shots });
  }
  toggle(id: string) {
    if (this.state.busy || !this.matchesSource()) return;
    const clip = this.state.media.find(c => c.id === id); if (!clip) return;
    this.selectShots(this.state.shots.some(s => s.id === id) ? this.state.shots.filter(s => s.id !== id) : [...this.state.shots, { id, offset: 0, duration: Math.min(5, clip.duration) }]);
  }
  remove(index: number) {
    if (this.state.busy || !this.matchesSource() || !Number.isInteger(index) || index < 0 || index >= this.state.shots.length) return;
    this.selectShots(this.state.shots.filter((_, i) => i !== index));
  }
  split(index: number) {
    const shot = this.state.shots[index];
    if (this.state.busy || !this.matchesSource() || !Number.isInteger(index) || !shot || !finite(shot.duration) || shot.duration < 0.1 || this.state.shots.length >= 100) return;
    const part = Math.max(0, ...this.state.shots.filter(value => value.id === shot.id).map(value => value.part ?? 0)) + 1;
    if (!Number.isSafeInteger(part)) return;
    const first = { ...shot, duration: round(shot.duration / 2) }, second = { ...shot, part, offset: round(shot.offset + first.duration), duration: round(shot.duration - first.duration) };
    this.edit({ shots: [...this.state.shots.slice(0, index), first, second, ...this.state.shots.slice(index + 1)] });
    this.sceneLimits.set(assemblyShotKey(first), { offset: first.offset, duration: first.duration });
    this.sceneLimits.set(assemblyShotKey(second), { offset: second.offset, duration: second.duration });
  }
  move(index: number, delta: -1 | 1) {
    if (!Number.isInteger(index) || index < 0 || index >= this.state.shots.length || index + delta < 0 || index + delta >= this.state.shots.length) return;
    const shots = [...this.state.shots]; [shots[index], shots[index + delta]] = [shots[index + delta], shots[index]]; this.edit({ shots });
  }
  range(key: string, offset: number, duration: number) {
    if (this.state.busy || !this.matchesSource()) return;
    const shot = this.state.shots.find(value => assemblyShotKey(value) === key) ?? this.state.shots.find(value => value.id === key && value.part === undefined);
    if (!shot) return;
    this.edit({ shots: this.state.shots.map(value => value === shot ? { ...value, offset, duration } : value) }, true);
  }
  transition(value: TransitionKind | null) { if (value === null || transitions.includes(value)) this.edit({ transition: value }); }
  sound(id: string | null) { if (id === null || this.state.sounds.some(c => c.id === id)) this.edit({ soundId: id }); }
  /** Review commands change the draft only, never the original timeline. */
  review(prompt: string): boolean {
    const text = prompt.trim().toLowerCase().replace(/[.!?]+$/, "");
    if (this.state.busy || !this.matchesSource()) return false;
    if (/^(?:reverse(?: the)? order|reverse|inverse l'ordre)$/.test(text)) { this.edit({ shots: [...this.state.shots].reverse() }); return true; }
    const remove = /^(?:remove|drop|delete|retire)(?: (?:shot|clip|plan))? (\d+)$/.exec(text);
    if (remove) { const index = Number(remove[1]) - 1; if (!this.state.shots[index]) return false; this.remove(index); return true; }
    if (/^(?:no music|without music|remove music|sans musique)$/.test(text)) { this.sound(null); return true; }
    if (/^(?:no transitions?|without transitions?|hard cuts?|sans transitions?)$/.test(text)) { this.transition(null); return true; }
    if (/^(?:use|add|with) (?:fades?|cross-dissolves?|transitions?)$/.test(text)) { this.transition("fade"); return true; }
    const sound = /^(?:use|add) (?:music|sound|audio) (\d+)$/.exec(text);
    if (sound) { const clip = this.state.sounds[Number(sound[1]) - 1]; if (!clip) return false; this.sound(clip.id); return true; }
    return false;
  }
  undo() {
    if (!this.state.busy && this.matchesSource() && this.state.undo) {
      const plan = this.state.undo;
      this.sceneLimits = new Map(this.undoSceneLimits ?? []); this.editedRanges = this.undoEditedRanges;
      this.edit(plan, this.editedRanges, freshShotScopes(plan.shots)); this.undoSceneLimits = null; this.patch({ undo: null });
    }
  }
  preview(index: number): { id: string; start: number; end: number; libraryClip?: MediaClip } | null {
    const shot = this.state.shots[index], clip = shot && this.state.media.find(c => c.id === shot.id);
    if (this.state.busy || this.state.error === "limit" || !this.matchesSource() || !clip) return null;
    const range = { id: clip.id, start: clip.start + Math.min(shot.offset, clip.duration - 0.05), end: clip.start + Math.min(shot.offset + shot.duration, clip.duration) };
    return this.source!.clips.some(source => source.id === clip.id) ? range : { ...range, libraryClip: sliceTimelineClip(clip, shot.offset, shot.duration, clip.id, 0) as MediaClip };
  }
  async create(): Promise<boolean> {
    if (this.state.busy || !this.state.shots.length || this.state.error === "limit" || this.state.error === "noMatch" || this.state.error === "matchLimit" || this.state.error === "matchDuration" || this.state.error === "matchFailed") return false;
    if (!this.source || !this.matchesSource()) { this.patch({ error: "changed" }); return false; }
    const controller = new AbortController(); this.controller = controller; this.patch({ busy: true, error: null });
    try {
      const source = this.source, plan = { shots: this.state.shots, transition: this.state.transition, soundId: this.state.soundId };
      if (selectedAssemblyAssets(source, plan, this.catalog).length) {
        if (!this.runtime.library || !assemblyCatalogMatches(source, plan, this.catalog, await this.runtime.library())) {
          if (this.controller === controller) this.patch({ error: "changed" }); return false;
        }
      }
      if (this.controller !== controller || controller.signal.aborted || !this.matchesSource()) return false;
      const saved = await this.runtime.create(source, plan, controller.signal, this.catalog);
      if (this.controller !== controller || controller.signal.aborted) return false;
      if (saved) { this.reset(); return true; } this.patch({ error: "changed" }); return false;
    } catch { if (this.controller === controller && !controller.signal.aborted) this.patch({ error: "failed" }); return false; }
    finally { if (this.controller === controller) { this.controller = null; this.patch({ busy: false }); } }
  }
}
