import type { ProjectSnapshot } from "./types";

export function renameDesignLayer(project: ProjectSnapshot, id: string, value: string): ProjectSnapshot {
  const label = value.trim().slice(0, 80) || undefined;
  const clip = project.clips.find(item => item.id === id);
  if (!clip || clip.label === label) return project;
  return { ...project, clips: project.clips.map(item => item.id === id ? { ...item, label } : item) };
}
