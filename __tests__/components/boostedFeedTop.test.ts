import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(__dirname, '../../components/Home/InfiniteVideoFeed.tsx'),
  'utf8',
);

describe('boosted home-feed placement', () => {
  it('keeps the boost as the first data row and corrects Android async prepends at the top', () => {
    expect(source).toContain('__boosted: true');
    expect(source).toContain('pendingBoostRevealRef.current = true');
    expect(source).toContain('scrollToOffset({ offset: 0, animated: false })');
    expect(source).toContain('onContentSizeChange={handleContentSizeChange}');
  });

  it('does not pull a viewer back after they have left the top', () => {
    // Home passes the header's worklet as onScroll, so the offset must come
    // from a UI-thread handler beside it, not from the JS handleScroll.
    expect(source).toContain('readOffset() > MAINTAIN_POSITION.autoscrollToTopThreshold');
    expect(source).toContain('useComposedEventHandler([scrollHandler ?? null, trackOffset])');
    expect(source).toContain('onScroll={scrollHandler ? composedScroll : handleScroll}');
    expect(source).toContain('(scrollHandler ? scrollOffset.value : prevYRef.current)');
  });
});
