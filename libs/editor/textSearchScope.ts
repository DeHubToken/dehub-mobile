import { groupedSelection } from "./designGroups";
import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot, TextClip } from "./types";
export type DesignTextScope = "all" | "page" | "selection";
export function designTextScopeIds(project: ProjectSnapshot, time: number, scope: DesignTextScope, selected: readonly string[]): string[] | undefined {
  if (scope === "all") return undefined;
  if (scope === "selection") return groupedSelection(project.clips, selected, time);
  const page = pageAt(getPages(project.settings, project.clips), time);
  return project.clips.filter(clip => clip.start < page.end && clip.start + clip.duration > page.start).map(clip => clip.id);
}

export function designTextResultTime(project: ProjectSnapshot, clip: TextClip, time: number): number {
  const page = pageAt(getPages(project.settings, project.clips), time);
  const start = Math.max(clip.start, page.start), end = Math.min(clip.start + clip.duration, page.end);
  return start < end ? start : clip.start;
}

export function nextDesignTextMatch(total: number, current: number, direction: -1 | 1): number {
  if (total < 1) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}
