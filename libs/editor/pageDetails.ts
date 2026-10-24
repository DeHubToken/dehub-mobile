import { getPages } from "./pages";
import type { ProjectSnapshot } from "./types";

export interface PageDetails { title: string; notes: string; section?: string; presentationHidden?: boolean }

export function pageDetails(project: ProjectSnapshot, index: number): PageDetails {
  const value = project.settings.pageDetails?.[index];
  return { section: typeof value?.section === "string" ? value.section.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) || undefined : undefined, title: typeof value?.title === "string" ? value.title.slice(0, 200) : "", notes: typeof value?.notes === "string" ? value.notes.slice(0, 10000) : "", ...(value?.presentationHidden === true ? { presentationHidden: true } : {}) };
}

/** Page names and presenter notes travel with the design and stay out of its artwork. */
export function setPageDetails(project: ProjectSnapshot, index: number, value: PageDetails): ProjectSnapshot {
  const pages = getPages(project.settings, project.clips);
  if (!Number.isInteger(index) || !pages[index]) return project;
  const details = pages.map(page => pageDetails(project, page.index));
  const next = { ...details[index], ...(typeof value.section === "string" ? { section: value.section.trim().slice(0, 80) || undefined } : {}), title: value.title.trim().slice(0, 200), notes: value.notes.slice(0, 10000), ...(typeof value.presentationHidden === "boolean" ? { presentationHidden: value.presentationHidden } : {}) };
  if (details[index].title === next.title && details[index].notes === next.notes && details[index].section === next.section && !!details[index].presentationHidden === !!next.presentationHidden) return project;
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

export function setDesignPageSections(project: ProjectSnapshot, indexes: readonly number[], name: string) {
  const pages = getPages(project.settings, project.clips), chosen = new Set(indexes);
  if (!chosen.size || [...chosen].some(index => !Number.isInteger(index) || !pages[index])) throw new Error("Choose existing pages to organize");
  if (name.length > 80) throw new Error("Keep section names within 80 characters");
  const section = name.replace(/[\u0000-\u001f\u007f]/g, " ").trim() || undefined;
  const details = pages.map(page => pageDetails(project, page.index)); let count = 0;
  const next = details.map((detail, index) => { if (!chosen.has(index) || detail.section === section) return detail; count++; return { ...detail, section }; });
  if (!count) return { project, count };
  const updated = { ...project, settings: { ...project.settings, pageDetails: next } };
  let bytes = 0; for (const char of JSON.stringify(updated)) { const value = char.codePointAt(0)!; bytes += value < 128 ? 1 : value < 2048 ? 2 : value < 65536 ? 3 : 4; }
  if (bytes > 6 * 1024 * 1024) throw new Error("This section change would make the design too large to save");
  return { project: updated, count };
}

export function designPageSectionIndexes(project: ProjectSnapshot, name: string): number[] {
  const section = name.trim(); if (!section) return [];
  return getPages(project.settings, project.clips).filter(page => pageDetails(project, page.index).section === section).map(page => page.index);
}

export interface DesignPageSection { name: string; indexes: number[] }
export function designPageSections(project: ProjectSnapshot): DesignPageSection[] {
  const sections = new Map<string, DesignPageSection>();
  for (const page of getPages(project.settings, project.clips)) {
    const name = pageDetails(project, page.index).section; if (!name) continue;
    const section = sections.get(name) ?? { name, indexes: [] }; section.indexes.push(page.index); sections.set(name, section);
  }
  return [...sections.values()];
}
