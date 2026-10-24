export const SHAPE_GEOMETRY_RUNTIME = String.raw`function shapePolygon(shape, width, height, options = {}) {
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
}`;
