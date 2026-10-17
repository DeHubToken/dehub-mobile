import { connectorGeometry, connectorSvgPath } from "./connectors";
import { freehandSvg } from "./freehand";
import { gradientSvgDocument } from "./gradientSvgDocument";
import { resolveClipAt } from "./keyframes";
import { paintOpacity } from "./paintOpacity";
import { selectedDesignVectors } from "./selectedVectorStyle";
import { shapePolygon } from "./shapeGeometry";
import { strokeDashOffset } from "./strokePatterns";
import { VECTOR_SYMBOLS } from "./vectorSymbols";
import type { ProjectSnapshot, ShapeClip } from "./types";
const n = (value: number) => String(Number(value.toFixed(5)));
const xml = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colour = (value: string | null | undefined) => value && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value) ? value : "none";
function ellipsePath(x: number, y: number, rx: number, ry: number): string {
  return `M${n(x + rx)} ${n(y)} A${n(rx)} ${n(ry)} 0 1 0 ${n(x - rx)} ${n(y)} A${n(rx)} ${n(ry)} 0 1 0 ${n(x + rx)} ${n(y)} Z`;
}
function vectorPath(clip: ShapeClip, w: number, h: number, k: number): string {
  if (clip.connector) return connectorSvgPath(w, h, clip.connector);
  if (clip.symbol) {
    const symbol = VECTOR_SYMBOLS.find(symbol => symbol.id === clip.symbol);
    if (!symbol) throw new Error("This symbol is unavailable in the vector catalogue");
    const x = (value: number) => (value / 24 - 0.5) * w, y = (value: number) => (value / 24 - 0.5) * h;
    return symbol.parts.map(part => part.ellipse ? ellipsePath(x(part.ellipse[0]), y(part.ellipse[1]), part.ellipse[2] / 24 * w, part.ellipse[3] / 24 * h) : (part.points ?? []).map((point, index) => `${index ? "L" : "M"}${n(x(point[0]))} ${n(y(point[1]))}`).join(" ") + (part.closed ? " Z" : "")).join(" ");
  }
  if (clip.shape === "path") return freehandSvg(clip.points ?? [], w, h, clip.pathSmoothing ?? 1, !!clip.closedPath);
  const polygon = shapePolygon(clip.shape, w, h, clip.geometry), a = w / 2, b = h / 2;
  if (polygon) return polygon.map((point, index) => `${index ? "L" : "M"}${n(point[0])} ${n(point[1])}`).join(" ") + " Z";
  if (clip.shape === "ellipse") return ellipsePath(0, 0, a, b);
  if (clip.shape === "triangle") return `M0 ${n(-b)} L${n(a)} ${n(b)} L${n(-a)} ${n(b)} Z`;
  if (clip.shape === "hexagon") return Array.from({ length: 6 }, (_, index) => `${index ? "L" : "M"}${n(Math.cos(index * Math.PI / 3) * a)} ${n(Math.sin(index * Math.PI / 3) * b)}`).join(" ") + " Z";
  if (clip.shape === "heart") return `M0 ${n(b)} C${n(-a * 1.1)} ${n(b * 0.1)} ${n(-a * 0.9)} ${n(-b * 1.1)} 0 ${n(-b * 0.45)} C${n(a * 0.9)} ${n(-b * 1.1)} ${n(a * 1.1)} ${n(b * 0.1)} 0 ${n(b)} Z`;
  if (clip.shape === "line" || clip.shape === "arrow") {
    const line = `M${n(-a)} 0 L${n(a)} 0`, head = Math.min(w * 0.3, Math.max(h * 1.5, 12));
    return line + (clip.shape === "arrow" ? ` M${n(a - head)} ${n(-head * 0.6)} L${n(a)} 0 L${n(a - head)} ${n(head * 0.6)}` : "");
  }
  if (clip.shape !== "rect") throw new Error("This shape does not support vector export");
  const r = Math.max(0, Math.min((clip.radius ?? 0) * k, a, b));
  return r ? `M${n(-a + r)} ${n(-b)} H${n(a - r)} A${n(r)} ${n(r)} 0 0 1 ${n(a)} ${n(-b + r)} V${n(b - r)} A${n(r)} ${n(r)} 0 0 1 ${n(a - r)} ${n(b)} H${n(-a + r)} A${n(r)} ${n(r)} 0 0 1 ${n(-a)} ${n(b - r)} V${n(-b + r)} A${n(r)} ${n(r)} 0 0 1 ${n(-a + r)} ${n(-b)} Z` : `M${n(-a)} ${n(-b)} H${n(a)} V${n(b)} H${n(-a)} Z`;
}
export interface VectorArtworkSvgOptions { scope?: "selection" | "page"; background?: boolean; padding?: number }
export function vectorArtworkSvgDocument(project: ProjectSnapshot, ids: readonly string[], time: number, options: VectorArtworkSvgOptions = {}): string {
  const padding = options.padding ?? 0;
  if (options.scope !== undefined && !["selection", "page"].includes(options.scope) || !Number.isFinite(padding) || padding < 0 || padding > 128 || options.background !== undefined && typeof options.background !== "boolean") throw new Error("Choose valid vector export dimensions, padding and background options");
  const vectors = selectedDesignVectors(project, ids, time).filter(clip => !clip.photoFrame);
  if (!vectors.length || vectors.length > 100) throw new Error("Select one to 100 ordinary vector layers to download");
  const W = project.settings.width, H = project.settings.height, k = H / 1080;
  if (![W, H].every(value => Number.isFinite(value) && value >= 1 && value <= 16384)) throw new Error("Use a supported page size for vector export");
  const order = new Map(project.tracks.map((track, index) => [track.id, index]));
  const definitions: string[] = [], layers: string[] = [], bounds: { left: number; top: number; right: number; bottom: number }[] = [];
  vectors.sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0)).forEach((source, index) => {
    const clip = resolveClipAt(source, time) as ShapeClip, tr = { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...clip.transform }, w = Math.max(1, clip.w * W * tr.scale), h = Math.max(1, clip.h * H * tr.scale);
    if (![w, h, tr.x, tr.y, tr.rotation].every(Number.isFinite) || w > 65536 || h > 65536) throw new Error("Choose vector layers within the supported dimensions");
    if (clip.blend && !["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"].includes(clip.blend)) throw new Error("Use a standard colour blend mode before downloading this vector artwork");
    const open = !!clip.connector || clip.shape === "line" || clip.shape === "arrow" || clip.shape === "path" && !clip.closedPath;
    const stroke = clip.stroke ?? (open ? { color: clip.fill ?? "#ffffff", width: 8 } : null), strokeWidth = Math.max(0, stroke?.width ?? 0) * k;
    let fill = colour(clip.fill), line = colour(stroke?.color), filter = "";
    if (clip.gradient) {
      const id = "vector-paint-" + index, document = gradientSvgDocument(clip.gradient, w, h), definition = /<defs>([\s\S]*?)<\/defs>/.exec(document)?.[1];
      if (!definition) throw new Error("Complete the gradient before downloading this vector");
      definitions.push(definition.replace(/id="paint"/g, `id="${id}"`).replace(/<(linearGradient|radialGradient) /, `<$1 gradientTransform="translate(${n(-w / 2)} ${n(-h / 2)})" `));
      if (!clip.symbol || clip.fill) fill = `url(#${id})`;
      if (open || clip.symbol && !clip.fill) line = `url(#${id})`;
    }
    if (clip.shadow && clip.shadow.opacity > 0) {
      const id = "vector-shadow-" + index, shadow = clip.shadow;
      definitions.push(`<filter id="${id}" x="-200%" y="-200%" width="500%" height="500%" color-interpolation-filters="sRGB"><feDropShadow dx="${n(shadow.offsetX * k)}" dy="${n(shadow.offsetY * k)}" stdDeviation="${n(Math.max(0, shadow.blur * k / 2))}" flood-color="${colour(shadow.color)}" flood-opacity="${n(paintOpacity(shadow.opacity))}"/></filter>`); filter = ` filter="url(#${id})"`;
    }
    const dash = (stroke?.dash ?? []).filter(value => Number.isFinite(value) && value >= 0).slice(0, 8).map(value => n(value * k));
    const paint = `fill="${open ? "none" : fill}" fill-opacity="${n(paintOpacity(clip.fillOpacity))}" stroke="${strokeWidth > 0 ? line : "none"}" stroke-width="${n(strokeWidth)}" stroke-opacity="${n(paintOpacity(stroke?.opacity))}" stroke-linecap="${clip.connector ? "round" : clip.strokeCap ?? "round"}" stroke-linejoin="${clip.connector ? "round" : clip.strokeJoin ?? "round"}"${dash.length ? ` stroke-dasharray="${dash.join(" ")}" stroke-dashoffset="${n(strokeDashOffset(stroke?.dashOffset) * k)}"` : ""}`;
    const d = vectorPath(clip, w, h, k);
    let artwork = filter && !open && fill !== "none" ? `<path d="${d}" ${paint.replace(/stroke="[^"]*"/, 'stroke="none"')}${filter}/><path d="${d}" ${paint.replace(/fill="[^"]*"/, 'fill="none"')}/>` : `<path d="${d}" ${paint}${filter}/>`;
    if (clip.connector) {
      const style = clip.connector, geometry = connectorGeometry(w, h, style), size = Math.min(w / 5, Math.max(strokeWidth * 3.5, w / 35));
      for (const end of [false, true]) {
        const cap = end ? style.end : style.start; if (cap === "none" || strokeWidth <= 0) continue;
        const tip = end ? geometry.points[geometry.points.length - 1] : geometry.points[0], from = geometry.controls ? geometry.controls[end ? 1 : 0] : geometry.points[end ? geometry.points.length - 2 : 1], angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]), dx = Math.cos(angle), dy = Math.sin(angle), cx = tip[0] - dx * size / 2, cy = tip[1] - dy * size / 2;
        const d = cap === "circle" ? ellipsePath(cx, cy, size / 2, size / 2) : `M${tip.map(n).join(" ")} L${n(cx - dy * size / 2)} ${n(cy + dx * size / 2)} L${n(tip[0] - dx * size * (cap === "diamond" ? 1 : 0.85))} ${n(tip[1] - dy * size * (cap === "diamond" ? 1 : 0.85))} L${n(cx + dy * size / 2)} ${n(cy - dx * size / 2)} Z`;
        artwork += `<path d="${d}" fill="${line}" fill-opacity="${n(paintOpacity(stroke?.opacity))}"${filter}/>`;
      }
    }
    layers.push(`<g transform="translate(${n(tr.x * W)} ${n(tr.y * H)}) rotate(${n(tr.rotation)}) scale(${tr.flipH ? -1 : 1} ${tr.flipV ? -1 : 1})" opacity="${n(paintOpacity(tr.opacity))}"${clip.blend && clip.blend !== "normal" ? ` style="mix-blend-mode:${clip.blend}"` : ""}><title>${xml(clip.label || "Vector layer " + (index + 1))}</title>${artwork}</g>`);
    const angle = tr.rotation * Math.PI / 180, head = clip.shape === "arrow" ? Math.min(w * 0.3, Math.max(h * 1.5, 12)) * 0.6 : 0, capPadding = clip.connector ? Math.min(w / 5, Math.max(strokeWidth * 3.5, w / 35)) : 0, verticalExtent = !clip.connector && !clip.symbol && clip.shape === "line" ? 0 : clip.shape === "arrow" ? head : h / 2, padding = Math.max(2, strokeWidth * 4, capPadding) + (clip.shadow ? (clip.shadow.blur * 3 + Math.abs(clip.shadow.offsetX) + Math.abs(clip.shadow.offsetY)) * k : 0), halfW = Math.abs(Math.cos(angle)) * w / 2 + Math.abs(Math.sin(angle)) * verticalExtent + padding, halfH = Math.abs(Math.sin(angle)) * w / 2 + Math.abs(Math.cos(angle)) * verticalExtent + padding;
    bounds.push({ left: tr.x * W - halfW, right: tr.x * W + halfW, top: tr.y * H - halfH, bottom: tr.y * H + halfH });
  });
  const left = options.scope === "page" ? 0 : Math.min(...bounds.map(box => box.left)) - padding, top = options.scope === "page" ? 0 : Math.min(...bounds.map(box => box.top)) - padding, width = options.scope === "page" ? W : Math.max(...bounds.map(box => box.right)) - left + padding, height = options.scope === "page" ? H : Math.max(...bounds.map(box => box.bottom)) - top + padding;
  const background = options.background ? `<rect x="${n(left)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" fill="${colour(project.settings.background)}"/>` : "";
  const scale = Math.min(1, 8192 / Math.max(width, height));
  const document = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n(width * scale)}" height="${n(height * scale)}" viewBox="${n(left)} ${n(top)} ${n(width)} ${n(height)}" role="img" aria-labelledby="vector-title"><title id="vector-title">${xml(project.title || "Vector artwork")}</title><defs>${definitions.join("")}</defs><g style="isolation:isolate">${background}${layers.join("")}</g></svg>\n`;
  if (document.length > 2 * 1024 * 1024) throw new Error("Choose fewer vector layers to keep the SVG within two megabytes");
  return document;
}
