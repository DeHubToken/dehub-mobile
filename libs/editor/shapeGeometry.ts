/** Extra polygon silhouettes use the same vertices in previews and exports on both devices. */
export interface ShapeGeometryOptions { sides?: number; points?: number; innerRatio?: number; inset?: number; armWidth?: number }
export function validShapeGeometry(value: unknown): value is ShapeGeometryOptions | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, number]) => typeof number === "number" && Number.isFinite(number) && (key === "sides" || key === "points" ? Number.isInteger(number) && number >= 3 && number <= 32 : key === "innerRatio" ? number >= 0.05 && number <= 0.95 : key === "inset" ? number >= 0 && number <= 0.95 : key === "armWidth" && number >= 0.1 && number <= 0.9));
}
export function shapePolygon(shape: string, width: number, height: number, options: ShapeGeometryOptions = {}): number[][] | null {
  const x = width / 2, y = height / 2;
  if (shape === "diamond") return [[0, -y], [x, 0], [0, y], [-x, 0]];
  if (shape === "star") {
    const count = Math.max(3, Math.min(32, Math.round(options.points || 5))), inner = Math.max(0.05, Math.min(0.95, options.innerRatio ?? 0.42));
    return Array.from({ length: count * 2 }, (_, index) => { const angle = -Math.PI / 2 + index / (count * 2) * Math.PI * 2, ratio = index % 2 ? inner : 1; return [Math.cos(angle) * x * ratio, Math.sin(angle) * y * ratio]; });
  }
  if (shape === "pentagon" || shape === "octagon" || shape === "polygon") {
    const count = shape === "pentagon" ? 5 : shape === "octagon" ? 8 : Math.max(3, Math.min(32, Math.round(options.sides || 6)));
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + index / count * Math.PI * 2;
      return [Math.cos(angle) * x, Math.sin(angle) * y];
    });
  }
  const inset = Math.max(0, Math.min(0.95, options.inset ?? (shape === "chevron" ? 0.85 : 0.45)));
  if (shape === "parallelogram") return [[-x * (1 - inset), -y], [x, -y], [x * (1 - inset), y], [-x, y]];
  if (shape === "trapezoid") return [[-x * (1 - inset), -y], [x * (1 - inset), -y], [x, y], [-x, y]];
  if (shape === "chevron") return [[-x, -y], [x * (1 - inset), -y], [x, 0], [x * (1 - inset), y], [-x, y], [-x * (1 - inset), 0]];
  const arm = Math.max(0.1, Math.min(0.9, options.armWidth ?? 1 / 3));
  if (shape === "cross") return [[-x * arm, -y], [x * arm, -y], [x * arm, -y * arm], [x, -y * arm], [x, y * arm], [x * arm, y * arm], [x * arm, y], [-x * arm, y], [-x * arm, y * arm], [-x, y * arm], [-x, -y * arm], [-x * arm, -y * arm]];
  if (shape === "speech-bubble") return [[-x, -y], [x, -y], [x, y * 0.55], [-x * 0.1, y * 0.55], [-x * 0.6, y], [-x * 0.6, y * 0.55], [-x, y * 0.55]];
  return null;
}

export const SHAPE_NAMES: Record<string, string> = {
  rect: "Rectangle", ellipse: "Ellipse", triangle: "Triangle", star: "Star", heart: "Heart", hexagon: "Hexagon", polygon: "Polygon", line: "Line", arrow: "Arrow", path: "Drawing",
  diamond: "Diamond", pentagon: "Pentagon", octagon: "Octagon", parallelogram: "Parallelogram", trapezoid: "Trapezoid", chevron: "Chevron", cross: "Cross", "speech-bubble": "Speech bubble",
};

export function shapeGeometryParameters(shape: string, options: ShapeGeometryOptions = {}): { key: keyof ShapeGeometryOptions; label: string; min: number; max: number; step: number; value: number }[] {
  if (shape === "star") return [{ key: "points", label: "Star points", min: 3, max: 32, step: 1, value: options.points ?? 5 }, { key: "innerRatio", label: "Inner radius", min: 0.05, max: 0.95, step: 0.01, value: options.innerRatio ?? 0.42 }];
  if (shape === "polygon") return [{ key: "sides", label: "Polygon sides", min: 3, max: 32, step: 1, value: options.sides ?? 6 }];
  if (["parallelogram", "trapezoid", "chevron"].includes(shape)) return [{ key: "inset", label: shape === "parallelogram" ? "Slant" : "Inset", min: 0, max: 0.95, step: 0.01, value: options.inset ?? (shape === "chevron" ? 0.85 : 0.45) }];
  if (shape === "cross") return [{ key: "armWidth", label: "Arm thickness", min: 0.1, max: 0.9, step: 0.01, value: options.armWidth ?? 1 / 3 }];
  return [];
}
