import React from 'react';
import { act, create } from 'react-test-renderer';
import ProfilePinnedBar from '../../components/Profile/ProfilePinnedBar';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', useWindowDimensions: () => ({ width: 390 }), StyleSheet: { create: (styles: unknown) => styles } }));
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/NavPillSurface', () => 'NavGlass');
jest.mock('react-native-reanimated', () => ({ useSharedValue: () => ({ value: 0 }) }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ colors: { foreground: '#fff' } }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it('keeps profile identity, Back and follow actions available beside the rail', () => {
  const onBackPress = jest.fn(), onFollow = jest.fn(), onOpenUnfollow = jest.fn();
  const props = { name: 'Creator', avatarUrl: 'https://example.com/avatar.webp', showFollow: true, onBackPress, onFollow, onOpenUnfollow };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ProfilePinnedBar {...props}><React.Fragment /></ProfilePinnedBar>); });
  expect(tree.root.findByType('NavGlass' as any)).toBeTruthy();
  expect(tree.root.findByType('Avatar' as any).props.uri).toBe(props.avatarUrl);
  act(() => tree.root.findByProps({ accessibilityLabel: 'common.goBack' }).props.onPress());
  act(() => tree.root.findByProps({ accessibilityLabel: 'follow.follow' }).props.onPress());
  expect(onBackPress).toHaveBeenCalledTimes(1);
  expect(onFollow).toHaveBeenCalledTimes(1);
  act(() => { tree.update(<ProfilePinnedBar {...props} isFollowing><React.Fragment /></ProfilePinnedBar>); });
  act(() => tree.root.findByProps({ accessibilityLabel: 'filters.following' }).props.onPress());
  expect(onOpenUnfollow).toHaveBeenCalledTimes(1);
  act(() => { tree.update(<ProfilePinnedBar {...props} isPending followLoading><React.Fragment /></ProfilePinnedBar>); });
  expect(tree.root.findByProps({ accessibilityLabel: 'follow.requested' }).props.disabled).toBe(true);
  act(() => { tree.update(<ProfilePinnedBar {...props} showFollow={false}><React.Fragment /></ProfilePinnedBar>); });
  expect(tree.root.findAllByType('Button' as any)).toHaveLength(1);
  act(() => tree.unmount());
});
