import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import FrostedPill from '../../components/ui/FrostedPill';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' }, View: 'View',
  StyleSheet: { absoluteFill: { position: 'absolute' }, hairlineWidth: 0.5 },
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('../../components/ui/IosGlassPill', () => () => null);
let mockSupported = true;
let mockTarget: any = { current: {} };
jest.mock('../../components/ui/FrostedBackdrop', () => ({
  get androidFrostSupported() { return mockSupported; },
  useFrostedSource: () => mockTarget,
}));

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

it('samples the supplied target using the Android 12+ path', () => {
  mockSupported = true;
  mockTarget = { current: {} };
  act(() => { tree = create(<FrostedPill tint="rgba(20,20,24,0.18)" borderRadius={12} />); });
  expect(tree.root.findByType('BlurView' as any).props).toMatchObject({ blurTarget: mockTarget, blurMethod: 'dimezisBlurViewSdk31Plus', intensity: 65 });
  expect(tree.root.findAllByType('View' as any)[0].props.style[1]).toMatchObject({ borderRadius: 12, overflow: 'hidden' });
});

it.each([
  { supported: false, target: { current: {} } },
  { supported: true, target: undefined },
])('keeps a readable solid fallback when support=$supported', ({ supported, target }) => {
  mockSupported = supported;
  mockTarget = target;
  act(() => { tree = create(<FrostedPill tint="rgba(20,20,24,0.18)" borderRadius={12} />); });
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(0);
  expect(tree.root.findAllByType('View' as any).some(view => view.props.style?.[1]?.backgroundColor === '#18181B')).toBe(true);
});
