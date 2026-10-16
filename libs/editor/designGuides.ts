import type { ProjectSettings, ProjectSnapshot } from "./types";

export interface DesignGuides { vertical: number[]; horizontal: number[]; margin: number; visible: boolean; snap: boolean; rulers: boolean }
export type GuideAxis = "vertical" | "horizontal";
export function getDesignGuides(value: ProjectSettings["guides"]): DesignGuides {
  const positions = (input: unknown) => Array.isArray(input) ? [...new Set(input.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1))].sort((a, b) => a - b).slice(0, 50) : [];
  return { vertical: positions(value?.vertical), horizontal: positions(value?.horizontal), margin: Number.isFinite(value?.margin) ? Math.max(0, Math.min(0.4, value!.margin!)) : 0,
    visible: value?.visible !== false, snap: value?.snap !== false, rulers: value?.rulers === true };
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
