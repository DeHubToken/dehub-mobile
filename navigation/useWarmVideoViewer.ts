import { useEffect } from 'react';
import { runWhenSettled } from '../libs/run-when-settled';

let ready = false;
let scheduled = false;

/** Evaluate the viewer once while a video is available, before the first tap. */
export function useWarmVideoViewer(eligible: boolean) {
  useEffect(() => {
    if (!eligible || ready || scheduled) return;
    scheduled = true;
    let cancel = () => {};
    cancel = runWhenSettled(() => {
      cancel();
      scheduled = false;
      try {
        require('../screens/ShortsViewerScreen');
        ready = true;
      } catch {
        // Navigation keeps its normal require/error boundary if warming fails.
      }
    });
  }, [eligible]);
}
