/**
 * Lucide icons as cached SVG images instead of live react-native-svg trees.
 *
 * Measured on a Galaxy S24+: a feed card carries ten or more icons, and each
 * one as react-native-svg is four to six native views (the SvgView, a group
 * and one view per path) that Android rasterises to a fresh bitmap when the
 * card mounts. That mount — Fabric creating the views, then recording ~100
 * display lists, then uploading the icon bitmaps — took about 16ms, two
 * frames at 120Hz, which is the hitch felt every time a card scrolled into
 * view. As an `expo-image` source the same icon is one native view, decoded
 * once and served from the bitmap cache on every later mount.
 *
 * No new dependency: lucide-react-native's icon components are pure
 * functions that return an <Svg> element tree, so calling one with props and
 * walking the result gives back the path data.
 */
import type { ComponentType } from "react";
import * as NativeSvg from "react-native-svg";

type IconComponent = ComponentType<any> & { render?: (props: any, ref: any) => any };

interface IconStyle {
  color: string;
  strokeWidth: number;
  fill: string;
}

const TAG_BY_TYPE = new Map<unknown, string>([
  [NativeSvg.Path, "path"],
  [NativeSvg.Circle, "circle"],
  [NativeSvg.Ellipse, "ellipse"],
  [NativeSvg.Line, "line"],
  [NativeSvg.Polyline, "polyline"],
  [NativeSvg.Polygon, "polygon"],
  [NativeSvg.Rect, "rect"],
]);

const GEOMETRY_ATTRS = [
  "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
  "width", "height", "points",
] as const;

const nodeCache = new Map<string, string>();
const uriCache = new Map<string, string>();

function escapeAttr(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The icon's shapes as SVG markup, without the root element. */
function shapesFor(name: string, Icon: IconComponent): string | null {
  const cached = nodeCache.get(name);
  if (cached !== undefined) return cached;
  const render = Icon.render ?? (Icon as unknown as (props: any, ref: any) => any);
  let element: any;
  try {
    element = render({ size: 24, color: "#000", strokeWidth: 2 }, null);
  } catch {
    return null;
  }
  const children = element?.props?.children;
  if (!Array.isArray(children)) return null;
  const parts: string[] = [];
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const tag = TAG_BY_TYPE.get(child.type);
    if (!tag) return null; // an element this renderer does not know: fall back
    const attrs: string[] = [];
    for (const key of GEOMETRY_ATTRS) {
      const v = child.props?.[key];
      if (v !== undefined && v !== null) attrs.push(`${key}="${escapeAttr(v)}"`);
    }
    parts.push(`<${tag} ${attrs.join(" ")}/>`);
  }
  if (!parts.length) return null;
  const markup = parts.join("");
  nodeCache.set(name, markup);
  return markup;
}

/**
 * A `data:` URI for the icon in the given colour, or null when the icon
 * cannot be expressed this way (caller renders the live component instead).
 */
export function lucideSvgUri(
  name: string,
  Icon: IconComponent,
  { color, strokeWidth, fill }: IconStyle,
): string | null {
  const key = `${name}|${color}|${strokeWidth}|${fill}`;
  const hit = uriCache.get(key);
  if (hit !== undefined) return hit || null;
  const shapes = shapesFor(name, Icon);
  if (!shapes) {
    uriCache.set(key, "");
    return null;
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ` +
    `fill="${escapeAttr(fill)}" stroke="${escapeAttr(color)}" stroke-width="${escapeAttr(strokeWidth)}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  uriCache.set(key, uri);
  return uri;
}

export function __resetIconSvgCacheForTests(): void {
  nodeCache.clear();
  uriCache.clear();
}
