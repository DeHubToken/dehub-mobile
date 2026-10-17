import { multiplySvgMatrices, parseSvgTransform, SVG_IDENTITY, type SvgMatrix } from "./svgTransform";
export interface SvgGeometrySource { data: string; matrix: SvgMatrix }
/** Read supported static geometry as numbers; source markup is never rendered. */
export function svgGeometrySources(source: string): SvgGeometrySource[] {
  if (!source.includes("<")) return [{ data: source, matrix: [...SVG_IDENTITY] }];
  if (source.length > 32768 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Use a static SVG smaller than 32 KB without document declarations");
  const input = source.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const tags = /<(?:(?:[^>"'])|"[^"]*"|'[^']*')*>/g, stack: string[] = [], paths: string[] = [], sources: SvgGeometrySource[] = [], matrices: SvgMatrix[] = [];
  let offset = 0, match: RegExpExecArray | null;
  while ((match = tags.exec(input))) {
    if (input.slice(offset, match.index).trim()) throw new Error("Use SVG paths and shapes without embedded text");
    offset = tags.lastIndex;
    const tag = /^<\s*(\/?)\s*([a-z][\w:-]*)\b([\s\S]*?)(\/?)\s*>$/i.exec(match[0]);
    if (!tag) throw new Error("This SVG contains unsupported markup");
    const name = tag[2].toLowerCase();
    if (!["svg", "g", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline"].includes(name)) throw new Error("Use paths, rectangles, ellipses, lines and polygons; text, images, definitions, masks and references are unsupported");
    if (tag[1]) { if (tag[3].trim() || tag[4] || stack.pop() !== name) throw new Error("This SVG has mismatched closing tags"); matrices.pop(); continue; }
    if (name === "svg" && stack.length) throw new Error("Flatten nested SVG viewports before importing editable geometry");
    const attributes: Record<string, string> = {}, attribute = /([a-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let at = 0, item: RegExpExecArray | null;
    while ((item = attribute.exec(tag[3]))) {
      if (tag[3].slice(at, item.index).trim()) throw new Error("Use quoted SVG attributes");
      const key = item[1].toLowerCase(); if (Object.prototype.hasOwnProperty.call(attributes, key)) throw new Error("Remove duplicate SVG attributes");
      const value = item[3] ?? item[4];
      if (key.startsWith("on") || ["clip-path", "mask", "filter", "href", "xlink:href", "display", "visibility"].includes(key) || key === "style" && /(?:transform|display|visibility|clip|mask|filter|(?:^|;)\s*d)\s*:/i.test(value)) throw new Error("Flatten SVG clipping and visibility before importing editable geometry");
      if (/&/.test(value) && ["d", "points", "x", "y", "x1", "y1", "x2", "y2", "rx", "ry", "cx", "cy", "r", "width", "height"].includes(key)) throw new Error("Use literal numbers in SVG geometry");
      attributes[key] = value; at = attribute.lastIndex;
    }
    if (tag[3].slice(at).trim()) throw new Error("Use quoted SVG attributes");
    const matrix = multiplySvgMatrices(matrices[matrices.length - 1] ?? SVG_IDENTITY, parseSvgTransform(attributes.transform)), before = paths.length;
    if (name !== "svg" && name !== "g" && stack.some(parent => parent !== "svg" && parent !== "g")) throw new Error("SVG geometry must not contain child shapes");
    const number = (key: string, fallback = 0) => { const value = attributes[key]; if (value === undefined) return fallback; if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?$/i.test(value.trim())) throw new Error("Use unitless SVG geometry or pixel values"); const result = Number(value.trim().replace(/px$/i, "")); if (!Number.isFinite(result) || Math.abs(result) > 1000000) throw new Error("Keep SVG coordinates within one million units"); return result; };
    if (name === "path") { const data = attributes.d?.trim(); if (!data) throw new Error("Each SVG path needs a d value"); paths.push(data.replace(/^m/, "M")); }
    else if (name === "rect") {
      const x = number("x"), y = number("y"), width = number("width"), height = number("height"); if (width <= 0 || height <= 0) throw new Error("SVG rectangles need positive dimensions");
      const rx = Math.min(width / 2, number("rx", attributes.ry === undefined ? 0 : number("ry"))), ry = Math.min(height / 2, number("ry", rx));
      if (rx < 0 || ry < 0) throw new Error("Use nonnegative SVG corner radii");
      paths.push(rx && ry ? `M${x + rx} ${y}H${x + width - rx}A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}V${y + height - ry}A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}H${x + width}V${y + height}H${x}Z`);
    } else if (name === "circle" || name === "ellipse") {
      const x = number("cx"), y = number("cy"), rx = number(name === "circle" ? "r" : "rx"), ry = number(name === "circle" ? "r" : "ry"); if (rx <= 0 || ry <= 0) throw new Error("SVG ellipses need positive radii"); paths.push(`M${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}Z`);
    } else if (name === "line") paths.push(`M${number("x1")} ${number("y1")}L${number("x2")} ${number("y2")}`);
    else if (name === "polygon" || name === "polyline") {
      const raw = attributes.points ?? "", values = raw.trim().split(/[\s,]+/); if (values.length < 4 || values.length % 2 || values.some(value => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1000000)) throw new Error("Use pairs of literal numbers for polygon points");
      paths.push(values.map((value, index) => index % 2 ? value : (index ? "L" : "M") + value).join(" ") + (name === "polygon" ? "Z" : ""));
    }
    if (paths.length > before) sources.push({ data: paths[paths.length - 1], matrix });
    if (paths.length > 100) throw new Error("Import up to one hundred SVG shapes at a time");
    if (!tag[4]) { stack.push(name); matrices.push(matrix); }
  }
  if (input.slice(offset).trim() || stack.length || !paths.length) throw new Error("Choose a complete SVG with supported static geometry");
  const result = paths.join(" "); if (result.length > 32768) throw new Error("Simplify the SVG before importing it"); return sources;
}
