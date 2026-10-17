import { svgGeometrySources } from "./svgGeometrySource";
import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";
type Point = [number, number];
export interface ImportedPathPart { points: Point[]; closed: boolean; left: number; top: number; width: number; height: number }
export interface ImportedPath { points: Point[]; closed: boolean; width: number; height: number; left: number; top: number; parts: ImportedPathPart[] }
function parseSvgPathData(input: string, steps = 24): ImportedPath {
  if (!input.trim() || input.length > 32768) throw new Error("Paste SVG path data up to 32,768 characters");
  const tokens: string[] = [], pattern = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/gy;
  let offset = 0;
  while (offset < input.length) {
    if (/[\s,]/.test(input[offset])) { offset++; continue; }
    pattern.lastIndex = offset; const match = pattern.exec(input);
    if (!match) throw new Error("Paste only the SVG path d value, beginning with M");
    tokens.push(match[0]); offset = pattern.lastIndex;
    if (tokens.length > 8192) throw new Error("Simplify this path before importing it");
  }
  let cursor = 0, command = "", previous = "", x = 0, y = 0, startX = 0, startY = 0, moved = false, closed = false;
  let control: Point | null = null;
  let points: Point[] = [], total = 0;
  const paths: { points: Point[]; closed: boolean }[] = [];
  const finish = () => { if (points.length >= 2) { if (paths.length >= 100) throw new Error("Import up to one hundred outlined subpaths at a time"); paths.push({ points, closed }); } points = []; };
  const samples = Math.max(8, Math.min(64, Math.round(Number.isFinite(steps) ? steps : 24)));
  const numeric = () => cursor < tokens.length && !/^[a-z]$/i.test(tokens[cursor]);
  const number = () => { if (!numeric()) throw new Error("This SVG path is missing coordinates"); const value = Number(tokens[cursor++]); if (!Number.isFinite(value) || Math.abs(value) > 1000000) throw new Error("Keep SVG coordinates within one million units"); return value; };
  const append = (px: number, py: number) => { if (![px, py].every(Number.isFinite) || Math.abs(px) > 2000000 || Math.abs(py) > 2000000) throw new Error("The SVG path extends beyond supported coordinates"); if (total >= 4096) throw new Error("Simplify this path or choose fewer curve samples"); if (!points.length || Math.hypot(px - points[points.length - 1][0], py - points[points.length - 1][1]) > 1e-10) { points.push([px, py]); total++; } };
  while (cursor < tokens.length) {
    if (/^[a-z]$/i.test(tokens[cursor])) command = tokens[cursor++];
    else if (!command) throw new Error("Begin the SVG path with a move command");
    if (!/^[mlhvcsqtaz]$/i.test(command)) throw new Error("Use SVG move, line, curve, arc and close commands");
    const kind = command.toUpperCase(), relative = command !== kind;
    if (closed && kind !== "M") throw new Error("Start the next subpath with M or m after closing with Z");
    if (!moved && kind !== "M") throw new Error("Begin the SVG path with M or m");
    if (kind === "Z") { closed = true; x = startX; y = startY; control = null; previous = kind; command = ""; continue; }
    const oldX = x, oldY = y;
    const point = (): Point => { const px = number(), py = number(); return [px + (relative ? oldX : 0), py + (relative ? oldY : 0)]; };
    if (kind === "M") {
      if (moved) finish(); closed = false;
      [x, y] = point(); startX = x; startY = y; append(x, y); moved = true; control = null; command = relative ? "l" : "L";
    } else if (kind === "L") { [x, y] = point(); append(x, y); control = null; }
    else if (kind === "H") { x = number() + (relative ? oldX : 0); append(x, y); control = null; }
    else if (kind === "V") { y = number() + (relative ? oldY : 0); append(x, y); control = null; }
    else if (kind === "C" || kind === "S") {
      const a: Point = kind === "C" ? point() : control && (previous === "C" || previous === "S") ? [2 * oldX - control[0], 2 * oldY - control[1]] : [oldX, oldY];
      const b = point(), end = point();
      for (let index = 1; index <= samples; index++) { const t = index / samples, u = 1 - t; append(u ** 3 * oldX + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t ** 3 * end[0], u ** 3 * oldY + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t ** 3 * end[1]); }
      [x, y] = end; control = b;
    } else if (kind === "Q" || kind === "T") {
      const a: Point = kind === "Q" ? point() : control && (previous === "Q" || previous === "T") ? [2 * oldX - control[0], 2 * oldY - control[1]] : [oldX, oldY], end = point();
      for (let index = 1; index <= samples; index++) { const t = index / samples, u = 1 - t; append(u * u * oldX + 2 * u * t * a[0] + t * t * end[0], u * u * oldY + 2 * u * t * a[1] + t * t * end[1]); }
      [x, y] = end; control = a;
    } else if (kind === "A") {
      let rx = Math.abs(number()), ry = Math.abs(number()); const phi = number() % 360 * Math.PI / 180, large = number(), sweep = number(), end = point();
      if ((large !== 0 && large !== 1) || (sweep !== 0 && sweep !== 1)) throw new Error("SVG arc flags must be 0 or 1");
      if (!rx || !ry || Math.hypot(end[0] - oldX, end[1] - oldY) < 1e-10) append(end[0], end[1]);
      else {
        const cos = Math.cos(phi), sin = Math.sin(phi), dx = (oldX - end[0]) / 2, dy = (oldY - end[1]) / 2, px = cos * dx + sin * dy, py = -sin * dx + cos * dy;
        const stretch = px * px / (rx * rx) + py * py / (ry * ry); if (stretch > 1) { rx *= Math.sqrt(stretch); ry *= Math.sqrt(stretch); }
        const denominator = rx * rx * py * py + ry * ry * px * px;
        const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - denominator) / denominator));
        const cx = factor * rx * py / ry, cy = -factor * ry * px / rx, centreX = cos * cx - sin * cy + (oldX + end[0]) / 2, centreY = sin * cx + cos * cy + (oldY + end[1]) / 2;
        const ux = (px - cx) / rx, uy = (py - cy) / ry, vx = (-px - cx) / rx, vy = (-py - cy) / ry, theta = Math.atan2(uy, ux);
        let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); if (!sweep && delta > 0) delta -= Math.PI * 2; if (sweep && delta < 0) delta += Math.PI * 2;
        const count = Math.max(1, Math.ceil(Math.abs(delta) / Math.PI * samples));
        for (let index = 1; index <= count; index++) { const at = theta + delta * index / count; append(centreX + cos * rx * Math.cos(at) - sin * ry * Math.sin(at), centreY + sin * rx * Math.cos(at) + cos * ry * Math.sin(at)); }
      }
      [x, y] = end; control = null;
    }
    previous = kind;
    if (cursor < tokens.length && !numeric() && !/^[a-z]$/i.test(tokens[cursor])) throw new Error("This path contains an invalid command");
  }
  finish();
  return normaliseImportedPaths(paths);
}
function normaliseImportedPaths(paths: { points: Point[]; closed: boolean }[], independentFills = false): ImportedPath {
  if (paths.length > 100 || paths.reduce((total, path) => total + path.points.length, 0) > 4096) throw new Error("Import up to one hundred subpaths sharing four thousand drawing points");
  if (paths.some(path => path.points.some(point => point.some(value => !Number.isFinite(value) || Math.abs(value) > 2000000)))) throw new Error("The transformed SVG exceeds supported coordinates");
  const all = paths.flatMap(path => path.points);
  if (all.length < 2) throw new Error("Use a path with at least two distinct points");
  const xs = all.map(point => point[0]), ys = all.map(point => point[1]), left = Math.min(...xs), top = Math.min(...ys), width = Math.max(0.001, Math.max(...xs) - left), height = Math.max(0.001, Math.max(...ys) - top);
  const parts: ImportedPathPart[] = paths.map(path => {
    const px = path.points.map(point => point[0]), py = path.points.map(point => point[1]), x = Math.min(...px), y = Math.min(...py), w = Math.max(0.001, Math.max(...px) - x), h = Math.max(0.001, Math.max(...py) - y);
    return { points: path.points.map(point => [(point[0] - x) / w - 0.5, (point[1] - y) / h - 0.5] as Point), closed: path.closed, left: x - left, top: y - top, width: w, height: h };
  });
  return { points: all.map(point => [(point[0] - left) / width - 0.5, (point[1] - top) / height - 0.5] as Point), closed: (parts.length === 1 || independentFills) && parts.every(part => part.closed), width, height, left, top, parts };
}

