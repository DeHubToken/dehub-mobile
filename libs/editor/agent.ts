import { videoMatteCommand } from "./videoMatte";
/**
 * Editor AI agent, mobile half.
 *
 * Same contract as the web (dehubweb src/lib/editor/agent.ts): describeScene
 * summarises the design as compact text, the shared `editor-agent` edge
 * function answers with a list of operations, and applyOps carries them out
 * on the project snapshot. The server never sees pixels or files, which keeps
 * a request at a fraction of a cent; stock photos are downloaded on the phone.
 *
 * applyOps returns a new snapshot, so the screen commits the whole request as
 * one undo step.
 */
import env from "../../config/env";
import {
  addShape,
  addText,
  arrangeClip,
  duplicateClip,
  addImage,
  getClip,
  getTransform,
  placementPatchAt,
  removeClip,
  setAspect,
  setBackground,
  updateClip,
  type Arrange,
  type ClipPatch,
} from "./project";
import { applyFilterPreset } from "./filterPresets";
import { shotCommand } from "./shots";
import type { ShotAnalysis } from "./shots";
import { alignBeatCuts, beatCommand, clipBeatMap, clipBeatTimes, type BeatAnalysis } from "./beats";
import { audioToolLayers, audioToolCommand } from "./audioTools";
import { cleanKeys, keyframeProps } from "./keyframes";
import { EDITOR_FONTS, fontFamilyCss } from "./fonts";
import {
  BLEND_MODES,
  SHAPE_KINDS,
  type AspectPreset,
  type BlendMode,
  type Clip,
  type ClipAnimationKind,
  type ClipEffects,
  type MediaClip,
  type ProjectSnapshot,
  type ShapeClip,
  type ShapeKind,
  type TextClip,
} from "./types";
import type { BrandKit } from "./brand";
import { newId } from "./project";
import { captionLayers, type CaptionWord, type CaptionStyle } from "./captionLayout";
import { preciseCommand } from "./preciseCommands";
import { applyTimelineOp, expandBatch, TIMELINE_OPS } from "./timelineAgent";
import { addClip } from "./timeline";
import type { StockKind } from "./stock";

