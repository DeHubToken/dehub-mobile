import { MAX_ESCAPED_NOTES } from './bubbleLift';
import { canEscapeMusicNote, escapeMusicNote, getEscapedMusicNotes, subscribeEscapedMusicNotes } from './escapedMusicNotes';

it('keeps escaped notes after the source unsubscribes and bounds growth without evicting them', () => {
  let now = 10000;
  const time = jest.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const listener = jest.fn();
    const leavePage = subscribeEscapedMusicNotes(listener);
    escapeMusicNote(80, 200);
    const first = getEscapedMusicNotes()[0];
    escapeMusicNote(100, 220);
    expect(getEscapedMusicNotes()).toHaveLength(1);
    leavePage();
    for (let i = 1; i <= MAX_ESCAPED_NOTES + 2; i++) {
      now += 7000;
      escapeMusicNote(80 + i, 200);
    }
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getEscapedMusicNotes()).toHaveLength(MAX_ESCAPED_NOTES);
    expect(getEscapedMusicNotes()[0]).toBe(first);
    expect(canEscapeMusicNote()).toBe(false);
  } finally { time.mockRestore(); }
});
