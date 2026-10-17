import { exportFilename } from "./exportName";
export function pageFilenamePatternError(pattern: string): string {
  if (!pattern.trim()) return "";
  if (pattern.length > 160) return "Keep the filename pattern within 160 characters";
  if (/[{}]/.test(pattern.replace(/\{(?:title|name|section|page(?::[1-4])?)\}/g, ""))) return "Use {title}, {name}, {section}, {page}, or padded page numbers such as {page:3}";
  return "";
}
export function namedPageExports<T extends { index: number; filename: string }>(frames: T[], pattern: string, title: string, pageNames: readonly (string | undefined)[], extension: string, sections: readonly (string | undefined)[] = []): T[] {
  if (!pattern.trim()) return frames;
  const error = pageFilenamePatternError(pattern); if (error) throw new Error(error);
  const used = new Set<string>();
  return frames.map(frame => {
    const stem = pattern.replace(/\{(title|name|section|page)(?::([1-4]))?\}/g, (_, token: string, padding: string | undefined) => token === "title" ? title || "design" : token === "section" ? sections[frame.index]?.trim() || "Pages" : token === "name" ? pageNames[frame.index]?.trim() || `Page ${frame.index + 1}` : String(frame.index + 1).padStart(Number(padding) || 1, "0"));
    let filename = exportFilename(stem, extension, "", "design"), suffix = 0;
    while (used.has(filename.toLocaleLowerCase())) { suffix++; filename = exportFilename(stem, extension, `-${String(frame.index + 1).padStart(3, "0")}${suffix > 1 ? `-${suffix}` : ""}`, "design"); }
    used.add(filename.toLocaleLowerCase()); return { ...frame, filename };
  });
}
