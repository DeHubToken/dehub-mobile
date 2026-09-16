import { readFileSync } from 'fs';
import { resolve } from 'path';

const feed = readFileSync(
  resolve(__dirname, '../../components/Home/InfiniteVideoFeed.tsx'),
  'utf8',
);

// The held page, the buffered live counts and the poll merge all land from
// settleScroll(). Landing them the moment the finger lifts put every one of
// them into the first frame of a fling, which is why the feed only started
// stuttering once a second page existed. These pins keep the settle off the
// lift and on the actual stop.
describe('home feed scroll settle timing', () => {
  it('schedules the settle on finger lift instead of running it', () => {
    const endDrag = feed.match(/const handleScrollEndDrag = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)?.[1] ?? '';
    expect(endDrag).toMatch(/setTimeout\(/);
    expect(endDrag).toMatch(/SETTLE_AFTER_DRAG_MS/);
    // The only settleScroll() call sits inside the timer callback.
    const beforeTimer = endDrag.slice(0, endDrag.indexOf('setTimeout('));
    expect(beforeTimer).not.toMatch(/settleScroll\(\)/);
    expect(endDrag.match(/settleScroll\(\)/g)).toHaveLength(1);
  });

  it('cancels the scheduled settle when a fling or a new drag starts', () => {
    const momentumBegin = feed.match(/const handleMomentumScrollBegin = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)?.[1] ?? '';
    const beginDrag = feed.match(/const handleScrollBeginDrag = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)?.[1] ?? '';
    expect(momentumBegin).toMatch(/cancelPendingSettle\(\)/);
    expect(beginDrag).toMatch(/cancelPendingSettle\(\)/);
  });

  it('settles for real when momentum ends', () => {
    const momentumEnd = feed.match(/const handleMomentumScrollEnd = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)?.[1] ?? '';
    expect(momentumEnd).toMatch(/cancelPendingSettle\(\)/);
    expect(momentumEnd).toMatch(/settleScroll\(\)/);
  });

  it('releases a held page before the list runs into its end', () => {
    const loadMore = feed.match(/const loadMore = useCallback\(\(\) => \{([\s\S]*?)\}, \[/)?.[1] ?? '';
    expect(loadMore).toMatch(/if \(holdPendingRef\.current\) \{\s*setHoldRelease/);
  });
});

/**
 * The home feed picks the autoplay row itself rather than going through
 * useFeedCardVisibility, so the rule has to be pinned in both places or the
 * two lists disagree about which card plays.
 */
describe('home feed autoplay slot', () => {
  it('gives the slot to a live row ahead of any video row', () => {
    const pick =
      feed.match(/const playable = viewableItems\.filter\(([\s\S]*?)visibilityStore\.update/)?.[0] ?? '';

    expect(pick).toMatch(/isLiveItem/);
    // The live row is chosen first and the position sort is the tie-break
    // among live rows, not a sort over every playable row.
    expect(pick).toMatch(/playable\s*\.filter\(v => isLiveItem[\s\S]*?\.sort\(byPosition\)\[0\][\s\S]*?\?\?/);
  });
});