export function parseSvgPathDrawing(input: string, steps = 24): ImportedPath {
  if (!input.trim() || input.length > 32768) throw new Error("Choose SVG geometry up to 32,768 characters");
  if (!input.includes("<")) return parseSvgPathData(input, steps);
  const paths: { points: Point[]; closed: boolean }[] = [];
  let independentFills = true;
  for (const source of svgGeometrySources(input)) {
    const drawing = parseSvgPathData(source.data, steps), matrix = source.matrix;
    if (drawing.parts.length !== 1 || !drawing.closed) independentFills = false;
    for (const part of drawing.parts) {
      const points = part.points.map(([px, py]): Point => {
        const x = drawing.left + part.left + (px + 0.5) * part.width, y = drawing.top + part.top + (py + 0.5) * part.height;
        return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
      });
      paths.push({ points, closed: part.closed });
      if (paths.length > 100 || paths.reduce((total, path) => total + path.points.length, 0) > 4096) throw new Error("Simplify the SVG to one hundred subpaths and four thousand drawing points");
    }
  }
  return normaliseImportedPaths(paths, independentFills);
}

export function insertSvgPathDrawing(project: ProjectSnapshot, time: number, drawing: ImportedPath, options: { name: string; colour: string; fill: boolean; weight: number }, makeId: () => string) {
  if (!/^#[\da-f]{6}$/i.test(options.colour) || !Number.isFinite(options.weight) || options.weight < 0.1 || options.weight > 80 || !options.name.trim() || options.name.length > 100) throw new Error("Choose a path name, colour and line weight from 0.1 to 80");
  const page = pageAt(getPages(project.settings, project.clips), time), factor = Math.min(project.settings.width * 0.6 / drawing.width, project.settings.height * 0.6 / drawing.height);
  if (options.fill && !drawing.closed) throw new Error("Use outline mode for open or compound paths; independent closed SVG elements can be filled");
  const groupId = drawing.parts.length > 1 ? makeId() : undefined, tracks: Track[] = [], clips: ShapeClip[] = [];
  drawing.parts.forEach((part, index) => {
    const label = options.name.trim() + (drawing.parts.length > 1 ? " " + (index + 1) : "");
    const track: Track = { id: makeId(), kind: "video", name: label, muted: false, hidden: false };
    const clip: ShapeClip = { id: makeId(), trackId: track.id, groupId, label, kind: "shape", shape: "path", start: page.start, duration: page.end - page.start, trimIn: 0, w: Math.max(0.00001, part.width * factor / project.settings.width), h: Math.max(0.00001, part.height * factor / project.settings.height), transform: { x: 0.5 + ((part.left + part.width / 2) - drawing.width / 2) * factor / project.settings.width, y: 0.5 + ((part.top + part.height / 2) - drawing.height / 2) * factor / project.settings.height, scale: 1, rotation: 0 }, points: part.points, pathSmoothing: 0, closedPath: part.closed, fill: options.fill ? options.colour : null, stroke: options.fill ? null : { color: options.colour, width: options.weight }, strokeCap: "round", strokeJoin: "round" };
    tracks.push(track); clips.push(clip);
  });
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, id: clips[0].id };
}
