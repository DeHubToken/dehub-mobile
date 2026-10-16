import { getPages } from "./pages";
import { parsePageSelection } from "./pageExports";
import { designPageSections } from "./pageDetails";
import type { ProjectSnapshot } from "./types";
export interface RepeatPageScope { mode: "all" | "odd" | "even" | "section" | "custom"; range: string; section: string }
export const REPEAT_PAGE_SCOPE_OPTIONS = [{ id: "all", label: "All other pages" }, { id: "odd", label: "Odd pages" }, { id: "even", label: "Even pages" }, { id: "section", label: "Named section" }, { id: "custom", label: "Choose pages" }] as const;
export function resolveRepeatPageScope(project: ProjectSnapshot, scope: RepeatPageScope): number[] {
  const pages = getPages(project.settings, project.clips);
  if (scope.mode === "custom") return parsePageSelection(scope.range, pages.length);
  if (scope.mode === "section") { const sections = designPageSections(project), section = sections.find(section => section.name === scope.section) ?? (!scope.section ? sections[0] : undefined); if (!section) throw new Error("Choose an existing section for repeated artwork"); return section.indexes; }
  return pages.filter(page => scope.mode === "all" || scope.mode === "odd" && page.index % 2 === 0 || scope.mode === "even" && page.index % 2 === 1).map(page => page.index);
}
