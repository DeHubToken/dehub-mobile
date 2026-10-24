import { useEffect, useState } from "react";
import { requestDesignPagePreview } from "./designPagePreviews";
import { validDataVisuals, type ChartData, type TableData } from "./dataVisuals";
import { DEFAULT_SETTINGS, type ProjectSnapshot } from "./types";
export type DataVisualDraft = { chart: ChartData } | { table: TableData };
export function useDataVisualDraftPreview(projectId: string, value: DataVisualDraft | null, width: number, height: number, background: string, enabled: boolean) {
  const [result, setResult] = useState<{ image: string | null; busy: boolean; unavailable: boolean }>({ image: null, busy: false, unavailable: false });
  useEffect(() => {
    if (!enabled || !value || !validDataVisuals(value)) { setResult({ image: null, busy: false, unavailable: false }); return; }
    const controller = new AbortController();
    setResult(previous => ({ ...previous, busy: true, unavailable: false }));
    const timeout = setTimeout(() => { controller.abort(); setResult({ image: null, busy: false, unavailable: true }); }, 10000);
    const timer = setTimeout(() => {
      const snapshot: ProjectSnapshot = { id: projectId, title: "Graphic preview", updatedAt: 0,
        settings: { ...DEFAULT_SETTINGS, width: Math.max(32, Math.min(8192, width)), height: Math.max(32, Math.min(8192, height)), background, pages: [0], pageEnd: 5 },
        tracks: [{ id: "draft-track", kind: "video", name: "Graphic", muted: false, hidden: false }],
        clips: [{ id: "draft-graphic", trackId: "draft-track", kind: "shape", shape: "rect", start: 0, duration: 5, trimIn: 0, w: 0.96, h: 0.96, fill: null, stroke: null, ...value }] };
      requestDesignPagePreview(snapshot, 0, 384, controller.signal).then(image => { if (!controller.signal.aborted) setResult({ image, busy: false, unavailable: false }); }).catch(() => { if (!controller.signal.aborted) setResult({ image: null, busy: false, unavailable: true }); }).finally(() => clearTimeout(timeout));
    }, 350);
    return () => { clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [projectId, value, width, height, background, enabled]);
  return result;
}
