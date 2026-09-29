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
    // FlashList anchors on the first visible row. The header is row 0, so at
    // the top the boost is inserted below the anchor instead of above it.
    expect(source).toContain('const rows: FeedRow[] = [HEADER_ROW];');
  });

  it('does not pull a viewer back after they have left the top', () => {
    // Home passes the header's worklet as onScroll, so the offset must not
    // come from the JS handleScroll. It comes from the list itself, which
    // tracks it through its own scroll listener whatever onScroll is.
    expect(source).toContain('readOffset() > MAINTAIN_POSITION.autoscrollToTopThreshold');
    expect(source).toContain('listRef.current?.getAbsoluteLastScrollOffset() ?? 0');
    expect(source).toContain('onScroll={scrollHandler ?? handleScroll}');
    expect(source).not.toMatch(/readOffset = useCallback\([^;]*prevYRef/);
  });
});
