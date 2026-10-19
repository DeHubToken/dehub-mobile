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
let mockSurfaceActive = true;
jest.mock('../../libs/visualActivity', () => ({ useFeedSurfaceActive: () => mockSurfaceActive }));
jest.mock('../../components/ui/FrostedBackdrop', () => ({
  get androidFrostSupported() { return mockSupported; },
  useFrostedSource: () => mockTarget,
}));

let mockLight = false;
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ isLight: mockLight }) }));

let tree: ReactTestRenderer;
beforeEach(() => { mockSurfaceActive = true; });
afterEach(() => { act(() => tree?.unmount()); });

it('samples the supplied target using the Android 12+ path', () => {
  mockSupported = true;
  mockTarget = { current: {} };
  act(() => { tree = create(<FrostedPill tint="rgba(20,20,24,0.18)" borderRadius={12} />); });
  expect(tree.root.findByType('BlurView' as any).props).toMatchObject({ blurTarget: mockTarget, blurMethod: 'dimezisBlurViewSdk31Plus', intensity: 65 });
  expect(tree.root.findAllByType('View' as any)[0].props.style[1]).toMatchObject({ borderRadius: 12, overflow: 'hidden' });
});

it('can remove the reply-dock rim while retaining blur and the default pill rim', () => {
  mockSupported = true;
  mockTarget = { current: {} };
  const hasRim = () => tree.root.findAllByType('View' as any).some(view => view.props.style?.[1]?.borderWidth > 0);
  act(() => { tree = create(<FrostedPill tint="rgba(20,20,24,0.18)" borderRadius={12} bordered={false} />); });
  expect(hasRim()).toBe(false);
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
  act(() => { tree.update(<FrostedPill tint="rgba(20,20,24,0.18)" borderRadius={12} />); });
  expect(hasRim()).toBe(true);
});

it('detaches covered-page blur sampling and restores it when Back reveals the page', () => {
  mockSupported = true;
  mockTarget = { current: {} };
  const pill = () => <FrostedPill tint="rgba(20,20,24,0.18)" borderRadius={12} />;
  act(() => { tree = create(pill()); });
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
  act(() => { mockSurfaceActive = false; tree.update(pill()); });
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(0);
  act(() => { mockSurfaceActive = true; tree.update(pill()); });
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
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

it('System Light draws the pale frost, with no flipped highlight band', () => {
  mockSupported = true;
  mockTarget = { current: {} };
  mockLight = true;
  try {
    act(() => { tree = create(<FrostedPill tint="rgba(20,20,24,0.18)" borderRadius={12} />); });
    expect(tree.root.findAllByType('LinearGradient' as any)).toHaveLength(0);
    expect(tree.root.findByType('BlurView' as any).props.tint).toBe('light');
  } finally {
    mockLight = false;
  }
});
