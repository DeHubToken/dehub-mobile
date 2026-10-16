import type { TextStroke } from "./types";
export const STROKE_PATTERNS = [
  { id: "solid", label: "Solid", dash: [] }, { id: "dashed", label: "Dashed", dash: [16, 12] },
  { id: "dotted", label: "Dotted", dash: [1, 12] }, { id: "long-dash", label: "Long dash", dash: [32, 12] },
  { id: "dash-dot", label: "Dash and dot", dash: [20, 10, 1, 10] }, { id: "dash-two-dots", label: "Dash and two dots", dash: [20, 10, 1, 10, 1, 10] },
] as const;
export function strokePatternId(dash: readonly number[] | undefined): string {
  return STROKE_PATTERNS.find(pattern => pattern.dash.length === (dash?.length ?? 0) && pattern.dash.every((value, index) => value === dash?.[index]))?.id ?? "custom";
}
export function parseStrokePattern(value: string): number[] | undefined {
  if (!value.trim()) return undefined;
  const pieces = value.trim().split(/[\s,]+/);
  if (pieces.length > 8 || pieces.some(piece => !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(piece))) throw new Error("Enter up to eight dash and gap lengths, separated by spaces");
  const values = pieces.map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 500) || values.every(value => value === 0) || values.reduce((sum, value) => sum + value, 0) > 2000) throw new Error("Use lengths from 0 to 500, with a total up to 2,000 and at least one positive length");
  return values;
}
export function strokeDashOffset(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(-1000000, Math.min(1000000, value)) : 0; }
export function scaleStrokePaint(stroke: TextStroke, factor: number): TextStroke {
  if (stroke.dashOffset !== undefined && Math.abs(stroke.dashOffset * factor) > 1000000) throw new Error("Reset the outline dash offset before scaling further");
  return { ...stroke, width: stroke.width * factor, dash: stroke.dash?.map(value => value * factor), ...(stroke.dashOffset !== undefined ? { dashOffset: stroke.dashOffset * factor } : {}) };
}
