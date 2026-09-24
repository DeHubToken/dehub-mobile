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
  placementPatch,
  removeClip,
  setAspect,
  setBackground,
  updateClip,
  type Arrange,
  type ClipPatch,
} from "./project";
import { applyFilterPreset } from "./filterPresets";
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

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentOp {
  op: string;
  [field: string]: unknown;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function describeScene(p: ProjectSnapshot, selectedId: string | null, brand: BrandKit | null) {
  const z = new Map(p.tracks.map((t, i) => [t.id, i]));
  const layers = p.clips
    .filter((c) => c.kind !== "audio")
    .sort((a, b) => (z.get(a.trackId) ?? 0) - (z.get(b.trackId) ?? 0))
    .map((c) => {
      const tr = getTransform(c);
      const base: Record<string, unknown> = { id: c.id, kind: c.kind, x: round(tr.x), y: round(tr.y) };
      if (tr.rotation) base.rotation = round(tr.rotation, 1);
      if ((tr.opacity ?? 1) !== 1) base.opacity = round(tr.opacity ?? 1, 2);
      if (c.blend && c.blend !== "normal") base.blend = c.blend;
      if (c.locked) base.locked = true;
      if (c.hidden) base.hiddenLayer = true;
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
      return out;
    });
  const hasBrand = !!brand && (brand.colors.length > 0 || !!brand.headingFont || !!brand.bodyFont || !!brand.logoMediaId);
  return {
    brand: hasBrand
      ? {
          colors: brand!.colors,
          headingFont: brand!.headingFont?.split(",")[0].replace(/'/g, ""),
          bodyFont: brand!.bodyFont?.split(",")[0].replace(/'/g, ""),
          hasLogo: !!brand!.logoMediaId,
        }
      : undefined,
    page: { width: p.settings.width, height: p.settings.height, aspect: p.settings.aspectPreset, background: p.settings.background, duration: 5 },
    playhead: 0,
    selected: selectedId ? [selectedId] : [],
    layers,
    // The phone keeps pictures per design; the agent adds new ones from stock.
    library: [],
  };
}

export async function askAgent(messages: AgentMessage[], scene: unknown, signal?: AbortSignal): Promise<{ reply: string; ops: AgentOp[] }> {
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
  /** Download a free stock photo into editor storage; resolves with its media id. */
  importStock?: (query: string, orientation: "all" | "landscape" | "portrait" | "square") => Promise<string | null>;
  brand?: BrandKit | null;
  /** Restyle the design with the brand kit (libs/editor/brand.ts). */
  applyBrand?: (p: ProjectSnapshot) => ProjectSnapshot;
  /** Starter template by id, as ops (libs/editor/templates.ts). */
  templateOps?: (id: string) => AgentOp[] | null;
  /** Cut the subject out of a picture on the phone; resolves with the new media id. */
  removeBackground?: (mediaId: string) => Promise<string | null>;
}

export interface ApplyReport {
  applied: number;
  failed: number;
  missingStock: string[];
  /** Asked for something the phone does not do yet (captions, AI generation, pages). */
  unsupported: string[];
  selectedId: string | null;
}

export async function applyOps(start: ProjectSnapshot, ops: AgentOp[], ctx: ApplyContext = {}): Promise<{ project: ProjectSnapshot; report: ApplyReport }> {
  let p = start;
  const report: ApplyReport = { applied: 0, failed: 0, missingStock: [], unsupported: [], selectedId: null };
  const created: string[] = [];
  const resolve = (id: unknown): string | undefined => {
    if (typeof id !== "string") return undefined;
    const m = /^new:(\d+)$/.exec(id);
    return m ? created[Number(m[1])] : id;
  };
  const find = (id: unknown): Clip | null => getClip(p, resolve(id) ?? null);

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
    const out: Record<string, unknown> = Object.keys(patch).length ? { ...placementPatch(clip, patch) } : {};
    if ((op.fit === "cover" || op.fit === "contain") && (clip.kind === "image" || clip.kind === "video")) out.fit = op.fit;
    if (Object.keys(out).length) p = updateClip(p, clip.id, out as ClipPatch);
  };

  const one = async (op: AgentOp): Promise<boolean> => {
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
        if (!ctx.importStock || (op.kind && op.kind !== "photo" && op.kind !== "image")) {
          report.unsupported.push(String(op.op));
          return false;
        }
        const query = str(op.query) ?? "";
        const orientation = (["landscape", "portrait", "square"].includes(op.orientation as string) ? op.orientation : "all") as "all" | "landscape" | "portrait" | "square";
        const mediaId = await ctx.importStock(query, orientation);
        if (!mediaId) { report.missingStock.push(query); return false; }
        const r = addImage(p, mediaId);
        p = r.project;
        created.push(r.clipId);
        const clip = getClip(p, r.clipId);
        if (clip) place(clip, op);
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
        return true;
      }
      case "use_template": {
        const tops = ctx.templateOps?.(String(op.template));
        if (!tops) return false;
        // A template replaces the design; its words come from the phone's language.
        p = { ...p, clips: [] };
        const inner = await applyOps(p, tops, { ...ctx, templateOps: undefined });
        p = inner.project;
        return inner.report.applied > 0;
      }
      case "remove_background": {
        const clip = find(op.id);
        if (!clip || clip.kind !== "image") return false;
        if (!ctx.removeBackground) { report.unsupported.push(String(op.op)); return false; }
        const mediaId = await ctx.removeBackground(clip.mediaId);
        if (!mediaId) return false;
        p = updateClip(p, clip.id, { mediaId });
        return true;
      }
      case "add_page": case "goto_page": case "captions": case "generate": case "timing": case "audio": case "add_media":
        report.unsupported.push(String(op.op));
        return false;
      default:
        return false;
    }
  };

  for (const op of ops) {
    try {
      if (await one(op)) report.applied++;
      else report.failed++;
    } catch {
      report.failed++;
    }
  }
  return { project: { ...p, updatedAt: Date.now() }, report };
}

