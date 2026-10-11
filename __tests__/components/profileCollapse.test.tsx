import React from 'react';
import { act, create } from 'react-test-renderer';
import CollapsingProfileHeader from '../../components/Profile/CollapsingProfileHeader';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Image: 'Image', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: (x: unknown) => x, absoluteFill: {} } }));
jest.mock('../../components/ScreenHeader', () => 'Back');
jest.mock('../../components/ui/ChromeSurface', () => 'Glass');
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'system', colors: { neutrals: { 900: '#000' } } }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let mockReaction: (() => void) | undefined;
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'AnimatedView' },
  useAnimatedStyle: () => ({}), Extrapolation: { CLAMP: 'clamp' }, interpolate: () => 0,
  useDerivedValue: (derive: () => boolean) => ({ get value() { return derive(); } }),
  runOnJS: (fn: unknown) => fn,
  useAnimatedReaction: (prepare: () => boolean, react: (next: boolean, previous: boolean | null) => void) => {
    mockReaction = () => react(prepare(), null);
  },
}));

it('keeps Back available, reveals Follow after collapse, and restores the expanded state', () => {
  const scrollY = { value: 0 } as any;
  const onFollow = jest.fn(), onOpenUnfollow = jest.fn(), onBackPress = jest.fn();
  const props = { scrollY, identityBottom: { value: 230 } as any, actionsBottom: { value: 190 } as any, tabsPinned: { value: false } as any, name: 'Creator', showFollow: true, onFollow, onOpenUnfollow, onBackPress };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<CollapsingProfileHeader {...props} />); });
  expect(tree.root.findAllByType('Button' as any)).toHaveLength(0);
  act(() => tree.root.findByType('Back' as any).props.onBackPress());
  expect(onBackPress).toHaveBeenCalledTimes(1);
  act(() => { scrollY.value = 180; mockReaction?.(); });
  expect(tree.root.findAllByType('Button' as any)).toHaveLength(0);
  act(() => { scrollY.value = 200; mockReaction?.(); });
  act(() => tree.root.findByType('Button' as any).props.onPress());
  expect(onFollow).toHaveBeenCalledTimes(1);
  act(() => { tree.update(<CollapsingProfileHeader {...props} isFollowing />); });
  act(() => tree.root.findByType('Button' as any).props.onPress());
  expect(onOpenUnfollow).toHaveBeenCalledTimes(1);
  act(() => { tree.update(<CollapsingProfileHeader {...props} isPending followLoading />); });
  expect(tree.root.findByType('Button' as any).props.disabled).toBe(true);
  act(() => { tree.update(<CollapsingProfileHeader {...props} showFollow={false} />); });
  expect(tree.root.findAllByType('Button' as any)).toHaveLength(0);
  act(() => { scrollY.value = 0; mockReaction?.(); tree.update(<CollapsingProfileHeader {...props} />); });
  expect(tree.root.findAllByType('Button' as any)).toHaveLength(0);
  act(() => tree.unmount());
});
