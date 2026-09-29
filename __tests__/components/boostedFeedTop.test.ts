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
    // Only a reader still at the top is sent to the boost, both when it
    // arrives and when the list has laid it out.
    expect(source).toContain(
      'if (readOffset() <= MAINTAIN_POSITION.autoscrollToTopThreshold) pendingBoostRevealRef.current = true;',
    );
    expect(source).toMatch(
      /if \(readOffset\(\) <= MAINTAIN_POSITION\.autoscrollToTopThreshold\) \{\s*list\.scrollToOffset\(\{ offset: 0, animated: false \}\);/,
    );
    expect(source).toContain('listRef.current?.getAbsoluteLastScrollOffset() ?? 0');
    expect(source).toContain('onScroll={scrollHandler ?? handleScroll}');
    expect(source).not.toMatch(/readOffset = useCallback\([^;]*prevYRef/);
  });

  it('holds a reader who is past the top but still in the header row', () => {
    // FlashList holds the header row itself there, which the boost lands
    // below, so the post under the reader is held by hand (behaviour in
    // homeFeedFlashList.test).
    expect(source).toContain('heldOffset(readOffset(), before.headerBottom, layout.y - before.y)');
    expect(source).toContain('requestAnimationFrame(() => handleContentSizeChange())');
  });
});
