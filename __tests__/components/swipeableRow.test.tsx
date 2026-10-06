import React from 'react';
import { act, create } from 'react-test-renderer';
import SwipeableRow from '../../components/common/SwipeableRow';

const mockHandlers: Record<string, (...args: any[]) => void> = {};
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../libs/haptics', () => ({ haptic: { select: jest.fn() } }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'AnimatedView' },
  useSharedValue: (value: number) => require('react').useRef({ value }).current,
  useAnimatedStyle: (read: () => any) => read(),
  withSpring: (value: number) => value, withTiming: (value: number) => value,
  runOnJS: (callback: (...args: any[]) => void) => callback,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: 'GestureDetector',
  Gesture: { Pan: () => {
    const pan: Record<string, any> = {};
    for (const name of ['enabled', 'activeOffsetX', 'failOffsetY', 'onBegin', 'onStart', 'onUpdate', 'onEnd']) {
      pan[name] = (value: any) => { if (typeof value === 'function') mockHandlers[name] = value; return pan; };
    }
    return pan;
  } },
}));

const flatten = (style: any): any => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style ?? {};

it('keeps actions outside a transparent row and reveals only the swiped row', () => {
  const block = jest.fn();
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<SwipeableRow backgroundClassName="bg-transparent" actions={[
    { key: 'block', label: 'Block', icon: 'ban-outline', color: '#3F3F46', onPress: block },
    { key: 'delete', label: 'Delete', icon: 'trash-outline', color: '#DC2626', onPress: jest.fn(), destructive: true },
  ]}><React.Fragment>Conversation</React.Fragment></SwipeableRow>); });
  const panel = () => tree!.root.findAllByType('AnimatedView' as any)
    .find((node) => node.props.importantForAccessibility !== undefined)!;
  const track = () => panel().parent!;
  expect(flatten(tree!.root.findAllByType('AnimatedView' as any)[0].props.style).overflow).toBe('hidden');
  expect(flatten(track().props.style).transform).toEqual([{ translateX: 0 }]);
  expect(panel().props).toMatchObject({ pointerEvents: 'none', accessibilityElementsHidden: true });
  expect(block).not.toHaveBeenCalled();

  act(() => {
    tree!.root.findAllByType('AnimatedView' as any)[0].props.onLayout({ nativeEvent: { layout: { width: 390, height: 80 } } });
    mockHandlers.onBegin();
    mockHandlers.onUpdate({ translationX: -150 });
    mockHandlers.onEnd({ velocityX: 0 });
  });
  expect(flatten(track().props.style).transform).toEqual([{ translateX: -156 }]);
  const panelBox = flatten(panel().props.style);
  expect(panelBox).toMatchObject({ left: 390, width: 156 });
  expect(flatten(track().props.style).width).toBe(panelBox.left + panelBox.width);
  const closeButton = tree!.root.findAllByType('Pressable' as any)
    .find((node) => node.props.accessibilityLabel === 'Close swipe actions')!;
  expect(flatten(closeButton.parent!.props.style).width).toBe(390);
  expect(panel().props).toMatchObject({ pointerEvents: 'auto', accessibilityElementsHidden: false });
  act(() => { tree!.root.findAllByType('Pressable' as any).find((node) => node.props.accessibilityLabel === 'Block')!.props.onPress(); });
  expect(block).toHaveBeenCalledTimes(1);
  expect(flatten(track().props.style).transform).toEqual([{ translateX: 0 }]);
  expect(panel().props.accessibilityElementsHidden).toBe(true);
  act(() => tree!.unmount());
});
