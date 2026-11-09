import { useContext, useEffect } from 'react';
import { runWhenSettled } from '../libs/run-when-settled';
import { AuthStateContext } from '../context/AuthContext';
import { warmShortsFeed } from './warmShortsFeed';

let ready = false;
let scheduled = false;

/**
 * Evaluate the viewer once while a video is available, before the first tap,
 * and start loading the clips that follow it, so the first swipe in the
 * viewer already has somewhere to go.
 */
export function useWarmVideoViewer(eligible: boolean) {
  // Read softly: a card rendered outside the provider (tests) still mounts.
  const isSignedIn = !!useContext(AuthStateContext)?.isSignedIn;
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

  // Deduplicated in libs/brainrotWarm, so every visible card may ask.
  useEffect(() => {
    if (!eligible) return;
    return runWhenSettled(() => warmShortsFeed(isSignedIn), 2500);
  }, [eligible, isSignedIn]);
}
