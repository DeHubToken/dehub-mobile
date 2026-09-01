/**
 * The producer console's two numbers, and the field names that keep swapping
 * them.
 *
 * On the backend `peakViewers` is a high-water mark and `totalViews` counts
 * JOINS — one viewer whose connection drops and returns three times makes
 * totalViews 3 with only one person ever in the room (production, 2026-09-01).
 * The seed here used to read those two as "current" and "all-time peak"
 * respectively, so a host opened on a figure that could only climb and a
 * "Peak" that was really a reconnect tally.
 *
 * `viewerCount` is the live concurrent figure. These pin which field feeds
 * which readout, because nothing else in the app would notice them swapping
 * back — the socket overwrites the live number within seconds and the bug
 * only shows in the first moments of a broadcast.
 */
import { seedViewerStats, createViewCountUpdater } from '../../libs/viewers.util';

describe('seedViewerStats', () => {
  it('takes the live figure from viewerCount, not from the peak or the join tally', () => {
    expect(seedViewerStats({ viewerCount: 1, peakViewers: 1, totalViews: 3 })).toEqual({
      liveViewers: 1,
      peakViewers: 1,
    });
  });

  it('never reports a join tally as the peak', () => {
    // Three joins by one viewer: the room never held more than one person.
    const seeded = seedViewerStats({ viewerCount: 1, peakViewers: 1, totalViews: 3 });
    expect(seeded.peakViewers).not.toBe(3);
  });

  it('falls back to peakViewers when the API predates viewerCount', () => {
    expect(seedViewerStats({ peakViewers: 2, totalViews: 9 })).toEqual({
      liveViewers: 2,
      peakViewers: 2,
    });
  });

  it('keeps the peak at or above the live count', () => {
    expect(seedViewerStats({ viewerCount: 5, peakViewers: 2 }).peakViewers).toBe(5);
  });

  it('answers zeroes for a stream that carries nothing', () => {
    expect(seedViewerStats(null)).toEqual({ liveViewers: 0, peakViewers: 0 });
    expect(seedViewerStats({})).toEqual({ liveViewers: 0, peakViewers: 0 });
  });
});

describe('createViewCountUpdater', () => {
  it('moves the peak up but never back down', () => {
    let live = 0;
    let peak = 0;
    const updater = createViewCountUpdater({
      setLive: (n) => { live = n; },
      setPeak: (n) => { peak = n; },
      getPeak: () => peak,
      debounceMs: 0,
    });

    updater.onViewCount(3);
    expect(live).toBe(3);
    expect(peak).toBe(3);

    updater.onViewCount(1);
    expect(live).toBe(1);
    expect(peak).toBe(3);

    updater.dispose?.();
  });
});
