import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');

// Every vertical feed or content list, plus the header-carrying scroll views a
// profile tab shows while it loads, fails or is empty. Web hides scrollbars
// everywhere, so the bar showing on some of these and not others made it blink
// in and out as people switched tabs.
const FEED_FILES = [
  'components/Feed/InfiniteFeed.tsx',
  'components/Home/InfiniteVideoFeed.tsx',
  'screens/FeedScreen.tsx',
  'screens/FeedDetailScreen.tsx',
  'components/Profile/PostsRoute.tsx',
  'components/Home/CompactVideoInfiniteList.tsx',
  'components/Profile/PinnedRoute.tsx',
  'components/Profile/PlaylistsRoute.tsx',
  'components/Profile/FractionsRoute.tsx',
  'components/Profile/ImagesRoute.tsx',
  'components/Profile/SubscribersRoute.tsx',
  'components/Profile/ProfileImageGrid.tsx',
  'components/UserProfile/UserProfileBottomContentTabs.tsx',
  'components/Comments/CommentSection.tsx',
  'components/Profile/PostsInfiniteList.tsx',
  'screens/NotificationScreen.tsx',
  'screens/DirectMessagesScreen.tsx',
  'screens/ChatScreen.tsx',
  'screens/CommunityDetailScreen.tsx',
  'screens/SavedPostsScreen.tsx',
  'screens/CommunitiesScreen.tsx',
  'screens/LeaderboardScreen.tsx',
];

// JSX opening tags only. The lookbehind drops type arguments such as
// useRef<FlatList<Item>>(null), where the name follows an identifier, and the
// lookahead drops longer names such as FlashListRef.
const LIST_TAG =
  /(?<![\w$.])<(Animated\.FlatList|AnimatedFlatList|AnimatedFlashList|Animated\.ScrollView|FlatList|FlashList|ScrollView)(?=[\s>])/g;

const HORIZONTAL = /\shorizontal(?=[\s=/>])/;

// The tag's own attributes, up to its closing '>'. Braces are walked so a prop
// like refreshControl={<X />} does not end the tag early, and each braced value
// is collapsed to {} so a nested list or a comment inside a render prop cannot
// answer for the outer one. {false}, {true} and spreads are kept as written.
function listTags(source: string): { line: number; attrs: string }[] {
  const tags: { line: number; attrs: string }[] = [];
  for (const match of source.matchAll(LIST_TAG)) {
    const start = match.index ?? 0;
    let attrs = '';
    let group = '';
    let depth = 0;
    let i = start;
    while (i < source.length) {
      const ch = source[i];
      if (depth === 0) {
        if (ch === '>') {
          attrs += ch;
          break;
        }
        if (ch === '"' || ch === "'") {
          const close = source.indexOf(ch, i + 1);
          if (close < 0) break;
          attrs += source.slice(i, close + 1);
          i = close + 1;
          continue;
        }
        // Comments between props are dropped so their wording cannot match.
        if (source.startsWith('//', i)) {
          const eol = source.indexOf('\n', i);
          if (eol < 0) break;
          i = eol;
          continue;
        }
        if (source.startsWith('/*', i)) {
          const close = source.indexOf('*/', i);
          if (close < 0) break;
          i = close + 2;
          continue;
        }
      }
      if (ch === '{') depth++;
      if (depth > 0) group += ch;
      else attrs += ch;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          attrs += group === '{false}' || group === '{true}' || group.startsWith('{...') ? group : '{}';
          group = '';
        }
      }
      i++;
    }
    tags.push({ line: source.slice(0, start).split('\n').length, attrs });
  }
  return tags;
}

describe('feed lists hide the vertical scroll bar', () => {
  it.each(FEED_FILES)('%s', (path) => {
    const tags = listTags(read(path));
    // A refactor that moves the list out of the file should fail here rather
    // than pass with nothing left to check.
    expect(tags.length).toBeGreaterThan(0);
    const showing = tags
      .filter(({ attrs }) => !HORIZONTAL.test(attrs))
      .filter(
        ({ attrs }) =>
          !attrs.includes('showsVerticalScrollIndicator={false}') && !attrs.includes('{...listProps('),
      )
      .map(({ line, attrs }) => `${path}:${line} ${attrs.split('\n')[0]}`);
    expect(showing).toEqual([]);
  });

  it('hides it on every screen built with useCollapsibleScreen', () => {
    // Communities and Leaderboard get their list props from this helper, so
    // the tag check above accepts {...listProps(...)} on the strength of this.
    const hook = read('hooks/useCollapsibleScreen.ts');
    expect(hook).toMatch(/\n\s*showsVerticalScrollIndicator: false,/);
  });
});
