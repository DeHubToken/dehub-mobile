import { scaleStrokePaint } from "./strokePatterns";
import { groupedSelection } from "./designGroups";
import { resolveClipAt } from "./keyframes";
import type { DesignLayoutBox } from "./designLayout";
import type { Clip, ClipTransform, ProjectSnapshot } from "./types";
export type SelectionTransform = { kind: "scale"; factor: number } | { kind: "rotate"; degrees: number } | { kind: "flip"; axis: "horizontal" | "vertical" } | { kind: "opacity"; value: number };
export interface SelectionTransformPlan { id: string; placement: Partial<ClipTransform>; extra: Record<string, unknown> }
function scaledAppearance(clip: Clip, factor: number): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (clip.shadow) extra.shadow = { ...clip.shadow, blur: clip.shadow.blur * factor, offsetX: clip.shadow.offsetX * factor, offsetY: clip.shadow.offsetY * factor };
  if (clip.kind === "text") {
    if (clip.fontSize * factor < 6 || clip.fontSize * factor > 1000) throw new Error("This size would move some text outside the supported font range");
    extra.fontSize = clip.fontSize * factor;
    if (clip.maxWidth !== undefined) extra.maxWidth = clip.maxWidth * factor;
    if (clip.maxHeight !== undefined) extra.maxHeight = clip.maxHeight * factor;
    if (clip.letterSpacing !== undefined) extra.letterSpacing = clip.letterSpacing * factor;
    if (clip.stroke) extra.stroke = scaleStrokePaint(clip.stroke, factor);
    if (clip.background) extra.background = { ...clip.background, padding: clip.background.padding * factor, radius: clip.background.radius * factor };
    if (clip.echo) { if (clip.echo.some(layer => Math.abs(layer.x * factor) > 100 || Math.abs(layer.y * factor) > 100)) throw new Error("This size would exceed the supported text echo distance"); extra.echo = clip.echo.map(layer => ({ ...layer, x: layer.x * factor, y: layer.y * factor })); }
  } else {
    if (clip.kind === "shape" && clip.stroke) extra.stroke = scaleStrokePaint(clip.stroke, factor);
    if (clip.kind !== "audio" && clip.radius !== undefined) extra.radius = clip.radius * factor;
    if (clip.kind !== "shape" && clip.border) extra.border = scaleStrokePaint(clip.border, factor);
  }
  return extra;
}
export function planSelectionTransform(project: ProjectSnapshot, ids: readonly string[], time: number, measured: readonly DesignLayoutBox[], operation: SelectionTransform): SelectionTransformPlan[] {
  if (operation.kind === "scale" && (!Number.isFinite(operation.factor) || operation.factor <= 0 || operation.factor > 10) || operation.kind === "rotate" && !Number.isFinite(operation.degrees)) throw new Error("Choose a valid scale or rotation");
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const layers = project.clips.filter(clip => chosen.has(clip.id) && clip.kind !== "audio" && !clip.hidden && !clip.isPageBackground && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
  if (!layers.length) return [];
  if (layers.some(clip => clip.locked)) throw new Error("Unlock the selected layers before transforming them");
  if (operation.kind === "opacity") {
    if (!Number.isFinite(operation.value) || operation.value < 0 || operation.value > 1) throw new Error("Use an opacity between 0 and 100 percent");
    return layers.map(clip => ({ id: clip.id, placement: { opacity: operation.value }, extra: {} }));
  }
  const boxes = layers.map(clip => measured.find(box => box.id === clip.id));
  if (boxes.some(box => !box || ![box.cx, box.cy, box.w, box.h, box.rotation].every(Number.isFinite))) throw new Error("Wait for the selected layers to appear on the canvas");
  const bounds = boxes.map(box => { const b = box!, angle = b.rotation * Math.PI / 180, hw = (Math.abs(Math.cos(angle)) * b.w + Math.abs(Math.sin(angle)) * b.h) / 2, hh = (Math.abs(Math.sin(angle)) * b.w + Math.abs(Math.cos(angle)) * b.h) / 2; return { left: b.cx - hw, right: b.cx + hw, top: b.cy - hh, bottom: b.cy + hh }; });
  const W = project.settings.width, H = project.settings.height, cx = (Math.min(...bounds.map(box => box.left)) + Math.max(...bounds.map(box => box.right))) / 2, cy = (Math.min(...bounds.map(box => box.top)) + Math.max(...bounds.map(box => box.bottom))) / 2;
  return layers.map(clip => {
    const resolved = resolveClipAt(clip, time), transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...resolved.transform };
    if (resolved.kind === "text") { transform.x = resolved.x; transform.y = resolved.y; }
    const box = measured.find(box => box.id === clip.id)!, offsetX = box.cx - transform.x * W, offsetY = box.cy - transform.y * H;
    let x = box.cx - cx, y = box.cy - cy;
    const placement: Partial<ClipTransform> = {}, extra: Record<string, unknown> = {};
    if (operation.kind === "rotate") {
      const angle = operation.degrees * Math.PI / 180, nextX = x * Math.cos(angle) - y * Math.sin(angle); y = x * Math.sin(angle) + y * Math.cos(angle); x = nextX; placement.rotation = transform.rotation + operation.degrees;
    } else if (operation.kind === "flip") {
      if (operation.axis === "horizontal") { x = -x; placement.flipH = !transform.flipH; } else { y = -y; placement.flipV = !transform.flipV; }
      placement.rotation = -transform.rotation;
    } else {
      x *= operation.factor; y *= operation.factor;
      if (clip.kind !== "text") { const scale = transform.scale * operation.factor; if (scale < 0.05 || scale > 20) throw new Error("This size would move some layers outside the supported scale range"); placement.scale = scale; }
      Object.assign(extra, scaledAppearance(resolved, operation.factor));
    }
    const factor = operation.kind === "scale" ? operation.factor : 1;
    placement.x = (cx + x - offsetX * factor) / W; placement.y = (cy + y - offsetY * factor) / H;
    return { id: clip.id, placement, extra };
  });
}
