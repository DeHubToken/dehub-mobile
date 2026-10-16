import { getPages } from "./pages";
import type { ProjectSnapshot } from "./types";

export interface PageDetails { title: string; notes: string }

export function pageDetails(project: ProjectSnapshot, index: number): PageDetails {
  const value = project.settings.pageDetails?.[index];
  return { title: typeof value?.title === "string" ? value.title.slice(0, 200) : "", notes: typeof value?.notes === "string" ? value.notes.slice(0, 10000) : "" };
}

/** Page names and presenter notes travel with the design and stay out of its artwork. */
export function setPageDetails(project: ProjectSnapshot, index: number, value: PageDetails): ProjectSnapshot {
  const pages = getPages(project.settings, project.clips);
  if (!Number.isInteger(index) || !pages[index]) return project;
  const details = pages.map(page => pageDetails(project, page.index));
  const next = { title: value.title.trim().slice(0, 200), notes: value.notes.slice(0, 10000) };
  if (details[index].title === next.title && details[index].notes === next.notes) return project;
  details[index] = next;
  return { ...project, settings: { ...project.settings, pageDetails: details } };
}
