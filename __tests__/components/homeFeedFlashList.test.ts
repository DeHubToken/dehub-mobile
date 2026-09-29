import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'vm';
import ts from 'typescript';

// The feed module cannot be imported here: @shopify/flash-list throws at import
// time without the new architecture, which Jest never has. The pieces below
// are cut out of the source and run on their own instead.
const root = resolve(__dirname, '../..');
const feed = readFileSync(resolve(root, 'components/Home/InfiniteVideoFeed.tsx'), 'utf8');
const card = readFileSync(resolve(root, 'components/Home/FeedCard.tsx'), 'utf8');
const header = readFileSync(resolve(root, 'hooks/useCollapsibleHeader.ts'), 'utf8');
const en = JSON.parse(readFileSync(resolve(root, 'i18n/locales/en.json'), 'utf8'));

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source moved: ${start} .. ${end}`);
  return source.slice(from, to);
}

function run(code: string, context: Record<string, unknown>): any {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  // Host Set/Map, so results compare equal to the ones built in the tests.
  return runInNewContext(js, { Set, Map, ...context });
}

const resolveContentType = run(
  slice(card, 'export function resolveContentType', 'function formatShortTimeAgo').replace(/^export /, '') +
    '\nresolveContentType',
  {},
);

function moduleScope() {
  const Animated = { createAnimatedComponent: jest.fn((component: unknown) => ({ animated: component })) };
  const FlashList = { name: 'FlashList' };
  const scope = run(
    slice(feed, 'type FeedRow =', '// One row. Subscribes') +
      '\n({ feedRowKey, feedRowType, HEADER_ROW, SUGGESTED_ROW, SUGGEST_AFTER_INDEX, AnimatedFlashList })',
    { Animated, FlashList, React: {}, resolveContentType, TAB_BAR_CONTENT_INSET: 0 },
  );
  return { ...scope, Animated, FlashList };
}

describe('home feed on FlashList: module scope', () => {
  it('wraps FlashList for Reanimated once, outside the component', () => {
    const { Animated, FlashList, AnimatedFlashList } = moduleScope();
    expect(Animated.createAnimatedComponent).toHaveBeenCalledTimes(1);
    expect(Animated.createAnimatedComponent).toHaveBeenCalledWith(FlashList);
    expect(AnimatedFlashList).toEqual({ animated: FlashList });
    // A wrapper built during render is a new component type every render, and
    // the list remounts (the #925 failure, reverted in #930).
    expect(feed.match(/createAnimatedComponent\(/g)).toHaveLength(1);
    expect(feed.indexOf('createAnimatedComponent(')).toBeLessThan(feed.indexOf('export const InfiniteVideoFeed'));
    expect(feed).not.toContain('Animated.FlatList');
    expect(feed).not.toMatch(/import\s*\{[^}]*\bFlatList\b[^}]*\}\s*from "react-native"/);
    expect(feed).toContain('import { FlashList, type FlashListRef, type ListRenderItem, type ViewToken } from "@shopify/flash-list";');
  });

  it('keys a post by its id, so a page shift does not rename it', () => {
    const { feedRowKey } = moduleScope();
    expect(feedRowKey({ tokenId: 42, __listKey: '42-a-p0-i3' })).toBe('post-42');
    expect(feedRowKey({ tokenId: 42, __listKey: '42-a-p1-i0' })).toBe('post-42');
    expect(feedRowKey({ id: 'abc', __listKey: 'x' })).toBe('post-abc');
    expect(feedRowKey({ postType: 'live', stream: { tokenId: 7 }, __listKey: 'x' })).toBe('post-7');
    expect(feedRowKey({ __listKey: 'auto-nocreated-p0-i1' })).toBe('auto-nocreated-p0-i1');
    // The boosted copy never shares a key with the organic row it replaced.
    expect(feedRowKey({ tokenId: 42, __boosted: true, __listKey: 'boost-42-b1' })).toBe('boost-42-b1');
  });

  it('reuses a cell only for a row of the same shape', () => {
    const { feedRowType, HEADER_ROW, SUGGESTED_ROW } = moduleScope();
    expect(feedRowType(HEADER_ROW)).toBe('header');
    expect(feedRowType(SUGGESTED_ROW)).toBe('suggested');
    expect(feedRowType({ postType: 'video', __listKey: 'k' })).toBe('video');
    expect(feedRowType({ postType: 'short', __listKey: 'k' })).toBe('video');
    expect(feedRowType({ postType: 'live', __listKey: 'k' })).toBe('live');
    expect(feedRowType({ postType: 'feed-audio', audioUrl: 'a.mp3', __listKey: 'k' })).toBe('audio');
    expect(feedRowType({ postType: 'feed-images', imageUrls: ['a', 'b'], __listKey: 'k' })).toBe('gallery');
    expect(feedRowType({ postType: 'feed-images', imageUrls: ['a'], __listKey: 'k' })).toBe('image');
    expect(feedRowType({ postType: 'feed-images', thumbnailUrl: 't', __listKey: 'k' })).toBe('image');
    expect(feedRowType({ postType: 'feed-text', __listKey: 'k' })).toBe('text');
  });
});

describe('home feed on FlashList: rows', () => {
  const { HEADER_ROW, SUGGESTED_ROW, SUGGEST_AFTER_INDEX } = moduleScope();
  const build = (feedItems: unknown[]) =>
    run(slice(feed, '  const listData = useMemo<FeedRow[]>(', '  // Ticks are skipped while hidden') + '\nlistData', {
      useMemo: (fn: () => unknown) => fn(),
      feedItems,
      HEADER_ROW,
      SUGGESTED_ROW,
      SUGGEST_AFTER_INDEX,
    });
  const post = (n: number) => ({ tokenId: n, __listKey: `k${n}` });

  it('puts the header first and the suggested accounts after the fifth post, once', () => {
    const rows = build([0, 1, 2, 3, 4, 5, 6].map(post));
    expect([...rows].map((r: any) => r.__listKey)).toEqual([
      '__feed-header', 'k0', 'k1', 'k2', 'k3', 'k4', '__suggested-accounts', 'k5', 'k6',
    ]);
  });

  it('adds no suggested row to a short feed and no rows at all to an empty one', () => {
    expect([...build([0, 1, 2].map(post))].map((r: any) => r.__listKey)).toEqual(['__feed-header', 'k0', 'k1', 'k2']);
    const empty: unknown[] = [];
    expect(build(empty)).toBe(empty);
    // The empty list still gets the header spacer, from ListHeaderComponent.
    expect(feed).toContain('ListHeaderComponent={listData.length === 0 ? headerBlock : null}');
  });

  it('renders the synthetic rows by type, not by index', () => {
    const renderItem = slice(feed, '  const renderItem = useCallback<ListRenderItem<FeedRow>>(', '  // One fixed-height slot');
    expect(renderItem).toContain('if (item.__synthetic === "header") return headerBlock;');
    expect(renderItem).toContain('if (item.__synthetic === "suggested") return <SuggestedAccountsSection />;');
    expect(renderItem).not.toMatch(/\bindex\b/);
  });
});

describe('home feed on FlashList: visibility', () => {
  const isVideoItem = (item: any) => item.postType === 'video' || item.postType === 'short';
  const isLiveItem = (item: any) => item.postType === 'live';

  function handler() {
    const trackers = new Map<string, { onVisibilityChange: jest.Mock }>();
    const ctx = {
      useRef: (current: unknown) => ({ current }),
      activeRef: { current: true },
      visibleKeysRef: { current: new Set<string>() },
      visibleTokensRef: { current: new Map() },
      visibilityStore: { update: jest.fn() },
      isVideoItem,
      isLiveItem,
      getViewTracker: (id: unknown) => {
        const key = String(id);
        if (!trackers.has(key)) trackers.set(key, { onVisibilityChange: jest.fn() });
        return trackers.get(key)!;
      },
    };
    const onViewable = run(
      slice(feed, '  const onViewableItemsChanged = useRef(', '  useScrollToTop(') + '\nonViewableItemsChanged',
      ctx,
    );
    const tick = (...rows: Array<[number, any]>) =>
      onViewable({ viewableItems: rows.map(([index, item]) => ({ index, item, isViewable: true })), changed: [] });
    return { ctx, trackers, tick };
  }

  const head = { __listKey: '__feed-header', __synthetic: 'header' };
  const suggested = { __listKey: '__suggested-accounts', __synthetic: 'suggested' };
  const video = (n: number) => ({ tokenId: n, postType: 'video', __listKey: `v${n}` });
  const live = (n: number) => ({ tokenId: n, postType: 'live', __listKey: `l${n}` });
  const image = (n: number) => ({ tokenId: n, postType: 'feed-images', __listKey: `i${n}` });

  it('never counts the header or suggested rows as posts', () => {
    const { ctx, tick } = handler();
    tick([0, head], [1, image(1)], [2, suggested], [3, video(2)]);
    expect(ctx.visibilityStore.update).toHaveBeenLastCalledWith(new Set(['i1', 'v2']), 'v2');
  });

  it('hands autoplay to a live row ahead of a video above it', () => {
    const { ctx, tick } = handler();
    tick([1, video(1)], [2, image(2)], [3, live(3)]);
    expect(ctx.visibilityStore.update).toHaveBeenLastCalledWith(new Set(['v1', 'i2', 'l3']), 'l3');
  });

  it('rebuilds from the full visible set, since FlashList diffs by index', () => {
    const { ctx, tick } = handler();
    tick([1, video(1)], [2, image(2)]);
    // Same indices, different posts (a prepend or a new page), and no `changed`.
    tick([1, video(9)], [2, image(2)]);
    expect(ctx.visibilityStore.update).toHaveBeenLastCalledWith(new Set(['v9', 'i2']), 'v9');
    expect(ctx.visibleKeysRef.current).toEqual(new Set(['v9', 'i2']));
  });

  it('reports each post to its view tracker once on arrival and once on leaving', () => {
    const { trackers, tick } = handler();
    tick([1, image(1)], [2, video(2)]);
    tick([1, image(1)], [2, video(2)]); // a recompute of the same set
    tick([1, image(3)]);
    expect(trackers.get('1')!.onVisibilityChange.mock.calls).toEqual([[0.6], [0]]);
    expect(trackers.get('3')!.onVisibilityChange.mock.calls).toEqual([[0.6]]);
    // Videos count their own views through playback.
    expect(trackers.has('2')).toBe(false);
  });

  it('does nothing while the page is hidden', () => {
    const { ctx, trackers, tick } = handler();
    ctx.activeRef.current = false;
    tick([1, image(1)]);
    expect(ctx.visibilityStore.update).not.toHaveBeenCalled();
    expect(trackers.size).toBe(0);
  });

  it('asks for a full tick when shown, when the rows change and after sign-in', () => {
    expect(feed).toMatch(
      /useEffect\(\(\) => \{\s*if \(!active\) return;[\s\S]*?listRef\.current\?\.recomputeViewableItems\(\);[\s\S]*?\}, \[active, listData, onViewableItemsChanged\]\);/,
    );
    const signIn = slice(feed, 'viewTrackersRef.current.forEach((tracker) => tracker.cleanup());', '}, [isSignedIn]);');
    expect(signIn).toContain('visibleTokensRef.current = new Map();');
    expect(signIn).toContain('recomputeViewableItems()');
    // recordInteraction fires once per list lifetime under FlashList.
    expect(feed).not.toContain('recordInteraction');
  });
});

describe('home feed on FlashList: list props', () => {
  // The props only; the comments between them name the FlatList props on purpose.
  const list = slice(feed, '<AnimatedFlashList', '/>').replace(/\/\/.*$/gm, '');

  it('wires the list the way the plan and the phone checks expect', () => {
    for (const prop of [
      'ref={listRef}',
      'data={listData}',
      'keyExtractor={feedRowKey}',
      'getItemType={feedRowType}',
      'renderItem={renderItem}',
      'maintainVisibleContentPosition={MAINTAIN_POSITION}',
      'onContentSizeChange={handleContentSizeChange}',
      'drawDistance={drawDistance}',
      'maxItemsInRecyclePool={MAX_POOLED_CELLS}',
      'onEndReached={endReached ? undefined : loadMore}',
      'onEndReachedThreshold={3}',
      'onScroll={scrollHandler ?? handleScroll}',
      'onScrollBeginDrag={handleScrollBeginDrag}',
      'onScrollEndDrag={handleScrollEndDrag}',
      'onMomentumScrollBegin={handleMomentumScrollBegin}',
      'onMomentumScrollEnd={handleMomentumScrollEnd}',
      'viewabilityConfig={viewabilityConfig}',
      'onViewableItemsChanged={onViewableItemsChanged}',
      'refreshControl={refreshControl}',
      'ListFooterComponent={listFooter}',
      'ListEmptyComponent={listEmpty}',
    ]) {
      expect(list).toContain(prop);
    }
    expect(feed).toContain('const MAINTAIN_POSITION = { autoscrollToTopThreshold: 100 } as const;');
  });

  it('passes no FlatList-only or layout-overriding props', () => {
    expect(list).not.toMatch(
      /renderScrollComponent|estimatedItemSize|overrideItemLayout|masonry|initialNumToRender|maxToRenderPerBatch|windowSize=|removeClippedSubviews|updateCellsBatchingPeriod/,
    );
  });

  it('hands the list no fresh object or element on a render', () => {
    // Any new prop re-renders the list, and FlashList then re-measures every
    // mounted cell.
    expect(list).not.toMatch(/=\{\{|=\{</);
    expect(list).not.toMatch(/=\{\(|=>\s/);
  });

  it('scrolls to the top on a tab press', () => {
    expect(feed).toContain('useScrollToTop(listRef as any);');
    const tabPress = slice(feed, 'navigation.addListener("tabPress"', 'return unsubscribe;');
    expect(tabPress).toContain('listRef.current?.scrollToOffset({ offset: 0, animated: true });');
  });

  it('keeps the collapsing header handler stable across renders', () => {
    // Without deps Reanimated rebuilds the handler every render; each rebuild
    // is a new onScroll for every feed list and defeats memo(InfiniteVideoFeed).
    expect(header).toMatch(
      /useAnimatedScrollHandler\(\s*\{\s*onScroll: \(event\) => \{[\s\S]*?driveWorklet\(event\.contentOffset\.y\);\s*\},\s*\},\s*\[\],\s*\);/,
    );
  });

  it('translates the empty state', () => {
    expect(feed).toContain('message={t("feed.noFilterMatches")}');
    expect(feed).toContain('clearLabel={t("feed.clearFilters")}');
    expect(feed).not.toContain('No content matches your filters');
    expect(en.feed.noFilterMatches).toBe('No content matches your filters');
    expect(en.feed.clearFilters).toBe('Clear filters');
  });
});
