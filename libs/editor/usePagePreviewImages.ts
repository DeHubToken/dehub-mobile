import { useEffect, useRef, useState } from "react";
import { requestDesignPagePreview } from "./designPagePreviews";
import { pagePreviewTime, type Page } from "./pages";
import type { ProjectSnapshot } from "./types";

export function usePagePreviewImages(project: ProjectSnapshot, pages: readonly Page[], enabled: boolean) {
  const [images, setImages] = useState<Record<number, string>>({}), [failed, setFailed] = useState(false), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const pageKey = pages.slice(0, 12).map(page => `${page.index}:${page.start}:${page.end}`).join("|"), livePages = useRef(pages); livePages.current = pages;
  useEffect(() => {
    const controller = new AbortController(); setImages({}); setFailed(false); setLoading(enabled);
    if (!enabled) return () => controller.abort();
    const run = async () => {
      for (const page of livePages.current.slice(0, 12)) {
        if (controller.signal.aborted) return;
        try { const image = await requestDesignPagePreview(project, pagePreviewTime(page), 256, controller.signal); if (!controller.signal.aborted) setImages(previous => ({ ...previous, [page.index]: image })); }
        catch { if (controller.signal.aborted) return; setFailed(true); }
      }
      if (!controller.signal.aborted) setLoading(false);
    };
    void run(); return () => controller.abort();
  }, [project, pageKey, enabled, revision]);
  return { images, failed, loading, refresh: () => setRevision(value => value + 1) };
}
