export type SvgMatrix = [number, number, number, number, number, number];
export const SVG_IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0];
export function multiplySvgMatrices(a: SvgMatrix, b: SvgMatrix): SvgMatrix {
  const matrix: SvgMatrix = [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  if (matrix.some(value => !Number.isFinite(value) || Math.abs(value) > 1000000000)) throw new Error("Simplify extreme SVG transforms before importing");
  return matrix;
}
export function parseSvgTransform(input: string | undefined): SvgMatrix {
  if (!input?.trim()) return [...SVG_IDENTITY];
  if (input.length > 2000) throw new Error("Simplify the SVG transform list before importing");
  const pattern = /([a-z]+)\s*\(([^)]*)\)/gi;
  let result: SvgMatrix = [...SVG_IDENTITY], offset = 0, count = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    if (input.slice(offset, match.index).replace(/[\s,]/g, "")) throw new Error("Use standard SVG transform functions");
    offset = pattern.lastIndex; if (++count > 32) throw new Error("Use up to thirty-two transforms per SVG element");
    const text = match[2].trim(), parts = text ? text.split(/[\s,]+/) : [];
    if (parts.some(value => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1000000)) throw new Error("Use finite literal numbers for SVG transforms");
    const values = parts.map(Number), name = match[1].toLowerCase(); let matrix: SvgMatrix;
    if (name === "matrix" && values.length === 6) matrix = values as SvgMatrix;
    else if (name === "translate" && (values.length === 1 || values.length === 2)) matrix = [1, 0, 0, 1, values[0], values[1] ?? 0];
    else if (name === "scale" && (values.length === 1 || values.length === 2)) matrix = [values[0], 0, 0, values[1] ?? values[0], 0, 0];
    else if (name === "rotate" && (values.length === 1 || values.length === 3)) {
      const angle = values[0] % 360 * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle), x = values[1] ?? 0, y = values[2] ?? 0;
      matrix = [cos, sin, -sin, cos, x - cos * x + sin * y, y - sin * x - cos * y];
    } else if ((name === "skewx" || name === "skewy") && values.length === 1) {
      const angle = values[0] % 180 * Math.PI / 180; if (Math.abs(Math.cos(angle)) < 0.000001) throw new Error("Use an SVG skew angle away from ninety degrees");
      matrix = name === "skewx" ? [1, 0, Math.tan(angle), 1, 0, 0] : [1, Math.tan(angle), 0, 1, 0, 0];
    } else throw new Error("Use matrix, translate, scale, rotate, skewX or skewY with their required coordinates");
    result = multiplySvgMatrices(result, matrix);
  }
  if (!count || input.slice(offset).replace(/[\s,]/g, "")) throw new Error("Use a complete SVG transform list");
  return result;
}
