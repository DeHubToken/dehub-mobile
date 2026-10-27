import React from 'react';
import { act, create } from 'react-test-renderer';
import { Platform } from 'react-native';
import ProfileSurface from '../../components/UserProfile/ProfileSurface';

const backListeners: Array<() => boolean> = [];
const finishSlide: Array<(finished: boolean) => void> = [];

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { absoluteFill: { position: 'absolute' } },
  Modal: 'NativeModal',
  useWindowDimensions: () => ({ width: 400, height: 800 }),
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      backListeners.push(listener);
      return { remove: () => backListeners.splice(backListeners.indexOf(listener), 1) };
    },
  },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView' },
  Easing: { out: (f: unknown) => f, in: (f: unknown) => f, cubic: 'cubic', quad: 'quad' },
  runOnJS: (fn: (...args: unknown[]) => void) => fn,
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: (fn: () => object) => fn(),
  withTiming: (value: number, _config: unknown, done?: (finished: boolean) => void) => {
    if (done) finishSlide.push(done);
    return value;
  },
}));
jest.mock('@react-navigation/native', () => ({ NavigationContext: require('react').createContext(undefined) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

it('slides Android profiles inside the activity window and handles the back button', () => {
  const close = jest.fn();
  const opened = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ProfileSurface visible onClose={close} onOpenComplete={opened}>profile</ProfileSurface>); });
  expect(tree.root.findAllByType('NativeModal' as any)).toHaveLength(0);
  const surface = tree.root.findByType('AnimatedView' as any);
  expect(surface.props.style[1]).toMatchObject({ top: -24, bottom: -16 });
  expect(surface.props.pointerEvents).toBe('auto');
  expect(opened).not.toHaveBeenCalled();
  act(() => { finishSlide[finishSlide.length - 1](false); });
  expect(opened).not.toHaveBeenCalled();
  act(() => { finishSlide[finishSlide.length - 1](true); });
  expect(opened).toHaveBeenCalledTimes(1);
  act(() => { backListeners[backListeners.length - 1](); });
  expect(close).toHaveBeenCalledTimes(1);

  // Closing keeps the page on screen until the slide out has finished.
  act(() => { tree.update(<ProfileSurface visible={false} onClose={close}>profile</ProfileSurface>); });
  expect(tree.root.findByType('AnimatedView' as any).props.pointerEvents).toBe('none');
  expect(backListeners).toHaveLength(0);
  act(() => { finishSlide[finishSlide.length - 1](true); });
  expect(tree.root.findAllByType('AnimatedView' as any)).toHaveLength(0);
  act(() => tree.unmount());
});

it('preserves the native fullscreen presentation on iOS', () => {
  const previousOS = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ProfileSurface visible onClose={close}>profile</ProfileSurface>); });
  expect(tree.root.findAllByType('AnimatedView' as any)).toHaveLength(0);
  const surface = tree.root.findByType('NativeModal' as any);
  expect(surface.props.presentationStyle).toBe('fullScreen');
  act(() => surface.props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  Object.defineProperty(Platform, 'OS', { configurable: true, value: previousOS });
});
