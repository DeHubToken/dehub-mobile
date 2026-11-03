import React from 'react';
import { act, create } from 'react-test-renderer';
import CollapsingProfileHeader from '../../components/Profile/CollapsingProfileHeader';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (x: unknown) => x } }));
jest.mock('../../components/ScreenHeader', () => 'Back');
let mockReaction: (() => void) | undefined;
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'AnimatedView' },
  useAnimatedStyle: () => ({}),
  runOnJS: (fn: unknown) => fn,
  useAnimatedReaction: (prepare: () => boolean, react: (next: boolean, previous: boolean | null) => void) => {
    mockReaction = () => react(prepare(), null);
  },
}));

it('shows only a floating Back until the tabs pin, with no compact name or Follow bar', () => {
  const onBackPress = jest.fn();
  const props = { scrollY: { value: 200 } as any, identityBottom: { value: 230 } as any, actionsBottom: { value: 190 } as any, tabsPinned: { value: false } as any, name: 'Creator', handle: '@creator', showFollow: true, onBackPress };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<CollapsingProfileHeader {...props} />); mockReaction?.(); });
  act(() => tree.root.findByType('Back' as any).props.onBackPress());
  expect(onBackPress).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType('Text' as any)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Creator');
  act(() => { props.tabsPinned.value = true; mockReaction?.(); });
  expect(tree.toJSON()).toMatchObject({ props: { pointerEvents: 'none', accessibilityElementsHidden: true } });
  act(() => tree.unmount());
});
