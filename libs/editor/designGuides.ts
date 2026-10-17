import type { ProjectSettings, ProjectSnapshot } from "./types";

export type GuideUnit = "px" | "in" | "cm" | "mm";
export interface DesignGuides { vertical: number[]; horizontal: number[]; margin: number; visible: boolean; snap: boolean; rulers: boolean; spacing: boolean; unit: GuideUnit }
export type GuideAxis = "vertical" | "horizontal";
export function getDesignGuides(value: ProjectSettings["guides"]): DesignGuides {
  const positions = (input: unknown) => Array.isArray(input) ? [...new Set(input.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1))].sort((a, b) => a - b).slice(0, 50) : [];
  return { vertical: positions(value?.vertical), horizontal: positions(value?.horizontal), margin: Number.isFinite(value?.margin) ? Math.max(0, Math.min(0.4, value!.margin!)) : 0,
    visible: value?.visible !== false, snap: value?.snap !== false, rulers: value?.rulers === true, spacing: value?.spacing !== false, unit: value?.unit && ["px", "in", "cm", "mm"].includes(value.unit) ? value.unit : "px" };
}

export function editDesignGuide(project: ProjectSnapshot, axis: GuideAxis, from: number | null, to: number | null): ProjectSnapshot {
  if (from === null && to === null) return project;
  const guides = getDesignGuides(project.settings.guides);
  if (from !== null && !guides[axis].some(value => Math.abs(value - from) < 1e-7)) return project;
  const positions = guides[axis].filter(value => from === null || Math.abs(value - from) >= 1e-7);
  if (to !== null) {
    if (!Number.isFinite(to) || to < 0 || to > 1) return project;
    const next = Math.round(to * 1e6) / 1e6;
    if (!positions.includes(next)) { if (positions.length >= 50) return project; positions.push(next); }
  }
  positions.sort((a, b) => a - b);
  if (guides.visible && positions.length === guides[axis].length && positions.every((value, index) => value === guides[axis][index])) return project;
  return changeDesignGuides(project, { [axis]: positions, visible: true });
}
export function changeDesignGuides(project: ProjectSnapshot, patch: Partial<DesignGuides>): ProjectSnapshot {
  const guides = getDesignGuides({ ...getDesignGuides(project.settings.guides), ...patch });
  return { ...project, settings: { ...project.settings, guides } };
}

export interface GuideGridOptions { columns: number; rows: number; margin: number; gutter: number; replace: boolean }
export function designGuideGridPositions(width: number, height: number, options: GuideGridOptions): { vertical: number[]; horizontal: number[] } {
  if (!Number.isInteger(options.columns) || !Number.isInteger(options.rows) || options.columns < 1 || options.columns > 12 || options.rows < 1 || options.rows > 12 || !Number.isFinite(options.margin) || !Number.isFinite(options.gutter) || options.margin < 0 || options.gutter < 0 || width <= 0 || height <= 0) throw new Error("Choose 1–12 columns and rows, with positive margins and gutters");
  const positions = (dimension: number, count: number) => {
    const usable = dimension - options.margin * 2 - options.gutter * (count - 1);
    if (usable < count) throw new Error("Margins and gutters leave no room for this grid. Reduce their size or use fewer cells");
    const size = usable / count, result: number[] = [];
    for (let index = 0; index < count; index++) { const from = options.margin + index * (size + options.gutter); result.push(from / dimension, (from + size) / dimension); }
    return [...new Set(result.map(value => Math.round(value * 1e6) / 1e6))].sort((a, b) => a - b);
  };
  return { vertical: positions(width, options.columns), horizontal: positions(height, options.rows) };
}
export function applyDesignGuideGrid(project: ProjectSnapshot, options: GuideGridOptions): ProjectSnapshot {
  const grid = designGuideGridPositions(project.settings.width, project.settings.height, options), before = getDesignGuides(project.settings.guides);
  const merge = (axis: GuideAxis) => [...new Set([...(options.replace ? [] : before[axis]), ...grid[axis]])].sort((a, b) => a - b);
  const vertical = merge("vertical"), horizontal = merge("horizontal");
  if (vertical.length > 50 || horizontal.length > 50) throw new Error("This grid would exceed 50 guides on one axis. Replace existing guides or clear some first");
  return changeDesignGuides(project, { vertical, horizontal, visible: true, rulers: true, ...(options.replace ? { margin: 0 } : {}) });
}
