import { useEffect, useState } from "react";
import { requestDesignPagePreview } from "./designPagePreviews";
import type { ProjectSnapshot } from "./types";
export interface UpcomingPresentationPage { project: ProjectSnapshot; time: number; index: number; title: string }
export function useUpcomingPagePreview(next: UpcomingPresentationPage, enabled: boolean) {
  const [result, setResult] = useState<{ image: string | null; busy: boolean; unavailable: boolean }>({ image: null, busy: false, unavailable: false });
  useEffect(() => {
    if (!enabled) { setResult({ image: null, busy: false, unavailable: false }); return; }
    const abort = new AbortController(); setResult({ image: null, busy: true, unavailable: false });
    const timeout = setTimeout(() => { abort.abort(); setResult({ image: null, busy: false, unavailable: true }); }, 10000);
    const timer = setTimeout(() => { requestDesignPagePreview(next.project, next.time, 384, abort.signal).then(image => { if (!abort.signal.aborted) setResult({ image, busy: false, unavailable: false }); }).catch(() => { if (!abort.signal.aborted) setResult({ image: null, busy: false, unavailable: true }); }).finally(() => clearTimeout(timeout)); }, 200);
    return () => { clearTimeout(timer); clearTimeout(timeout); abort.abort(); };
  }, [next.project, next.time, enabled]);
  return result;
}
