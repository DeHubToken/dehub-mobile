/**
 * Global audio focus manager — ensures only one audio/video source plays at a time.
 *
 * Any component that plays audio should:
 *   1. Call `requestAudioFocus(stopCallback)` when starting playback.
 *   2. Call `releaseAudioFocus(stopCallback)` when pausing/stopping.
 *
 * When a new source requests focus, the previous holder's stop callback is invoked
 * automatically, mirroring the behaviour of major social apps.
 */

type StopFn = () => void;

let currentHolder: StopFn | null = null;

/** Request exclusive audio focus. If another source holds focus, it is stopped first. */
export function requestAudioFocus(stop: StopFn): void {
  if (currentHolder && currentHolder !== stop) {
    try { currentHolder(); } catch {}
  }
  currentHolder = stop;
}

/** Release focus (only if the caller is the current holder). */
export function releaseAudioFocus(stop: StopFn): void {
  if (currentHolder === stop) {
    currentHolder = null;
  }
}

/** Force-stop whatever is currently playing. */
export function revokeAudioFocus(): void {
  if (currentHolder) {
    try { currentHolder(); } catch {}
    currentHolder = null;
  }
}
