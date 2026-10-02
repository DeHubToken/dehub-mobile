import { useLayoutEffect } from "react";
import type { VideoPlayer } from "expo-video";

/**
 * Pause and mute an expo-video player before it is let go.
 *
 * A feed card that scrolls off is unmounted, and `useVideoPlayer` releases its
 * player in an effect cleanup. The card's own "stop on unmount" ran after that
 * release, so its pause() threw on the released object and never landed. On
 * iOS the native player outlives the JS release while anything still holds it
 * (the now-playing controls do), so the clip's sound carried on with no video
 * left on screen, and scrolling back showed a fresh, paused player.
 *
 * Layout-effect cleanups run before passive ones, so this lands while the
 * player is still usable — on unmount and whenever the source swap replaces it.
 */
export function useSilenceOnRelease(player: VideoPlayer | null | undefined): void {
  useLayoutEffect(() => {
    if (!player) return;
    return () => {
      try { player.pause(); } catch {}
      try { player.muted = true; } catch {}
    };
  }, [player]);
}
