import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'vm';
import ts from 'typescript';

// InfiniteFeed cannot be imported here: @shopify/flash-list throws at import
// time without the new architecture, which Jest never has. The module-scope
// helpers are cut out of the source and run on their own instead, as the home
// feed's FlashList test does.
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const feed = read('components/Feed/InfiniteFeed.tsx');
const card = read('components/Home/FeedCard.tsx');
const tabs = read('components/Profile/ProfileTabs.tsx');
const player = read('components/Home/FeedVideoPlayer.tsx');

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`source moved: ${start} .. ${end}`);
  return source.slice(from, to);
}

function run(code: string, context: Record<string, unknown>): any {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
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
    slice(feed, 'interface FeedItem extends GetNFTsResult', 'const VisibleFeedRow').replace(/export function/g, 'function') +
      '\n({ AnimatedFlashList, feedPostKey, feedPostType })',
    { Animated, FlashList, React: {}, resolveContentType },
  );
  return { ...scope, Animated, FlashList };
}

describe('InfiniteFeed on FlashList', () => {
  it('wraps FlashList for Reanimated once, outside the component', () => {
    const { Animated, FlashList, AnimatedFlashList } = moduleScope();
    expect(Animated.createAnimatedComponent).toHaveBeenCalledTimes(1);
    expect(Animated.createAnimatedComponent).toHaveBeenCalledWith(FlashList);
    expect(AnimatedFlashList).toEqual({ animated: FlashList });
    expect(feed.match(/createAnimatedComponent\(/g)).toHaveLength(1);
    expect(feed.indexOf('createAnimatedComponent(')).toBeLessThan(feed.indexOf('const InfiniteFeedBase'));
    expect(feed).not.toContain('Animated.FlatList');
    expect(feed).toContain('<AnimatedFlashList');
  });

  it('keys a post by its id, so a page shift does not rename its cell', () => {
    const { feedPostKey } = moduleScope();
    expect(feedPostKey({ tokenId: 42, __listKey: '42-a-p0-i3' })).toBe('post-42');
    expect(feedPostKey({ tokenId: 42, __listKey: '42-a-p1-i0' })).toBe('post-42');
    expect(feedPostKey({ id: 'abc', __listKey: 'x' })).toBe('post-abc');
    expect(feedPostKey({ postType: 'live', stream: { tokenId: 7 }, __listKey: 'x' })).toBe('post-7');
    expect(feedPostKey({ __listKey: 'auto-nocreated-p0-i1' })).toBe('auto-nocreated-p0-i1');
  });

  it('reuses a cell only for a row of the same media shape', () => {
    const { feedPostType } = moduleScope();
    expect(feedPostType({ postType: 'video', __listKey: 'a' })).toBe('video');
    expect(feedPostType({ postType: 'short', __listKey: 'a' })).toBe('video');
    expect(feedPostType({ postType: 'live', __listKey: 'a' })).toBe('live');
    expect(feedPostType({ imageUrls: ['a.jpg', 'b.jpg'], __listKey: 'a' })).toBe('gallery');
    expect(feedPostType({ imageUrls: ['a.jpg'], __listKey: 'a' })).toBe('image');
    expect(feedPostType({ imageUrl: 'a.jpg', __listKey: 'a' })).toBe('image');
    expect(feedPostType({ name: 'just text', __listKey: 'a' })).toBe('text');
  });

  it('uses one key for the list, the row subscription and the viewability handler', () => {
    expect(feed).toContain('keyExtractor={rowKeyOf}');
    expect(feed).toContain('rowKey={rowKeyOf(info.item, info.index)}');
    expect(feed).toContain('rowKeyOfRef.current(v.item, v.index ?? 0)');
    expect(feed).toContain('getItemType={feedPostType}');
  });

  it('rebuilds visibility from the full visible set, never from `changed`', () => {
    const handler = slice(feed, 'const handleViewableItemsChanged = useRef(', ').current;');
    expect(handler).toContain('({ viewableItems }');
    expect(handler).not.toMatch(/\bchanged\b(?!:)/);
    expect(handler).toContain('visibilityStore.update(');
    // A 0px row (a card deleted in place) never takes the autoplay slot.
    expect(handler).toContain('getLayout(v.index)?.height');
    // A fresh tick whenever the rows change.
    expect(feed).toContain('listRef.current?.recomputeViewableItems()');
  });

  it('drops a deleted post from the rows instead of relying on the card hiding itself', () => {
    expect(feed).toContain('useDeletedPostsVersion()');
    expect(feed).toMatch(/\[data, tombstonesReady, deletedVersion\]/);
  });

  it('holds the list props a parent render would otherwise replace', () => {
    expect(feed).toContain('contentContainerStyle={listContentStyle}');
    expect(feed).toContain('refreshControl={refreshControl}');
    expect(feed).toContain('ListFooterComponent={listFooter}');
    // The header is rebuilt when the list gains or loses rows, not per page.
    const header = slice(feed, 'const composedListHeader = useMemo(', 'const contentStyleKey');
    expect(header).not.toContain('items.length');
  });
});

describe('own profile scroll handler', () => {
  const routeLine = (key: string) => {
    const at = tabs.indexOf(`case "${key}":`);
    expect(at).toBeGreaterThan(-1);
    return tabs.slice(at, tabs.indexOf('\n', tabs.indexOf('return', at)));
  };

  it('drives the bottom nav from the UI thread on the Reanimated lists', () => {
    expect(tabs).toContain('useAnimatedScrollHandler');
    for (const key of ['home', 'posts', 'videos', 'songs', 'live', 'fractions', 'pinned', 'playlists']) {
      expect(routeLine(key)).toContain('onScroll={workletScroll}');
    }
  });

  it('keeps the JS handler where a plain ScrollView or FlatList can render', () => {
    for (const key of ['images', 'subscribers']) {
      expect(routeLine(key)).toContain('onScroll={onScroll}');
    }
  });
});

describe('feed video buffering', () => {
  // The module imports only a type from expo-video, so it loads in Jest.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const buffering = require('../../libs/videoBuffering');

  it('gives the mounted feed player more runway than previews, and no more than fullscreen', () => {
    const active = buffering.ACTIVE_FEED_BUFFER_OPTIONS;
    expect(active.maxBufferBytes).toBeGreaterThan(buffering.FEED_BUFFER_OPTIONS.maxBufferBytes);
    expect(active.maxBufferBytes).toBeLessThanOrEqual(buffering.FULLSCREEN_BUFFER_OPTIONS.maxBufferBytes);
    expect(active.preferredForwardBufferDuration).toBeLessThanOrEqual(
      buffering.FULLSCREEN_BUFFER_OPTIONS.preferredForwardBufferDuration,
    );
    // Start-up latency is unchanged.
    expect(active.minBufferForPlayback).toBe(buffering.FEED_BUFFER_OPTIONS.minBufferForPlayback);
  });

  it('is what the feed card player uses', () => {
    expect(player).toContain('p.bufferOptions = ACTIVE_FEED_BUFFER_OPTIONS;');
    expect(player).not.toContain('p.bufferOptions = FEED_BUFFER_OPTIONS;');
  });
});
