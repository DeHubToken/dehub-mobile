import { useEffect } from 'react';
import { runWhenSettled } from '../libs/run-when-settled';

let ready = false;
let scheduled = false;

/** Evaluate the post page once while its source card is visible, before a tap. */
export function useWarmPostDetail(eligible: boolean) {
  useEffect(() => {
    if (!eligible || ready || scheduled) return;
    scheduled = true;
    let cancel = () => {};
    cancel = runWhenSettled(() => {
      cancel();
      scheduled = false;
      try {
        require('../screens/FeedDetailScreen');
        ready = true;
      } catch {
        // The route's normal error boundary still handles an unsuccessful load.
      }
    });
  }, [eligible]);
}
