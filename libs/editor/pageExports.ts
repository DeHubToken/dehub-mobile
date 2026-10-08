import { exportFilename } from "./exportName";
import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot } from "./types";

export type PageExportScope = "all" | "current";
export interface PageExportFrame { index: number; time: number; filename: string }

/** Multi-page stills capture page starts; single-page stills retain the playhead. */
export function pageExportFrames(snapshot: ProjectSnapshot, time: number, scope: PageExportScope, format: "png" | "jpg"): PageExportFrame[] {
  const pages = getPages(snapshot.settings, snapshot.clips);
  const multi = pages.length > 1;
  const selected = scope === "all" && multi ? pages : [pageAt(pages, time)];
  return selected.map(page => ({ index: page.index, time: multi ? page.start : time,
    filename: exportFilename(snapshot.title, format, scope === "all" && multi ? `-${String(page.index + 1).padStart(2, "0")}` : "", "design"),
  }));
}
