import { getPages } from "./pages";
import type { ProjectSnapshot } from "./types";

export interface PageDetails { title: string; notes: string; presentationHidden?: boolean }

export function pageDetails(project: ProjectSnapshot, index: number): PageDetails {
  const value = project.settings.pageDetails?.[index];
  return { title: typeof value?.title === "string" ? value.title.slice(0, 200) : "", notes: typeof value?.notes === "string" ? value.notes.slice(0, 10000) : "", ...(value?.presentationHidden === true ? { presentationHidden: true } : {}) };
}

/** Page names and presenter notes travel with the design and stay out of its artwork. */
export function setPageDetails(project: ProjectSnapshot, index: number, value: PageDetails): ProjectSnapshot {
  const pages = getPages(project.settings, project.clips);
  if (!Number.isInteger(index) || !pages[index]) return project;
  const details = pages.map(page => pageDetails(project, page.index));
  const next = { ...details[index], title: value.title.trim().slice(0, 200), notes: value.notes.slice(0, 10000), ...(typeof value.presentationHidden === "boolean" ? { presentationHidden: value.presentationHidden } : {}) };
  if (details[index].title === next.title && details[index].notes === next.notes && !!details[index].presentationHidden === !!next.presentationHidden) return project;
  details[index] = next;
  return { ...project, settings: { ...project.settings, pageDetails: details } };
}

export function setPagesPresentationHidden(project: ProjectSnapshot, indexes: readonly number[], hidden: boolean): ProjectSnapshot {
  const pages = getPages(project.settings, project.clips), selected = new Set(indexes.filter(index => Number.isInteger(index) && !!pages[index]));
  if (!selected.size) return project;
  const details = pages.map(page => pageDetails(project, page.index));
  const next = details.map((detail, index) => selected.has(index) ? { ...detail, presentationHidden: hidden } : detail);
  if (next.every(detail => detail.presentationHidden)) throw new Error("Keep at least one page visible in the presentation");
  if (details.every((detail, index) => !!detail.presentationHidden === !!next[index].presentationHidden)) return project;
  return { ...project, settings: { ...project.settings, pageDetails: next } };
}

export function presentationPages(project: Pick<ProjectSnapshot, "settings" | "clips">) {
  const all = getPages(project.settings, project.clips), visible = all.filter(page => project.settings.pageDetails?.[page.index]?.presentationHidden !== true);
  return { all, pages: visible.length ? visible : all.slice(0, 1), allHidden: visible.length === 0 };
}

export function nameDesignPagesFromHeadings(project: ProjectSnapshot, indexes: readonly number[], overwrite = false) {
  const pages = getPages(project.settings, project.clips), chosen = new Set(indexes), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const details = pages.map(page => pageDetails(project, page.index));
  let count = 0, missing = 0;
  const headings = project.clips.filter((clip): clip is import("./types").TextClip => clip.kind === "text" && !clip.hidden && !hidden.has(clip.trackId) && !clip.pageNumber && clip.text.trim() !== "" && Number.isFinite(clip.fontSize) && clip.fontSize > 0)
    .sort((a, b) => b.fontSize - a.fontSize || a.y - b.y);
  for (const page of pages) {
    if (!chosen.has(page.index) || !overwrite && details[page.index].title.trim()) continue;
    const heading = headings.find(clip => clip.start < page.end && clip.start + clip.duration > page.start);
    if (!heading) { missing++; continue; }
    const line = heading.text.replace(/\r\n?/g, "\n").split("\n").find(line => line.trim()) ?? "";
    const title = (heading.uppercase ? line.toLocaleUpperCase() : line).replace(/\s+/g, " ").trim().slice(0, 200).replace(/[\ud800-\udbff]$/, "");
    if (!title) { missing++; continue; }
    if (title !== details[page.index].title) { details[page.index] = { ...details[page.index], title }; count++; }
  }
  return { project: count ? { ...project, settings: { ...project.settings, pageDetails: details } } : project, count, missing };
}
