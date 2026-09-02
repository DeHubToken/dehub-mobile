/**
 * A watch is a view. A rewind is not.
 *
 * #305 made every watch count, which is right — a replay is a second view, and
 * capping at one per person per day is not how a video's view count works. What
 * it left behind was a re-arm test that fires on any jump back to the start: a
 * loop wrap and a viewer dragging the scrubber to the left edge look identical
 * to it, and there was no interval floor, so a six-second clip looping in the
 * feed re-armed roughly ten times a minute.
 *
 * isReplayWrap is that judgement on its own. It is pure, so these run without
 * the service's module graph (which reaches Supabase and will not load here).
 */
import { isReplayWrap } from '../../libs/view-replay';

/** A 60s clip watched to the end, then wrapped, a minute after the last view. */
const wrapOf60s = {
  positionMs: 100,
  lastPositionMs: 59_500,
  durationMs: 60_000,
  msSinceLastView: 60_000,
};

describe('isReplayWrap', () => {
  it('counts a clip that ran to the end and wrapped', () => {
    expect(isReplayWrap(wrapOf60s)).toBe(true);
  });

  it('rejects a drag back to the start from the middle', () => {
    // The jump to zero is identical; only where it came from differs.
    expect(isReplayWrap({ ...wrapOf60s, lastPositionMs: 20_000 })).toBe(false);
  });

  it('rejects a wrap that comes round too soon', () => {
    // Six-second clip looping in the feed: every wrap is a genuine wrap, but
    // ten views a minute from one viewer is not what the count means.
    expect(
      isReplayWrap({
        positionMs: 100,
        lastPositionMs: 5900,
        durationMs: 6000,
        msSinceLastView: 6000,
      }),
    ).toBe(false);
  });

  it('counts that same short clip once the floor has passed', () => {
    expect(
      isReplayWrap({
        positionMs: 100,
        lastPositionMs: 5900,
        durationMs: 6000,
        msSinceLastView: 30_000,
      }),
    ).toBe(true);
  });

  it('is not fooled by a position that never went back to the start', () => {
    expect(isReplayWrap({ ...wrapOf60s, positionMs: 4000 })).toBe(false);
  });

  it('ignores a wrap with no real watch behind it', () => {
    // Scrubbing about inside the first three seconds is not a watch.
    expect(
      isReplayWrap({ ...wrapOf60s, lastPositionMs: 2000, durationMs: 3000 }),
    ).toBe(false);
  });

  it('leans on the interval alone when the duration is unknown', () => {
    const noDuration = { positionMs: 100, lastPositionMs: 20_000, durationMs: null };
    // Nothing to compare the jump against, so a recent one is still refused...
    expect(isReplayWrap({ ...noDuration, msSinceLastView: 5000 })).toBe(false);
    // ...and an old one is allowed.
    expect(isReplayWrap({ ...noDuration, msSinceLastView: 45_000 })).toBe(true);
  });

  it('treats a zero duration as unknown rather than as the end', () => {
    // A player that has not resolved the length yet reports 0; comparing
    // against it would make every position "past the end".
    expect(
      isReplayWrap({ ...wrapOf60s, lastPositionMs: 8000, durationMs: 0 }),
    ).toBe(true);
  });
});
