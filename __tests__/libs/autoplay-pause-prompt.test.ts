import { AUTOPLAY_PAUSE_WINDOW_MS, AUTOPLAY_PROMPT_COOLDOWN_MS, createAutoplayPauseTracker } from '../../libs/autoplay-pause-prompt';

describe('autoplay pause suggestion', () => {
  it('requires three different videos and only prompts once per session', () => {
    const tracker = createAutoplayPauseTracker();
    expect(tracker.recordPause('a', 1000)).toBe(false);
    expect(tracker.recordPause('a', 2000)).toBe(false);
    expect(tracker.recordPause('b', 3000)).toBe(false);
    expect(tracker.recordPause('c', 4000)).toBe(true);
    for (const id of ['d', 'e', 'f']) expect(tracker.recordPause(id, 5000)).toBe(false);
  });

  it('forgets pauses outside the two-minute window', () => {
    const tracker = createAutoplayPauseTracker();
    tracker.recordPause('a', 1000);
    tracker.recordPause('b', 2000);
    expect(tracker.recordPause('c', 1000 + AUTOPLAY_PAUSE_WINDOW_MS)).toBe(false);
    expect(tracker.recordPause('d', 1500 + AUTOPLAY_PAUSE_WINDOW_MS)).toBe(true);
  });

  it('respects the saved cooldown on a new session and permits a later suggestion', () => {
    const tracker = createAutoplayPauseTracker();
    const lastPromptAt = 1000;
    for (const id of ['a', 'b', 'c']) {
      expect(tracker.recordPause(id, lastPromptAt + AUTOPLAY_PROMPT_COOLDOWN_MS - 1, lastPromptAt)).toBe(false);
    }
    const later = lastPromptAt + AUTOPLAY_PROMPT_COOLDOWN_MS;
    expect(tracker.recordPause('d', later, lastPromptAt)).toBe(false);
    expect(tracker.recordPause('e', later + 1, lastPromptAt)).toBe(false);
    expect(tracker.recordPause('f', later + 2, lastPromptAt)).toBe(true);
  });

  it('ignores empty identifiers', () => {
    const tracker = createAutoplayPauseTracker();
    tracker.recordPause('', 1000);
    expect(tracker.recordPause('a', 2000)).toBe(false);
    expect(tracker.recordPause('b', 3000)).toBe(false);
  });
});
