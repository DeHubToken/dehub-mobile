import { useEffect, useState } from "react";
import { requestDesignPagePreview } from "./designPagePreviews";
import { putDiagramTemplate, type DiagramContent, type DiagramTemplateId } from "./diagramTemplates";
import { DEFAULT_SETTINGS, type ProjectSnapshot } from "./types";
export function useDiagramPreview(projectId: string, preset: DiagramTemplateId, value: DiagramContent | null, width: number, height: number, background: string, enabled: boolean) {
  const [result, setResult] = useState<{ image: string | null; busy: boolean; unavailable: boolean }>({ image: null, busy: false, unavailable: false });
  useEffect(() => {
    if (!enabled || !value) { setResult({ image: null, busy: false, unavailable: false }); return; }
    const controller = new AbortController(); setResult(previous => ({ ...previous, busy: true, unavailable: false }));
    const timeout = setTimeout(() => { controller.abort(); setResult({ image: null, busy: false, unavailable: true }); }, 10000);
    const timer = setTimeout(() => {
      const snapshot: ProjectSnapshot = { id: projectId, title: "Diagram preview", updatedAt: 0, settings: { ...DEFAULT_SETTINGS, width: Math.max(32, Math.min(8192, width)), height: Math.max(32, Math.min(8192, height)), background, pages: [0], pageEnd: 5 }, tracks: [], clips: [] };
      try {
        let id = 0; const diagram = putDiagramTemplate(snapshot, 0, preset, value, () => "diagram-" + (++id));
        requestDesignPagePreview(diagram.project, 0, 512, controller.signal).then(image => { if (!controller.signal.aborted) setResult({ image, busy: false, unavailable: false }); }).catch(() => { if (!controller.signal.aborted) setResult({ image: null, busy: false, unavailable: true }); }).finally(() => clearTimeout(timeout));
      } catch { clearTimeout(timeout); if (!controller.signal.aborted) setResult({ image: null, busy: false, unavailable: true }); }
    }, 350);
    return () => { clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [projectId, preset, value, width, height, background, enabled]);
  return result;
}
