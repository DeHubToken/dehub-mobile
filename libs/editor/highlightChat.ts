import { findHighlights, highlightCaptionWords, sameHighlightSource, type HighlightRange } from "./highlights";
import { findVisualHighlights, type VisualAnalyser, type VisualSampler } from "./visualHighlights";
import { reviewHighlights } from "./highlightReview";
import type { CaptionWord } from "./captionLayout";
import type { MediaClip, ProjectSnapshot } from "./types";

export interface HighlightChatRequest { seconds: number; focus: string; useCaptions: boolean; useVisual?: boolean; visualScope?: string }

/** Consent follows the selected project and source assets, without filenames or URLs. */
export function highlightVisualScope(project: ProjectSnapshot, selectedIds: string[]): string {
  return JSON.stringify([project.id, selectedIds, project.clips.filter(clip => clip.kind === "video").map(clip => [clip.id, clip.mediaId])]);
}

/** Explicit requests use the highlight workflow before ordinary timeline planning. */
export function highlightChatRequest(prompt: string): HighlightChatRequest | null {
  const text = prompt.trim().replace(/\s+/g, " ");
  const plain = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/^(?:(?:please|can you|could you|would you|peux-tu|peux tu|s'il te plait) )*(?:find|show|get|pick|extract|make|create|give me|i want|trouver?|montrer?|chercher?|extrais|extraire|creer?|selectionner?|je veux)\b/.test(plain)) return null;
  if (!/\b(?:highlights?|best (?:moments?|parts?|bits)|strongest moments?|meilleurs? (?:moments?|passages?)|temps forts?)\b/.test(plain)) return null;
  const duration = plain.match(/\b(\d+(?:\.\d+)?)\s*(?:-| )?\s*(?:seconds?|secs?|s)\b/);
  const useCaptions = /\b(?:(?:using|use|from) (?:the )?(?:current|existing) captions|(?:avec|depuis) (?:les )?sous-titres (?:actuels|existants))\b/.test(plain);
  const withoutCaptions = text.replace(/\b(?:(?:using|use|from) (?:the )?(?:current|existing) captions|(?:avec|depuis) (?:les )?sous-titres (?:actuels|existants))\b/gi, "").trim();
  const focus = withoutCaptions.match(/(?:\b(?:about|focused on|focus on|concerning|sur|concernant)|à propos de)\s+(.+)/i)?.[1]
    ?? withoutCaptions.match(/\b(?:funny|funniest|emotional|inspiring|educational|drôle|drôles)\b/i)?.[0] ?? "";
  return { seconds: duration ? Number(duration[1]) : 30, focus: focus.trim().slice(0, 240), useCaptions };
}

export type HighlightChatError = "selectVideo" | "changed" | "limit" | "captionsMissing" | "failed";
export interface HighlightChatState {
  clipId: string | null;
  visual?: boolean;
  ranges: HighlightRange[] | null;
  chosen: number[];
  undo: number[] | null;
  busy: boolean;
  progress: { stage: "download" | "transcribe" | "rank" | "review" | "create"; fraction: number } | null;
  error: HighlightChatError | null;
}
export const emptyHighlightChat = (): HighlightChatState => ({ clipId: null, ranges: null, chosen: [], undo: null, busy: false, progress: null, error: null });
export type HighlightChatResult = { status: "found" | "reviewed" | "created"; count: number; total: number } | { status: "error"; error: HighlightChatError } | { status: "cancelled" };
type Planner = Parameters<typeof findHighlights>[3];
export interface HighlightChatRuntime {
  current: () => ProjectSnapshot | null;
  transcribe: (clip: MediaClip, progress: (stage: "download" | "transcribe", fraction: number) => void, signal: AbortSignal) => Promise<CaptionWord[]>;
  plan: Planner;
  visual?: { sample: VisualSampler; analyse: VisualAnalyser };
  create: (original: ProjectSnapshot, clipId: string, ranges: HighlightRange[], signal: AbortSignal) => Promise<boolean>;
}

/** Suggestions stay separate from the source until the user creates a new edit. */
export class HighlightChatSession {
  state = emptyHighlightChat();
  private source: ProjectSnapshot | null = null;
  private controller: AbortController | null = null;
  constructor(private runtime: HighlightChatRuntime, private changed: (state: HighlightChatState) => void) {}
  private patch(patch: Partial<HighlightChatState>) { this.state = { ...this.state, ...patch }; this.changed(this.state); }
  private fail(error: HighlightChatError): HighlightChatResult { this.patch({ error }); return { status: "error", error }; }
  matchesSource(current = this.runtime.current()) { return !!this.source && !!current && sameHighlightSource(this.source, current); }
  get reviewing() { return !!this.state.ranges?.length; }
  private alive(controller: AbortController) { return this.controller === controller && !controller.signal.aborted; }
  private complete(controller: AbortController) { if (this.controller === controller) { this.controller = null; this.patch({ busy: false, progress: null }); } }
  cancel() { this.controller?.abort(); this.controller = null; this.patch({ busy: false, progress: null }); }
  dispose() { this.controller?.abort(); this.controller = null; }
  reset() { this.dispose(); this.source = null; this.state = emptyHighlightChat(); this.changed(this.state); }

  async start(request: HighlightChatRequest, selectedIds: string[]): Promise<HighlightChatResult> {
    if (this.state.busy) return { status: "cancelled" };
    this.reset();
    const original = this.runtime.current();
    if (!original) return this.fail("selectVideo");
    const videos = original.clips.filter((clip): clip is MediaClip => clip.kind === "video");
    const selected = videos.filter(clip => selectedIds.includes(clip.id));
    const clip = selected.length === 1 ? selected[0] : !selected.length && videos.length === 1 ? videos[0] : null;
    if (!clip || clip.locked || clip.hidden || original.tracks.find(track => track.id === clip.trackId)?.hidden) return this.fail("selectVideo");
    const speed = clip.speed ?? 1;
    if (![15, 30, 60].includes(request.seconds) || !Number.isFinite(clip.duration) || clip.duration < 1 || !Number.isFinite(speed) || speed <= 0 || clip.duration * speed > 600) return this.fail("limit");
    const visual = request.useVisual === true;
    if (visual && request.visualScope !== highlightVisualScope(original, selectedIds)) return this.fail("changed");
    const captions = request.useCaptions && !visual ? highlightCaptionWords(original, clip) : null;
    if (captions && !captions.length) return this.fail("captionsMissing");
    const controller = new AbortController(); this.controller = controller; this.source = original;
    this.patch({ clipId: clip.id, visual, busy: true, progress: { stage: visual ? "rank" : "transcribe", fraction: 0 } });
    try {
      let ranges: HighlightRange[];
      if (visual) {
        const runtime = this.runtime.visual;
        if (!runtime) throw new Error("Visual analysis unavailable");
        const checkSource = () => {
          if (!this.alive(controller) || !this.matchesSource()) throw new Error("Source changed");
        };
        ranges = await findVisualHighlights(clip, { optIn: true, seconds: request.seconds, focus: request.focus },
          (source, windows, signal, progress) => { checkSource(); return runtime.sample(source, windows, signal, progress); },
          (batch, signal) => { checkSource(); return runtime.analyse(batch, signal); },
          controller.signal, fraction => {
            if (this.alive(controller)) this.patch({ progress: { stage: "rank", fraction } });
          });
      } else {
        const words = captions ?? await this.runtime.transcribe(clip, (stage, fraction) => {
          if (this.alive(controller)) this.patch({ progress: { stage, fraction: Math.max(0, Math.min(1, fraction)) } });
        }, controller.signal);
        if (!this.alive(controller)) return { status: "cancelled" };
        if (!this.matchesSource()) return this.fail("changed");
        this.patch({ progress: { stage: "rank", fraction: 0 } });
        ranges = await findHighlights(clip, words, request, this.runtime.plan, controller.signal, fraction => {
          if (this.alive(controller)) this.patch({ progress: { stage: "rank", fraction } });
        });
      }
      if (!this.alive(controller)) return { status: "cancelled" };
      if (!this.matchesSource()) return this.fail("changed");
      this.patch({ ranges, chosen: ranges.map((_, i) => i), undo: null, error: null });
      return { status: "found", count: ranges.length, total: ranges.length };
    } catch (error) {
      if (!this.alive(controller)) return { status: "cancelled" };
      if (!this.matchesSource()) return this.fail("changed");
      return this.fail(error instanceof Error && error.message === "highlight_limit" ? "limit" : "failed");
    } finally { this.complete(controller); }
  }

  async review(prompt: string): Promise<HighlightChatResult> {
    if (this.state.busy) return { status: "cancelled" };
    if (!this.matchesSource()) return this.fail("changed");
    if (!this.state.ranges?.length) return this.fail("failed");
    if (/^(?:undo selection|annule la selection)[.!?]*$/i.test(prompt.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
      if (!this.state.undo) return this.fail("failed");
      this.undo();
      return { status: "reviewed", count: this.state.chosen.length, total: this.state.ranges.length };
    }
    const previous = [...this.state.chosen], ranges = this.state.ranges;
    const controller = new AbortController(); this.controller = controller;
    this.patch({ busy: true, progress: { stage: "review", fraction: 0 }, error: null });
    try {
      const chosen = await reviewHighlights(ranges, previous, prompt, this.runtime.plan, controller.signal);
      if (!this.alive(controller)) return { status: "cancelled" };
      if (!this.matchesSource()) return this.fail("changed");
      this.patch({ chosen, undo: previous });
      return { status: "reviewed", count: chosen.length, total: ranges.length };
    } catch (error) {
      if (!this.alive(controller)) return { status: "cancelled" };
      if (!this.matchesSource()) return this.fail("changed");
      return this.fail(error instanceof Error && error.message === "highlight_limit" ? "limit" : "failed");
    } finally { this.complete(controller); }
  }

  toggle(index: number) {
    if (this.state.busy || !this.matchesSource() || !this.state.ranges || !Number.isInteger(index) || index < 0 || index >= this.state.ranges.length) return;
    const previous = [...this.state.chosen];
    this.patch({ chosen: previous.includes(index) ? previous.filter(i => i !== index) : [...previous, index].sort((a, b) => a - b), undo: previous });
  }
  undo() { if (!this.state.busy && this.matchesSource() && this.state.undo) this.patch({ chosen: this.state.undo, undo: null }); }
  preview(index: number) {
    const clip = this.source?.clips.find(clip => clip.id === this.state.clipId), range = this.state.ranges?.[index];
    return !this.state.busy && this.matchesSource() && clip && range ? { start: clip.start + range.start, end: clip.start + range.end } : null;
  }
  async create(): Promise<HighlightChatResult> {
    if (this.state.busy) return { status: "cancelled" };
    if (!this.source || !this.matchesSource()) return this.fail("changed");
    if (!this.state.clipId || !this.state.ranges || !this.state.chosen.length) return this.fail("failed");
    const ranges = this.state.ranges.filter((_, i) => this.state.chosen.includes(i));
    const controller = new AbortController(); this.controller = controller;
    this.patch({ busy: true, progress: { stage: "create", fraction: 0 }, error: null });
    try {
      const created = await this.runtime.create(this.source, this.state.clipId, ranges, controller.signal);
      if (!this.alive(controller)) return { status: "cancelled" };
      if (!created) return this.fail("changed");
      this.reset();
      return { status: "created", count: ranges.length, total: ranges.length };
    } catch {
      return this.alive(controller) ? this.fail("failed") : { status: "cancelled" };
    } finally { this.complete(controller); }
  }
}
