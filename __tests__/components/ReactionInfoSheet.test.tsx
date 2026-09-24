import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';
import ReactionInfoSheet from '../../components/Home/ReactionInfoSheet';

const mockShowProfile = jest.fn();
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' }, Dimensions: { get: () => ({ height: 800 }) }, useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  SectionList: ({ sections, renderItem }: any) => sections.flatMap((section: any) => section.data.map((item: any) => renderItem({ item }))),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'View' }, useAnimatedStyle: () => ({}),
  useSharedValue: () => jest.requireActual('react').useRef({ value: 0 }).current, withTiming: () => 0, runOnJS: (f: unknown) => f,
  Easing: { out: () => null, in: () => null },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'View', GestureDetector: 'View',
  Gesture: { Pan: () => ({ onUpdate() { return this; }, onEnd() { return this; } }) },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../context/UserProfileSheetContext', () => ({ useUserProfileSheet: () => ({ showUserProfile: mockShowProfile }) }));
jest.mock('../../services/nft.service', () => ({ getPostLikers: async () => ({
  canViewLikers: true, data: [{ address: '0xalice', displayName: 'Alice', badgeBalance: 10 }],
  reactionCounts: { like: 3 }, pagination: { hasMore: false },
}) }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('../../components/common/SmartImage', () => 'Image');
jest.mock('../../libs/misc', () => ({ getAvatarUrl: () => '', getBadgeUrlFor: () => 1 }));
jest.mock('../../libs/engagement-weight', () => ({ engagementWeight: () => 3, formatEngagementWeight: () => '×3' }));

it('dismisses the native sheet before opening a profile and shows the badge multiplier', async () => {
  const close = jest.fn();
  const view = render(<ReactionInfoSheet visible onClose={close} tokenId={1} />);
  await waitFor(() => expect(view.getByText('Alice')).toBeTruthy());
  expect(view.getByText('×3')).toBeTruthy();
  fireEvent.press(view.getByText('Alice'));
  expect(view.UNSAFE_getByType(Modal).props.visible).toBe(false);
  expect(mockShowProfile).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
  expect(close).toHaveBeenCalledTimes(1);
  expect(mockShowProfile).toHaveBeenCalledWith('0xalice');
});
