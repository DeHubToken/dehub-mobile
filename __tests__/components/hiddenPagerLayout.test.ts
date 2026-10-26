import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Home hides off-screen tab pages with display:none, and everything under
// them then reports a 0x0 layout. None of the feed may treat that as a real
// size, or each swipe back in re-lays out the page and the posts jump.
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('hidden pager pages keep their layout', () => {
  it('patches FlashList to skip 0x0 layouts in source and dist', () => {
    const patch = read('patches/@shopify+flash-list+2.3.2.patch');
    expect(patch).toContain('dist/recyclerview/RecyclerView.js');
    expect(patch).toContain('src/recyclerview/RecyclerView.tsx');
    expect(patch.match(/hiddenRef\.current = outerViewSize\.width === 0 && outerViewSize\.height === 0/g)).toHaveLength(1);
    expect(patch).toContain('pendingChildIds.size > 0 || hiddenRef.current');
    // The earlier row-container fix stays in the same patch.
    expect(patch).toContain('collapsable: false, style: hasData && containerStyle');
  });

  it('ignores a 0-wide header, gallery and audio band', () => {
    expect(read('components/Home/InfiniteVideoFeed.tsx')).toMatch(/handleHeaderContentLayout[\s\S]{0,400}layout\.width === 0\) return;/);
    expect(read('components/Home/FeedImageGallery.tsx')).toMatch(/if \(event\.nativeEvent\.layout\.width === 0\) return;/);
    expect(read('components/Home/AudioVisualizers.tsx')).toContain('if (w > 0) setWidth(');
  });

  it('sizes a live player from the clip shape it had before, not the cover', () => {
    expect(read('components/Home/FeedVideoPlayer.tsx')).toContain('videoAspect ?? knownVideoAspect(tokenId) ?? posterAspect');
  });
});
