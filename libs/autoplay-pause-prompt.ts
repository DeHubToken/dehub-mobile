export const AUTOPLAY_PROMPT_STORAGE_KEY = 'dehub.autoplayPausePromptAt';
export const AUTOPLAY_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTOPLAY_PAUSE_WINDOW_MS = 2 * 60 * 1000;
// Longer than the reaction gesture window: a double tap restores playback.
export const AUTOPLAY_PAUSE_CONFIRM_MS = 450;

/** Session-only evidence. Persist the prompt timestamp, never viewing history. */
export function createAutoplayPauseTracker() {
  const pauses = new Map<string, number>();
  let prompted = false;

  return {
    recordPause(videoId: string, now: number, lastPromptAt = 0): boolean {
      if (!videoId || prompted) return false;
      if (lastPromptAt > 0 && now - lastPromptAt < AUTOPLAY_PROMPT_COOLDOWN_MS) return false;
      for (const [id, pausedAt] of pauses) {
        if (now - pausedAt >= AUTOPLAY_PAUSE_WINDOW_MS) pauses.delete(id);
      }
      if (!pauses.has(videoId)) pauses.set(videoId, now);
      if (pauses.size < 3) return false;
      prompted = true;
      pauses.clear();
      return true;
    },
  };
}
