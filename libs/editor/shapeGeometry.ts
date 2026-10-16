/** Extra polygon silhouettes use the same vertices in previews and exports on both devices. */
export function shapePolygon(shape: string, width: number, height: number): number[][] | null {
  const x = width / 2, y = height / 2;
  if (shape === "diamond") return [[0, -y], [x, 0], [0, y], [-x, 0]];
  if (shape === "pentagon" || shape === "octagon") {
    const count = shape === "pentagon" ? 5 : 8;
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + index / count * Math.PI * 2;
      return [Math.cos(angle) * x, Math.sin(angle) * y];
    });
  }
  if (shape === "parallelogram") return [[-x * 0.55, -y], [x, -y], [x * 0.55, y], [-x, y]];
  if (shape === "trapezoid") return [[-x * 0.55, -y], [x * 0.55, -y], [x, y], [-x, y]];
  if (shape === "chevron") return [[-x, -y], [x * 0.15, -y], [x, 0], [x * 0.15, y], [-x, y], [-x * 0.15, 0]];
  if (shape === "cross") return [[-x / 3, -y], [x / 3, -y], [x / 3, -y / 3], [x, -y / 3], [x, y / 3], [x / 3, y / 3], [x / 3, y], [-x / 3, y], [-x / 3, y / 3], [-x, y / 3], [-x, -y / 3], [-x / 3, -y / 3]];
  if (shape === "speech-bubble") return [[-x, -y], [x, -y], [x, y * 0.55], [-x * 0.1, y * 0.55], [-x * 0.6, y], [-x * 0.6, y * 0.55], [-x, y * 0.55]];
  return null;
}

export const SHAPE_NAMES: Record<string, string> = {
  rect: "Rectangle", ellipse: "Ellipse", triangle: "Triangle", star: "Star", heart: "Heart", hexagon: "Hexagon", line: "Line", arrow: "Arrow", path: "Drawing",
  diamond: "Diamond", pentagon: "Pentagon", octagon: "Octagon", parallelogram: "Parallelogram", trapezoid: "Trapezoid", chevron: "Chevron", cross: "Cross", "speech-bubble": "Speech bubble",
};
