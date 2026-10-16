export const JPEG_QUALITY_PRESETS = [
  { id: "small", label: "Smaller file", quality: 0.65 },
  { id: "balanced", label: "Balanced", quality: 0.85 },
  { id: "high", label: "High detail", quality: 0.95 },
] as const;
export function imageJpegQuality(value: number = 0.92): number { return Number.isFinite(value) ? Math.max(0.5, Math.min(1, value)) : 0.92; }
