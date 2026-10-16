import { DESIGN_SIZES, resizeDesign } from "./designTools";
import type { ProjectSnapshot } from "./types";

export const DESIGN_UNITS = ["px", "in", "cm", "mm"] as const;
export type DesignUnit = typeof DESIGN_UNITS[number];
export function designPrintDpi(settings: { width: number; height: number; printDpi?: number }): number {
  if (Number.isInteger(settings.printDpi) && settings.printDpi! >= 72 && settings.printDpi! <= 600) return settings.printDpi!;
  return (settings.width === 2480 && settings.height === 3508) || (settings.width === 3508 && settings.height === 2480) ? 300 : 96;
}
export function pixelsPerUnit(unit: DesignUnit, dpi: number): number { return unit === "px" ? 1 : unit === "in" ? dpi : unit === "cm" ? dpi / 2.54 : dpi / 25.4; }
export function dimensionPixels(value: string, unit: DesignUnit, dpi: number): number { return Math.round(Number(value) * pixelsPerUnit(unit, dpi)); }
export function dimensionDisplay(pixels: number, unit: DesignUnit, dpi: number): string { return String(Number((pixels / pixelsPerUnit(unit, dpi)).toFixed(unit === "px" ? 0 : 3))); }

export const DOCUMENT_SIZE_PRESETS = [
  ...DESIGN_SIZES.map(size => ({ ...size, dpi: size.id === "a4" || size.id === "poster" ? 300 : 96 })),
  { id: "letter", label: "US Letter", width: 2550, height: 3300, dpi: 300 },
  { id: "a5", label: "A5 document", width: 1748, height: 2480, dpi: 300 },
  { id: "a3", label: "A3 poster", width: 3508, height: 4961, dpi: 300 },
  { id: "postcard", label: "Postcard · 6 × 4 in", width: 1800, height: 1200, dpi: 300 },
  { id: "business-card", label: "Business card · 3.5 × 2 in", width: 1050, height: 600, dpi: 300 },
];

export function resizeDocument(project: ProjectSnapshot, width: number, height: number, dpi: number): ProjectSnapshot {
  if (![width, height].every(value => Number.isInteger(value) && value >= 64 && value <= 8192) || !Number.isInteger(dpi) || dpi < 72 || dpi > 600) throw new Error("Use a canvas of 64–8,192 pixels per side and a print resolution of 72–600 pixels per inch");
  if (width === project.settings.width && height === project.settings.height && project.settings.printDpi === dpi) return project;
  const next = resizeDesign(project, width, height);
  return { ...next, settings: { ...next.settings, printDpi: dpi } };
}
