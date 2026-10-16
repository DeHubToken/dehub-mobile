import type { ProjectSettings, ProjectSnapshot } from "./types";

export interface DesignGuides { vertical: number[]; horizontal: number[]; margin: number; visible: boolean; snap: boolean; rulers: boolean }
export function getDesignGuides(value: ProjectSettings["guides"]): DesignGuides {
  const positions = (input: unknown) => Array.isArray(input) ? [...new Set(input.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1))].sort((a, b) => a - b).slice(0, 50) : [];
  return { vertical: positions(value?.vertical), horizontal: positions(value?.horizontal), margin: Number.isFinite(value?.margin) ? Math.max(0, Math.min(0.4, value!.margin!)) : 0,
    visible: value?.visible !== false, snap: value?.snap !== false, rulers: value?.rulers === true };
}
export function changeDesignGuides(project: ProjectSnapshot, patch: Partial<DesignGuides>): ProjectSnapshot {
  const guides = getDesignGuides({ ...getDesignGuides(project.settings.guides), ...patch });
  return { ...project, settings: { ...project.settings, guides } };
}