export interface AgentMedia {
  id: string;
  name?: string;
  kind: "image" | "video" | "audio";
  duration?: number;
}
import { appendPage, getPages, pageAt, removePage, timelineDuration } from "./pages";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentOp {
  op: string;
  [field: string]: unknown;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function describeScene(p: ProjectSnapshot, selectedId: string | null, brand: BrandKit | null, playhead = 0, media: AgentMedia[] = []) {
  const z = new Map(p.tracks.map((t, i) => [t.id, i]));
  const layers = p.clips
    .slice()
    .sort((a, b) => (z.get(a.trackId) ?? 0) - (z.get(b.trackId) ?? 0))
    .map((c) => {
      const tr = getTransform(c);
      const base: Record<string, unknown> = { id: c.id, trackId: c.trackId, kind: c.kind, start: round(c.start, 2), duration: round(c.duration, 2), x: round(tr.x), y: round(tr.y) };
      if (tr.rotation) base.rotation = round(tr.rotation, 1);
      if ((tr.opacity ?? 1) !== 1) base.opacity = round(tr.opacity ?? 1, 2);
      if (c.blend && c.blend !== "normal") base.blend = c.blend;
      if (c.locked) base.locked = true;
      if (c.hidden) base.hiddenLayer = true;
      if (c.keyframes) base.keys = c.keyframes;
      if (c.kind === "text") {
        return { ...base, text: c.text.slice(0, 200), font: c.fontFamily.split(",")[0].replace(/'/g, ""), fontSize: c.fontSize, fontWeight: c.fontWeight, color: c.color, align: c.align };
      }
      if (c.kind === "shape") {
        return { ...base, shape: c.shape, w: round(c.w), h: round(c.h), scale: round(tr.scale, 2), fill: c.fill };
      }
      const m = c as MediaClip;
      const out: Record<string, unknown> = { ...base, scale: round(tr.scale, 2) };
      if (m.fit === "cover") out.fit = "cover";
      if (m.effects) out.effects = m.effects;
      out.mediaId = m.mediaId;
      out.trimIn = round(m.trimIn);
      out.sourceDuration = m.sourceDuration;
      out.speed = m.speed ?? 1;
      out.audio = m.audio;
      out.crop = m.crop;
      out.transitionOut = m.transitionOut;
      return out;
    });
  const hasBrand = !!brand && (brand.colors.length > 0 || !!brand.headingFont || !!brand.bodyFont || !!brand.logoMediaId);
  return {
    capabilities: [...TIMELINE_OPS, "batch", "set_canvas", "add_text", "add_shape", "update", "place", "effects", "crop", "style", "animate", "keyframes", "order", "duplicate", "delete", "add_stock", "add_media", "apply_brand", "add_logo", "use_template", "remove_background", "captions", "process_audio", "beat_sync", "detect_shots", "add_page", "goto_page", "delete_page", "select"],
    stockKinds: ["photo", "video", "audio"],
    pages: getPages(p.settings, p.clips).map(page => ({ index: page.index, start: page.start, duration: page.end - page.start })),
    currentPage: pageAt(getPages(p.settings, p.clips), playhead).index,
    tracks: p.tracks.map(({ id, kind, muted, hidden }) => ({ id, kind, muted, hidden })),
    brand: hasBrand
      ? {
          colors: brand!.colors,
          headingFont: brand!.headingFont?.split(",")[0].replace(/'/g, ""),
          bodyFont: brand!.bodyFont?.split(",")[0].replace(/'/g, ""),
          hasLogo: !!brand!.logoMediaId,
        }
      : undefined,
    page: { width: p.settings.width, height: p.settings.height, aspect: p.settings.aspectPreset, background: p.settings.background, duration: timelineDuration(p.settings, p.clips) },
    playhead: round(playhead, 2),
    selected: selectedId ? [selectedId] : [],
    layers,
    library: media.slice(0, 30).map(({ id, name, kind, duration }) => ({ id, name, kind, duration })),
  };
}

export async function askAgent(messages: AgentMessage[], scene: unknown, signal?: AbortSignal): Promise<{ reply: string; ops: AgentOp[] }> {
  const last = messages[messages.length - 1];
  const direct = last?.role === "user" && scene && typeof scene === "object" ? preciseCommand(last.content, scene) ?? audioToolCommand(last.content, scene) ?? beatCommand(last.content, scene) ?? shotCommand(last.content, scene) ?? videoMatteCommand(last.content, scene) : null;
  if (direct) return { reply: "", ops: [direct] };
  return askSceneAgent(messages, scene, signal);
}

export async function askSceneAgent(messages: AgentMessage[], scene: unknown, signal?: AbortSignal): Promise<{ reply: string; ops: AgentOp[] }> {
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/editor-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ messages, scene }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error === "rate_limited" || res.status === 429 ? "rate_limited" : "unavailable");
  return { reply: String(data.reply ?? ""), ops: Array.isArray(data.ops) ? data.ops : [] };
}

// ── applying operations ──

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const colour = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : undefined);
const ANIMATIONS: ClipAnimationKind[] = ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom-in", "zoom-out", "pop", "rise", "blur"];

/** A Google Font by name; ones outside the phone's picker still load at their regular weight. */
function fontCss(name: string): string {
  const f = EDITOR_FONTS.find((g) => g.family.toLowerCase() === name.toLowerCase());
  return f ? fontFamilyCss(f) : `'${name}', system-ui, sans-serif`;
}

/**
 * Keep text inside the page. The web measures with the real font; the phone
 * has no canvas outside the WebView, so this estimates from the longest line
 * (display faces run ~0.62em per character, uppercase wider). Good enough to
 * stop "SUMMER SALE" at 170px running off a square page.
 */
function fitText(p: ProjectSnapshot, id: string): ProjectSnapshot {
  const c = getClip(p, id);
  if (!c || c.kind !== "text") return p;
  const longest = Math.max(...(c.uppercase ? c.text.toUpperCase() : c.text).split("\n").map((l) => l.length), 1);
  const perChar = (c.uppercase || c.text === c.text.toUpperCase() ? 0.66 : 0.56) * (c.fontWeight >= 700 ? 1.05 : 1);
  const est = (longest * c.fontSize * perChar * p.settings.height) / 1080 + (c.letterSpacing ?? 0) * longest;
  const max = p.settings.width * 0.9;
  if (est <= max) return p;
  return updateClip(p, id, { fontSize: Math.max(12, Math.floor(c.fontSize * (max / est))) });
}

function textPatch(op: AgentOp): Partial<TextClip> {
  const p: Partial<TextClip> = {};
  if (typeof op.text === "string") p.text = op.text.slice(0, 2000);
  const fs = num(op.fontSize);
  if (fs !== undefined) p.fontSize = clamp(Math.round(fs), 6, 800);
  const fw = num(op.fontWeight);
  if (fw !== undefined) p.fontWeight = clamp(Math.round(fw / 100) * 100, 100, 900);
  const c = colour(op.color);
  if (c) p.color = c;
  const family = str(op.fontFamily);
  if (family) p.fontFamily = fontCss(family);
  if (op.align === "left" || op.align === "centre" || op.align === "right") p.align = op.align;
  for (const k of ["italic", "uppercase", "underline"] as const) {
    const v = bool(op[k]);
    if (v !== undefined) p[k] = v;
  }
  const ls = num(op.letterSpacing);
  if (ls !== undefined) p.letterSpacing = clamp(ls, -20, 200);
  const lh = num(op.lineHeight);
  if (lh !== undefined) p.lineHeight = clamp(lh, 0.6, 4);
  const bg = colour(op.bgColor);
  if (bg) p.background = { color: bg, opacity: clamp(num(op.bgOpacity) ?? 0.6, 0, 1), padding: 24, radius: 16 };
  const stroke = colour(op.strokeColor);
  if (stroke) p.stroke = { color: stroke, width: clamp(num(op.strokeWidth) ?? 4, 0, 40) };
  return p;
}

function shapePatch(op: AgentOp): Partial<ShapeClip> {
  const p: Partial<ShapeClip> = {};
  const w = num(op.w);
  if (w !== undefined) p.w = clamp(w, 0.005, 3);
  const h = num(op.h);
  if (h !== undefined) p.h = clamp(h, 0.005, 3);
  if (op.fill === "none") p.fill = null;
  const fill = colour(op.fill) ?? colour(op.color);
  if (fill) p.fill = fill;
  const stroke = colour(op.strokeColor);
  if (stroke) p.stroke = { color: stroke, width: clamp(num(op.strokeWidth) ?? 6, 0, 80) };
  const r = num(op.radius);
  if (r !== undefined) p.radius = clamp(r, 0, 540);
  return p;
}

function layerPatch(op: AgentOp): { blend?: BlendMode; locked?: boolean; hidden?: boolean } {
  const p: { blend?: BlendMode; locked?: boolean; hidden?: boolean } = {};
  if (BLEND_MODES.includes(op.blend as BlendMode)) p.blend = op.blend as BlendMode;
  const l = bool(op.locked);
  if (l !== undefined) p.locked = l;
  const h = bool(op.hidden);
  if (h !== undefined) p.hidden = h;
  return p;
}

function effectsPatch(op: AgentOp, current: ClipEffects | undefined): ClipEffects | undefined {
  let next: ClipEffects | undefined = current ? { ...current } : undefined;
  const preset = str(op.preset);
  if (preset) next = preset === "none" ? undefined : applyFilterPreset(preset) ?? next;
  const fields: [keyof ClipEffects, number, number][] = [
    ["brightness", 0, 2], ["contrast", 0, 2], ["saturation", 0, 2], ["blur", 0, 20],
    ["grayscale", 0, 1], ["sepia", 0, 1], ["invert", 0, 1], ["hueRotate", 0, 360],
    ["warmth", -1, 1], ["tint", -1, 1], ["vignette", 0, 1],
  ];
  for (const [key, lo, hi] of fields) {
    const v = num(op[key]);
    if (v !== undefined) next = { ...(next ?? {}), [key]: clamp(v, lo, hi) };
  }
  return next;
}

const ASPECTS: [Exclude<AspectPreset, "custom">, number][] = [["16:9", 16 / 9], ["1:1", 1], ["4:5", 4 / 5], ["9:16", 9 / 16]];
function nearestAspect(ratio: number): Exclude<AspectPreset, "custom"> {
  return ASPECTS.reduce((best, cur) => (Math.abs(Math.log(cur[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? cur : best))[0];
}

export interface ApplyContext {
  detectShots?: (clip: MediaClip) => Promise<ShotAnalysis>;
  detectBeats?: (clip: MediaClip) => Promise<BeatAnalysis>;
  processAudio?: (clip: MediaClip, mode: import("./audioTools").AudioToolMode) => Promise<string | null>;
  transcribe?: (clip: MediaClip) => Promise<CaptionWord[]>;
  /** Import a requested stock asset; legacy photo callbacks may return an id. */
  importStock?: (query: string, orientation: "all" | "landscape" | "portrait" | "square", kind?: StockKind) => Promise<AgentMedia | string | null>;
  media?: AgentMedia[];
  brand?: BrandKit | null;
  /** Restyle the design with the brand kit (libs/editor/brand.ts). */
  applyBrand?: (p: ProjectSnapshot) => ProjectSnapshot;
  /** Starter template by id, as ops (libs/editor/templates.ts). */
  templateOps?: (id: string) => AgentOp[] | null;
  /** Cut the subject out of a picture on the phone; resolves with the new media id. */
  removeBackground?: (mediaId: string) => Promise<string | null>;
  removeVideoBackground?: (clip: MediaClip) => Promise<MediaClip["videoMatte"]>;
  /** The playhead; placing a keyframed layer writes a key here (web placementPatchAt). */
  time?: number;
}

export interface ApplyReport {
  applied: number;
  failed: number;
  missingStock: string[];
  /** Asked for something the phone does not do yet (captions, AI generation, pages). */
  unsupported: string[];
  selectedId: string | null;
  cursorTime?: number;
}

export async function applyOps(start: ProjectSnapshot, ops: AgentOp[], ctx: ApplyContext = {}): Promise<{ project: ProjectSnapshot; report: ApplyReport }> {
  let p = start;
  let cursor = ctx.time ?? 0;
  const report: ApplyReport = { applied: 0, failed: 0, missingStock: [], unsupported: [], selectedId: null };
  const created: string[] = [];
  const resolve = (id: unknown): string | undefined => {
    if (typeof id !== "string") return undefined;
    const m = /^new:(\d+)$/.exec(id);
    return m ? created[Number(m[1])] : id;
  };
  const find = (id: unknown): Clip | null => getClip(p, resolve(id) ?? null);
  const onPage = (id: string) => {
    if (!p.settings.pages?.length) return;
    const page = pageAt(getPages(p.settings, p.clips), cursor);
    p = updateClip(p, id, { start: page.start, duration: page.end - page.start });
  };

  const insertMedia = (media: AgentMedia, op: AgentOp) => {
    const before = p;
    const r = media.kind === "image" ? addImage(p, media.id) : addClip(p, { ...media, kind: media.kind, duration: media.duration ?? 5 }, cursor);
    p = r.project;
    created.push(r.clipId);
    if (media.kind === "image") onPage(r.clipId);
    if (op.start !== undefined || op.duration !== undefined) {
      const changed = applyTimelineOp(p, { op: "timing", id: r.clipId, start: op.start, duration: op.duration }, () => newId(10));
      if (!changed) { p = before; created.pop(); return null; }
      p = { ...p, clips: changed.clips, tracks: changed.tracks };
    }
    return r.clipId;
  };

  const place = (clip: Clip, op: AgentOp) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["x", "y", "scale", "rotation", "opacity"] as const) {
      const v = num(op[k]);
      if (v === undefined) continue;
      patch[k] = k === "x" || k === "y" ? clamp(v, -0.5, 1.5) : k === "scale" ? clamp(v, 0.02, 20) : k === "opacity" ? clamp(v, 0, 1) : v;
    }
    for (const k of ["flipH", "flipV"] as const) {
      const v = bool(op[k]);
      if (v !== undefined) patch[k] = v;
    }
    const out: Record<string, unknown> = Object.keys(patch).length ? { ...placementPatchAt(clip, patch, cursor) } : {};
    if ((op.fit === "cover" || op.fit === "contain") && (clip.kind === "image" || clip.kind === "video")) out.fit = op.fit;
    if (Object.keys(out).length) p = updateClip(p, clip.id, out as ClipPatch);
  };

  const one = async (op: AgentOp): Promise<boolean> => {
    const target = find(op.id);
    if (target?.locked && op.op !== "select" && !(op.op === "update" && op.locked === false)) return false;
    if (TIMELINE_OPS.includes(op.op)) {
      if (op.op === "audio" && op.speed !== undefined) {
        const changed = await one({ op: "speed", id: op.id, speed: op.speed });
        if (!changed) return false;
        if (op.volume === undefined && op.fadeIn === undefined && op.fadeOut === undefined) return true;
      }
      const next = applyTimelineOp(p, { ...op, id: resolve(op.id), ids: Array.isArray(op.ids) ? op.ids.map(resolve) : op.ids }, () => newId(10));
      if (!next) return false;
      p = { ...p, clips: next.clips, tracks: next.tracks };
      created.push(...next.created);
      return true;
    }
    switch (op.op) {
      case "set_canvas": {
        let aspect = op.aspect as AspectPreset | undefined;
        const big = (v: unknown) => { const n = num(v); return n !== undefined && n > 1 ? n : undefined; };
        const pw = num(op.width) ?? big(op.x);
        const ph = num(op.height) ?? big(op.y);
        if (!aspect && pw && ph) aspect = nearestAspect(pw / ph);
        let ok = false;
        if (aspect === "16:9" || aspect === "9:16" || aspect === "1:1" || aspect === "4:5") { p = setAspect(p, aspect); ok = true; }
        const bg = colour(op.background);
        if (bg) { p = setBackground(p, bg); ok = true; }
        return ok;
      }
      case "add_text": {
        const r = addText(p, typeof op.text === "string" ? op.text : "");
        p = r.project;
        created.push(r.clipId);
        onPage(r.clipId);
        const patch: Partial<TextClip> = textPatch(op);
        const x = num(op.x);
        const y = num(op.y);
        if (x !== undefined) patch.x = clamp(x, 0, 1);
        if (y !== undefined) patch.y = clamp(y, 0, 1);
        p = updateClip(p, r.clipId, patch);
        const clip = getClip(p, r.clipId);
        if (clip && (num(op.rotation) !== undefined || num(op.opacity) !== undefined)) place(clip, { op: "place", rotation: op.rotation, opacity: op.opacity });
        p = fitText(p, r.clipId);
        return true;
      }
      case "add_shape": {
        const kind = SHAPE_KINDS.includes(op.shape as ShapeKind) ? (op.shape as ShapeKind) : "rect";
        const r = addShape(p, kind, { ...shapePatch(op), ...layerPatch(op) });
        p = r.project;
        created.push(r.clipId);
        onPage(r.clipId);
        const clip = getClip(p, r.clipId);
        if (clip) place(clip, op);
        return true;
      }
      case "update": {
        const clip = find(op.id);
        if (!clip) return false;
        if (clip.kind === "text") {
          p = updateClip(p, clip.id, textPatch(op));
          if (op.text !== undefined || op.fontSize !== undefined) p = fitText(p, clip.id);
        }
        if (clip.kind === "shape") p = updateClip(p, clip.id, shapePatch(op));
        const shared = layerPatch(op);
        if (Object.keys(shared).length) p = updateClip(p, clip.id, shared);
        place(getClip(p, clip.id)!, op);
        return true;
      }
      case "place": {
        const clip = find(op.id);
        if (!clip || clip.kind === "audio") return false;
        place(clip, op);
        return true;
      }
      case "effects": {
        const clip = find(op.id);
        if (!clip || (clip.kind !== "image" && clip.kind !== "video")) return false;
        p = updateClip(p, clip.id, { effects: effectsPatch(op, clip.effects) });
        return true;
      }
      case "crop": {
        const clip = find(op.id);
        if (!clip || (clip.kind !== "image" && clip.kind !== "video")) return false;
        const c = clip.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
        const e = (k: "left" | "top" | "right" | "bottom") => clamp(num(op[k]) ?? c[k], 0, 0.9);
        p = updateClip(p, clip.id, { crop: { left: e("left"), top: e("top"), right: e("right"), bottom: e("bottom") } });
        return true;
      }
      case "style": {
        const clip = find(op.id);
        if (!clip) return false;
        const patch: Record<string, unknown> = {};
        const r = num(op.radius);
        if (r !== undefined && clip.kind !== "text") patch.radius = clamp(r, 0, 540);
        const sh = bool(op.shadow);
        if (sh !== undefined) patch.shadow = sh ? { color: "#000000", opacity: 0.5, blur: 24, offsetX: 0, offsetY: 12 } : null;
        p = updateClip(p, clip.id, patch as ClipPatch);
        return true;
      }
      case "animate": {
        const clip = find(op.id);
        if (!clip) return false;
        const anim = (v: unknown) => (v === "none" ? null : ANIMATIONS.includes(v as ClipAnimationKind) ? { kind: v as ClipAnimationKind, duration: 0.5 } : undefined);
        const patch: Record<string, unknown> = {};
        const a = anim(op.in);
        const b = anim(op.out);
        if (a !== undefined) patch.animateIn = a ?? undefined;
        if (b !== undefined) patch.animateOut = b ?? undefined;
        p = updateClip(p, clip.id, patch as ClipPatch);
        return true;
      }
      case "keyframes": {
        const clip = find(op.id);
        if (!clip || clip.kind === "audio") return false;
        const next = { ...(clip.keyframes ?? {}) };
        let touched = false;
        for (const k of keyframeProps(clip)) {
          const raw = op[k];
          if (raw === undefined) continue;
          touched = true;
          if (raw === "none" || (Array.isArray(raw) && !raw.length)) {
            delete next[k];
            continue;
          }
          const lim = k === "x" || k === "y" ? [-0.5, 1.5] : k === "scale" ? [0.02, 20] : k === "opacity" ? [0, 1] : [-3600, 3600];
          const keys = cleanKeys(raw, (v) => clamp(v, lim[0], lim[1]))
            .map((key) => ({ ...key, t: Math.min(key.t, clip.duration) }));
          if (keys.length) next[k] = keys;
          else delete next[k];
        }
        if (!touched) return false;
        p = updateClip(p, clip.id, { keyframes: Object.keys(next).length ? next : undefined });
        return true;
      }
      case "order": {
        const clip = find(op.id);
        const dir = op.direction as Arrange;
        if (!clip || !["front", "back", "forward", "backward"].includes(dir)) return false;
        p = arrangeClip(p, clip.id, dir);
        return true;
      }
      case "duplicate": {
        const clip = find(op.id);
        if (!clip) return false;
        const r = duplicateClip(p, clip.id);
        if (!r) return false;
        p = r.project;
        created.push(r.clipId);
        return true;
      }
      case "delete": {
        const clip = find(op.id);
        if (!clip) return false;
        p = removeClip(p, clip.id);
        return true;
      }
      case "select": {
        const clip = find(op.id);
        if (!clip) return false;
        report.selectedId = clip.id;
        return true;
      }
      case "add_stock": {
        if (!ctx.importStock) {
          report.unsupported.push(String(op.op));
          return false;
        }
        const query = str(op.query) ?? "";
        const orientation = (["landscape", "portrait", "square"].includes(op.orientation as string) ? op.orientation : "all") as "all" | "landscape" | "portrait" | "square";
        const kind: StockKind = op.kind === "video" || op.kind === "audio" ? op.kind : "photo";
        const asset = await ctx.importStock(query, orientation, kind);
        if (!asset) { report.missingStock.push(query); return false; }
        if (typeof asset === "string" && kind !== "photo") return false;
        const media: AgentMedia = typeof asset === "string" ? { id: asset, kind: "image" } : asset;
        const id = insertMedia(media, op);
        if (!id) return false;
        const clip = getClip(p, id);
        if (clip && clip.kind !== "audio") place(clip, op);
        return true;
      }
      case "add_media": {
        const media = ctx.media?.find(m => m.id === op.mediaId);
        if (!media) return false;
        const id = insertMedia(media, op);
        if (!id) return false;
        const clip = getClip(p, id);
        if (clip && clip.kind !== "audio") place(clip, op);
        return true;
      }
      case "apply_brand": {
        if (!ctx.applyBrand) return false;
        p = ctx.applyBrand(p);
        return true;
      }
      case "add_logo": {
        const id = ctx.brand?.logoMediaId;
        if (!id) return false;
        const r = addImage(p, id);
        p = updateClip(r.project, r.clipId, { transform: { x: 0.88, y: 0.1, scale: 0.16, rotation: 0 } });
        onPage(r.clipId);
        return true;
      }
      case "use_template": {
        const tops = ctx.templateOps?.(String(op.template));
        if (!tops) return false;
        // A template replaces the design; its words come from the phone's language.
        p = { ...p, clips: [], settings: { ...p.settings, pages: undefined } };
        cursor = 0;
        const inner = await applyOps(p, tops, { ...ctx, time: 0, templateOps: undefined });
        p = inner.project;
        report.cursorTime = 0;
        return inner.report.applied > 0;
      }
      case "remove_background": {
        const clip = find(op.id);
        if (!clip || clip.locked || (clip.kind !== "image" && clip.kind !== "video")) return false;
        if (clip.kind === "video") {
          if (!ctx.removeVideoBackground) { report.unsupported.push(String(op.op)); return false; }
          const matte = await ctx.removeVideoBackground(clip);
          if (!matte) return false;
          p = updateClip(p, clip.id, { videoMatte: matte }); return true;
        }
        if (!ctx.removeBackground) { report.unsupported.push(String(op.op)); return false; }
        const mediaId = await ctx.removeBackground(clip.mediaId);
        if (!mediaId) return false;
        p = updateClip(p, clip.id, { mediaId });
        return true;
      }
      case "captions": {
        const clip = op.id ? find(op.id) : p.clips.find((c) => c.kind === "video" || c.kind === "audio");
        if (!clip || clip.locked || (clip.kind !== "video" && clip.kind !== "audio") || !ctx.transcribe) return false;
        const words = await ctx.transcribe(clip);
        const style: CaptionStyle = op.style === "boxed" || op.style === "bold" ? op.style : "classic";
        const captions = captionLayers(clip, words, () => newId(10), style);
        if (!captions.clips.length) return false;
        p = { ...p, tracks: [...p.tracks, captions.track], clips: [...p.clips, ...captions.clips] };
        created.push(...captions.clips.map(c => c.id));
        return true;
      }
      case "detect_shots": {
        const clip = find(op.id);
        if (!ctx.detectShots || !clip || clip.kind !== "video" || clip.locked) return false;
        const analysis = await ctx.detectShots(clip);
        const result = applyTimelineOp(p, { op: "split_points", id: clip.id, times: analysis.times }, () => newId(10));
        if (!result) return false;
        p = { ...p, clips: result.clips }; created.push(...result.created); return true;
      }
      case "beat_sync": {
        const clip = find(op.id);
        if (!ctx.detectBeats || !clip || clip.locked || (clip.kind !== "video" && clip.kind !== "audio")) return false;
        const beats = clipBeatMap(clip, await ctx.detectBeats(clip));
        if (!beats.sourceTimes.length) return false;
        const marked = { ...clip, beats }, clips = p.clips.map(c => c.id === clip.id ? marked : c);
        const result = op.align === true ? alignBeatCuts(clips, p.tracks, clipBeatTimes(marked)) : { clips, changed: 0 };
        p = { ...p, clips: result.clips };
        return op.align !== true || result.changed > 0;
      }
      case "process_audio": {
        if (!ctx.processAudio) { report.unsupported.push(op.op); return false; }
        const clip = find(op.id);
        if (!clip || clip.locked || (clip.kind !== "video" && clip.kind !== "audio") || !["normalize", "denoise", "voice"].includes(String(op.mode))) return false;
        const mediaId = await ctx.processAudio(clip, op.mode as import("./audioTools").AudioToolMode);
        if (!mediaId) return false;
        const result = audioToolLayers(clip, mediaId, () => newId(10), p.tracks.find(track => track.id === clip.trackId));
        p = { ...p, clips: [...p.clips.map(c => c.id === clip.id ? result.clip : c), ...(result.added ? [result.added] : [])], tracks: result.track ? [...p.tracks, result.track] : p.tracks };
        if (result.added) created.push(result.added.id);
        return true;
      }
      case "add_page": {
        const page = appendPage(p.settings, p.clips, cursor, op.duplicate === true, () => newId(10));
        created.push(...page.clips.slice(p.clips.length).map(c => c.id));
        p = { ...p, clips: page.clips, settings: page.settings };
        cursor = page.start; report.cursorTime = cursor;
        return true;
      }
      case "goto_page": {
        const index = num(op.index);
        const page = index !== undefined ? getPages(p.settings, p.clips)[index] : undefined;
        if (!page) return false;
        cursor = page.start; report.cursorTime = cursor;
        return true;
      }
      case "delete_page": {
        const index = num(op.index);
        const page = index !== undefined ? removePage(p.settings, p.clips, index, () => newId(10)) : null;
        if (!page) return false;
        p = { ...p, clips: page.clips, settings: page.settings };
        cursor = page.start; report.cursorTime = cursor;
        return true;
      }
      case "generate":
        report.unsupported.push(String(op.op));
        return false;
      default:
        return false;
    }
  };

  for (const op of ops) {
    const expanded = op.op === "batch" ? expandBatch(op) : [op];
    if (!expanded) { report.failed++; continue; }
    for (const edit of expanded) {
      try {
        if (await one(edit)) report.applied++;
        else report.failed++;
      } catch {
        report.failed++;
      }
    }
  }
  return { project: { ...p, updatedAt: Date.now() }, report };
}

