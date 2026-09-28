import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FeedActionBar from '../../components/Home/FeedActionBar';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { flatten: (style: unknown) => style },
  Animated: {
    View: 'View',
    Value: class { stopAnimation = jest.fn(); },
    timing: jest.fn(() => ({ start: jest.fn() })),
    spring: jest.fn(() => ({ start: jest.fn() })),
    sequence: jest.fn(() => ({ start: jest.fn() })),
  },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/Home/ReactionPicker', () => 'ReactionPicker');
jest.mock('../../components/Home/ReactionEmoji', () => ({ ReactionEmoji: 'ReactionEmoji' }));
jest.mock('../../hooks/useAppPrefs', () => ({ useAppPrefs: () => ({ leftHanded: false }) }));
jest.mock('../../libs/haptics', () => ({ haptic: { tap: jest.fn(), press: jest.fn() } }));
jest.mock('../../libs/reaction-tip', () => ({ maybeShowReactionTip: jest.fn(), markReactionTipSeen: jest.fn() }));

function props() {
  return {
    liked: false, disliked: false, saved: false, reposted: false,
    likeCount: 3, dislikeCount: 0, commentCount: 2, repostCount: 0, tipCount: 0,
    onLike: jest.fn(), onDislike: jest.fn(), onComment: jest.fn(),
    onCommentPressIn: jest.fn(), onShare: jest.fn(), onSave: jest.fn(),
    onInfo: jest.fn(), onReact: jest.fn(),
  };
}

it('preserves comment prefetch and opens the thread once after a tap', () => {
  const handlers = props();
  const view = render(<FeedActionBar {...handlers} />);
  const comments = view.getByLabelText('postInfo.comments, 2');
  fireEvent(comments, 'pressIn');
  expect(handlers.onCommentPressIn).toHaveBeenCalledTimes(1);
  expect(handlers.onComment).not.toHaveBeenCalled();
  fireEvent.press(comments);
  expect(handlers.onComment).toHaveBeenCalledTimes(1);
  expect(handlers.onLike).not.toHaveBeenCalled();
  view.unmount();
});

it('keeps holding for the reaction tray distinct from casting a reaction', () => {
  const handlers = props();
  const view = render(<FeedActionBar {...handlers} />);
  const like = view.getByLabelText(/Like.*hold to react, 3/);
  fireEvent(like, 'longPress');
  expect(handlers.onLike).not.toHaveBeenCalled();
  expect(handlers.onReact).not.toHaveBeenCalled();
  const tray = view.UNSAFE_getAllByType('ReactionPicker' as any).find(node => node.props.open);
  expect(tray).toBeDefined();
  fireEvent(tray!, 'select', 'love');
  expect(handlers.onReact).toHaveBeenCalledWith('love');
  expect(handlers.onLike).not.toHaveBeenCalled();
});
