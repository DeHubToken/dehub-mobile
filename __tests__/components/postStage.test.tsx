import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render } from '@testing-library/react-native';
import PostStageActionBar from '../../components/Home/PostStageActionBar';
import RepostShareSheet, { shareTargetUrl } from '../../components/Home/RepostShareSheet';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (s: unknown) => s, flatten: (style: unknown) => style, hairlineWidth: 1 },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
  Share: { share: jest.fn(() => Promise.resolve()) },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/GlassModal', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../../components/Home/ReactionPicker', () => 'ReactionPicker');
jest.mock('../../components/Home/ReactionEmoji', () => ({ ReactionEmoji: 'ReactionEmoji' }));
jest.mock('../../components/Home/TipGemIcon', () => ({ TipGemIcon: () => null }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ skin: null, isMinimal: false }) }));
jest.mock('../../libs/haptics', () => ({ haptic: { tap: jest.fn(), press: jest.fn() } }));
jest.mock('../../libs/reaction-tip', () => ({ maybeShowReactionTip: jest.fn(), markReactionTipSeen: jest.fn() }));
jest.mock('../../hooks/useViewerTippedPost', () => ({ useViewerTippedPost: () => false }));

const readSource = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');

function barProps() {
  return {
    liked: false, disliked: false, saved: false, reposted: false,
    likeCount: 56, commentCount: 128, repostCount: 46,
    onLike: jest.fn(), onReact: jest.fn(), onComment: jest.fn(),
    onRepost: jest.fn(), onTip: jest.fn(), onSave: jest.fn(),
  };
}

describe('post page action bar', () => {
  it('is five tiles: like, comments, repost, tip, save — no share, dislike or info', () => {
    const view = render(<PostStageActionBar {...barProps()} />);
    const tiles = view.UNSAFE_getAllByType('Pressable' as any).filter((n) => n.props.accessibilityRole === 'button');
    expect(tiles).toHaveLength(5);
    const icons = view.UNSAFE_getAllByType('Icon' as any).map((n) => n.props.name);
    expect(icons).toEqual(['ThumbsUp', 'MessageSquare', 'Repeat2', 'Gem', 'Bookmark']);
    expect(icons).not.toContain('ThumbsDown');
    expect(icons).not.toContain('Share2');
    expect(icons).not.toContain('Info');
    expect(view.getByText('128')).toBeTruthy();
    expect(view.getByText('46')).toBeTruthy();
    expect(view.getByText('comments.tip')).toBeTruthy();
    expect(view.getByText('common.save')).toBeTruthy();
  });

  it('drops the tip tile where tips are not offered', () => {
    const view = render(<PostStageActionBar {...barProps()} onTip={undefined} />);
    const icons = view.UNSAFE_getAllByType('Icon' as any).map((n) => n.props.name);
    expect(icons).toEqual(['ThumbsUp', 'MessageSquare', 'Repeat2', 'Bookmark']);
  });

  it('routes comments and repost, and keeps 👎 inside the hold tray', () => {
    const p = barProps();
    const view = render(<PostStageActionBar {...p} reactionCounts={{ like: 3, dislike: 2 }} />);
    fireEvent.press(view.getByLabelText('postInfo.comments, 128'));
    expect(p.onComment).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByLabelText('feedCard.shareAndRepost, 46'));
    expect(p.onRepost).toHaveBeenCalledTimes(1);
    fireEvent(view.getByLabelText(/hold to react, 56/), 'longPress');
    expect(p.onLike).not.toHaveBeenCalled();
    const tray = view.UNSAFE_getByType('ReactionPicker' as any);
    expect(tray.props.open).toBe(true);
    fireEvent(tray, 'select', 'dislike');
    expect(p.onReact).toHaveBeenCalledWith('dislike');
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
    expect(detail).toMatch(/\{!postUnavailable && \(\r?\n\s*<Animated\.View\r?\n\s*pointerEvents=\{hideComposer/);
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
});
