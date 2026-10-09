import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Image: 'Image', Platform: { OS: 'android' },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: any) => children,
  Gesture: { Pan: () => {
    const chain: any = {};
    ['minDistance', 'activeOffsetX', 'failOffsetY', 'onStart', 'onUpdate', 'onEnd'].forEach(k => { chain[k] = () => chain; });
    return chain;
  } },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'AnimatedView' },
  useSharedValue: (value: number) => ({ value }), useAnimatedStyle: (fn: () => unknown) => fn(),
  Easing: { bezier: () => null }, withTiming: (v: number) => v, cancelAnimation: jest.fn(), runOnJS: (fn: unknown) => fn,
}));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/GlassIndicator', () => ({ __esModule: true, default: () => null, GLASS_SHADOW: {} }));
jest.mock('../../components/ui/FrostedPill', () => () => null);
jest.mock('../../components/theme/HudBrackets', () => () => null);
jest.mock('../../theme/skins', () => ({ GRAIN: 0, glassTint: () => '' }));
let mockMinimal = false;
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ isMinimal: mockMinimal }) }));
import FeedNavBar, { FEED_NAV_ITEMS } from '../../components/Home/FeedNavBar';
const touch = (x = 20, y = 20) => ({ nativeEvent: { pageX: x, pageY: y, touches: [{}] } });

it.each([false, true])('only holds the active tab open and leaves normal taps intact (minimal=%s)', (minimal) => {
  mockMinimal = minimal;
  const open = jest.fn(), change = jest.fn();
  for (let index = 0; index < FEED_NAV_ITEMS.length; index++) {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<FeedNavBar activeIndex={index} progress={{ value: index } as any} isFilterOpen={false} hasActiveFilters={false} onPostTypeChange={change} onFilterPress={jest.fn()} onActiveTabLongPress={open} />); });
    const tabs = tree.root.findAll(n => n.type === ('Pressable' as any) && n.props.accessibilityRole === 'tab');
    tabs.forEach((tab, i) => {
      expect(!!tab.props.onLongPress).toBe(i === index);
      act(() => tab.props.onPress());
      expect(change).toHaveBeenLastCalledWith(FEED_NAV_ITEMS[i].postType);
    });
    const tab = tabs[index];
    act(() => tab.props.onPressIn(touch()));
    act(() => tab.props.onLongPress());
    expect(open).toHaveBeenCalledTimes(index + 1);
    act(() => tree.unmount());
  }
});

it.each(['horizontal', 'vertical', 'cancel', 'release'])('does not open after %s movement/cancellation', (mode) => {
  const open = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<FeedNavBar activeIndex={0} progress={{ value: 0 } as any} isFilterOpen={false} hasActiveFilters={false} onPostTypeChange={jest.fn()} onFilterPress={jest.fn()} onActiveTabLongPress={open} />); });
  const tab = tree.root.findAll(n => n.type === ('Pressable' as any) && n.props.accessibilityRole === 'tab')[0];
  act(() => tab.props.onPressIn(touch()));
  act(() => {
    if (mode === 'cancel') tab.props.onTouchCancel();
    else if (mode === 'release') tab.props.onPressOut();
    else {
      tab.props.onTouchMove(mode === 'horizontal' ? touch(26, 20) : touch(20, 26));
      tab.props.onTouchMove(touch());
    }
  });
  act(() => tab.props.onLongPress());
  expect(open).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
