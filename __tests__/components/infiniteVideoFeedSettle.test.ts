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
