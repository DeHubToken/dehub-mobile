import { groupedSelection } from "./designGroups";
import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot } from "./types";
export type DesignTextScope = "all" | "page" | "selection";
export function designTextScopeIds(project: ProjectSnapshot, time: number, scope: DesignTextScope, selected: readonly string[]): string[] | undefined {
  if (scope === "all") return undefined;
  if (scope === "selection") return groupedSelection(project.clips, selected, time);
  const page = pageAt(getPages(project.settings, project.clips), time);
  return project.clips.filter(clip => clip.start < page.end && clip.start + clip.duration > page.start).map(clip => clip.id);
}
