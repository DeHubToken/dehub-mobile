import { useEffect, useState } from "react";
import { requestDesignPagePreview } from "./designPagePreviews";
import { reusableElementPreview, type ReusableDesignElement } from "./reusableElements";
export function useReusableElementPreview(projectId: string, element: ReusableDesignElement) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setImage(null);
    let snapshot;
    try { snapshot = reusableElementPreview(projectId, element); } catch { return () => controller.abort(); }
    requestDesignPagePreview(snapshot, 0, 192, controller.signal).then(value => { if (!controller.signal.aborted) setImage(value); }).catch(() => {});
    return () => controller.abort();
  }, [projectId, element.id, element.source]);
  return image;
}
