import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render } from '@testing-library/react-native';
import RepostShareSheet, { shareTargetUrl } from '../../components/Home/RepostShareSheet';
import CommentsStageHeader from '../../components/Comments/CommentsStageHeader';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native-css-interop', () => ({ createInteropElement: jest.requireActual('react').createElement }));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (s: unknown) => s, flatten: (style: unknown) => style, hairlineWidth: 1 },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
  Share: { share: jest.fn(() => Promise.resolve()) },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string; [name: string]: unknown }) => (options?.defaultValue ?? key).replace(/{{(\w+)}}/g, (token, name) => String(options?.[name] ?? token)) }) }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/GlassModal', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../../components/Home/ReactionPicker', () => 'ReactionPicker');
jest.mock('../../components/Home/ReactionEmoji', () => ({ ReactionEmoji: 'ReactionEmoji' }));
jest.mock('../../components/Home/TipGemIcon', () => ({ TipGemIcon: () => null }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ skin: null, isMinimal: false }) }));
jest.mock('../../libs/haptics', () => ({ haptic: { tap: jest.fn(), press: jest.fn() } }));
jest.mock('../../libs/reaction-tip', () => ({ maybeShowReactionTip: jest.fn(), markReactionTipSeen: jest.fn() }));
jest.mock('../../hooks/useViewerTippedPost', () => ({ useViewerTippedPost: () => false }));
jest.mock('../../components/Comments/CommentTabRow', () => ({ COMMENT_SORTS: ['recent', 'oldest', 'liked'] }));
jest.mock('../../services/post-stats.service', () => ({ reportPostEvent: jest.fn() }));

const readSource = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');

describe('post page action bar', () => {
  it('is the feed row, not the boxed tiles', () => {
    const card = readSource('components/Home/FeedCard.tsx');
    const stage = card.slice(card.indexOf('if (stage) {'), card.indexOf('if (cinematicFeed) {'));
    expect(stage).toContain('<FeedActionBar');
    expect(stage).toContain('onShare={handleOpenRepostSheet}');
    expect(card).not.toContain('PostStageActionBar');
  });
});

describe('repost and share sheet', () => {
  function sheetProps() {
    return {
      visible: true, onClose: jest.fn(), isReposted: false,
      onRepost: jest.fn(), onUndoRepost: jest.fn(), onQuote: jest.fn(), onCopyLink: jest.fn(),
      shareUrl: 'https://dehub.io/app/post/1', shareText: 'Sunset',
      quoteCount: 12, repostCount: 34, onViewQuotes: jest.fn(), onViewReposts: jest.fn(),
    };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('offers repost, quote, the share targets and both lists with their counts', () => {
    const p = sheetProps();
    const view = render(<RepostShareSheet {...p} />);
    expect(view.getByText('feedCard.repostAndShare')).toBeTruthy();
    expect(view.getByLabelText('feedCard.repost')).toBeTruthy();
    expect(view.getByLabelText('transcript.quote')).toBeTruthy();
    for (const label of ['postOptions.copyLink', 'X', 'careers.telegram', 'WhatsApp', 'feedCard.moreShare']) {
      expect(view.getByLabelText(label)).toBeTruthy();
    }
    fireEvent.press(view.getByLabelText('feedCard.viewQuotes, 12'));
    fireEvent.press(view.getByLabelText('feedCard.viewReposts, 34'));
    jest.runAllTimers();
    expect(p.onViewQuotes).toHaveBeenCalledTimes(1);
    expect(p.onViewReposts).toHaveBeenCalledTimes(1);
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('turns repost into undo once reposted', () => {
    const p = { ...sheetProps(), isReposted: true };
    const view = render(<RepostShareSheet {...p} />);
    fireEvent.press(view.getByLabelText('feedCard.undoRepost'));
    expect(p.onUndoRepost).toHaveBeenCalledTimes(1);
    expect(p.onRepost).not.toHaveBeenCalled();
  });

  it('builds share links that carry the post url', () => {
    const url = 'https://dehub.io/app/post/1';
    expect(shareTargetUrl('x', url)).toBe('https://x.com/intent/post?url=https%3A%2F%2Fdehub.io%2Fapp%2Fpost%2F1');
    expect(shareTargetUrl('telegram', url, 'Hi')).toContain('t.me/share/url?url=https%3A%2F%2Fdehub.io');
    expect(shareTargetUrl('whatsapp', url)).toBe('https://wa.me/?text=https%3A%2F%2Fdehub.io%2Fapp%2Fpost%2F1');
  });
});

describe('post page on phones', () => {
  const detail = readSource('screens/FeedDetailScreen.tsx');
  const navigator = readSource('navigation/AppNavigator.tsx');
  const card = readSource('components/Home/FeedCard.tsx');

  it('docks the composer and shows no bottom nav', () => {
    // The post page is a root stack screen, outside the tab navigator, and
    // mounts no stand-in tab bar of its own: the docked composer takes the
    // bottom of the screen.
    const tabsStart = navigator.indexOf('BottomTabNavigator');
    expect(navigator).toContain('name={ScreenNames.FeedDetail}');
    expect(detail).not.toMatch(/StandaloneTabBar|FloatingBottomTabBar/);
    expect(tabsStart).toBeGreaterThan(-1);
    expect(detail).toContain('testID={stage ? "post-stage-composer" : undefined}');
    expect(detail).toMatch(/\{!postUnavailable && !leanPost && \(\r?\n\s*<Animated\.View\r?\n\s*pointerEvents=\{hideComposer/);
  });

  it('swaps the boxed tab strip for a comments header and pins a mini player instead', () => {
    expect(detail).toContain('const stageLayout = windowWidth < POST_STAGE_MAX_WIDTH;');
    expect(detail).toContain('{stage ? (\n            <CommentsStageHeader');
    expect(detail).toContain('{pinTabs && !stage && !postUnavailable && (');
    expect(detail).toContain('<PostStageMiniPlayer');
  });

  it('leaves the feed card untouched outside the post page', () => {
    expect(card).toContain('const stage = stageProp && (immersive || flat);');
    expect(card).toContain('if (stage) {');
    expect(card).toContain('<FeedActionBar');
  });

  it('keeps image controls below the photo and blurs the list beneath the composer', () => {
    expect(card).toContain('!postVideo && !postImage && <PostStageChrome overMedia');
    expect(card).toContain('openOptions: handleOpenOptions');
    expect(card).toContain('onMore={handleOpenOptions}');
    expect(detail).not.toContain('onMore={stageMedia.openOptions}');
    expect(detail).toContain('<FrostedContent>');
    expect(detail).toContain('<FrostedPill tint={stageGlassTint} borderRadius={skin?.square ? 0 : 12} bordered={false}');
    expect(detail).not.toContain('backgroundColor: stagePage');
    expect(detail).not.toContain('backgroundColor: Platform.OS === "android" ? stageSurface');
  });

  it('leaves search and sort in the comments header, with options beside Follow', () => {
    const view = render(<CommentsStageHeader count={3} sort="recent" onSortChange={jest.fn()} searchOpen={false} query="" onQueryChange={jest.fn()} onToggleSearch={jest.fn()} />);
    const icons = view.UNSAFE_getAllByType('Icon' as any).map((node) => node.props.name);
    expect(icons).toEqual(['Search', 'ListFilter']);
    const creator = readSource('components/Home/PostStage.tsx').split('export const PostStageCreator')[1];
    expect(creator.indexOf('icon="Ellipsis"')).toBeGreaterThan(creator.indexOf('onPress={onFollow}'));
  });
});
