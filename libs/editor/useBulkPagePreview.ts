import { useEffect, useState } from "react";
import { createBulkPages, type BulkConnections, type BulkData, type BulkPageFields } from "./bulkCreate";
import { planBulkPhotos } from "./bulkPhotos";
import { requestDesignPagePreview } from "./designPagePreviews";
import { getPages } from "./pages";
import type { ReplacementMedia } from "./replaceMedia";
import type { ProjectSnapshot } from "./types";

export interface BulkPagePreviewOptions {
  data: BulkData; row: number; time: number; connections: BulkConnections; pageFields: BulkPageFields;
  linkConnections: BulkConnections; imageConnections: BulkConnections;
}
export type BulkPreviewMediaReader = (id: string) => Promise<ReplacementMedia | null | undefined>;
export function useBulkPagePreview(project: ProjectSnapshot, options: BulkPagePreviewOptions, readMedia: BulkPreviewMediaReader, enabled: boolean) {
  const [result, setResult] = useState<{ image: string | null; busy: boolean; error: string }>({ image: null, busy: false, error: "" });
  useEffect(() => {
    if (!enabled) { setResult({ image: null, busy: false, error: "" }); return; }
    const controller = new AbortController();
    setResult(previous => ({ ...previous, busy: true, error: "" }));
    const timeout = setTimeout(() => { controller.abort(); setResult({ image: null, busy: false, error: "The page preview took too long. Edit the draft or reopen the preview to try again." }); }, 10000);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data, row, time, connections, pageFields, linkConnections, imageConnections } = options;
          if (!Number.isInteger(row) || row < 0 || row >= data.rows.length) throw new Error("Choose an existing data record to preview");
          const plan = planBulkPhotos(project, time, data, row + 1, row + 1, {}, imageConnections);
          const sources = await Promise.all(plan.mediaIds.map(id => readMedia(id)));
          if (controller.signal.aborted) return;
          const used = new Set([...project.clips.map(clip => clip.id), ...project.tracks.map(track => track.id), ...project.clips.map(clip => clip.groupId ?? "")]); let serial = 0;
          const makeId = () => { let id: string; do { id = "bulk-page-preview-" + (++serial); } while (used.has(id)); used.add(id); return id; };
          const generated = createBulkPages(project, time, data, connections, row + 1, row + 1, makeId, pageFields, {}, linkConnections, imageConnections, sources.filter((source): source is ReplacementMedia => !!source));
          const pages = getPages(generated.project.settings, generated.project.clips), image = await requestDesignPagePreview(generated.project, pages.length - 1, 512, controller.signal);
          if (!controller.signal.aborted) setResult({ image, busy: false, error: image ? "" : "The canvas preview is unavailable. Your data and connections remain editable." });
        } catch (reason) { if (!controller.signal.aborted) setResult({ image: null, busy: false, error: reason instanceof Error ? reason.message.slice(0, 300) : "Could not preview this data record" }); }
        finally { clearTimeout(timeout); }
      })();
    }, 350);
    return () => { clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [project, options, readMedia, enabled]);
  return result;
}
