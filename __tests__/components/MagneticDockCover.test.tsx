import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import MagneticDockCover from '../../components/common/MagneticDockCover';
import { registerDockTarget } from '../../libs/magneticDock';

let mockReduced = false;
let mockWidth = 390;
const mockMotions: { duration: number; complete: (result: { finished: boolean }) => void; stop: jest.Mock }[] = [];
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('../../screens/SplashScreen', () => 'SplashScreen');
jest.mock('react-native', () => ({
  View: 'View', Image: 'Image',
  useWindowDimensions: () => ({ width: mockWidth, height: 844 }),
  StyleSheet: { absoluteFill: { position: 'absolute', inset: 0 } },
  Easing: { bezier: () => 'easing' },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(mockReduced),
    addEventListener: () => ({ remove: jest.fn() }),
  },
  Animated: {
    View: 'AnimatedView', Image: 'AnimatedImage',
    Value: class { interpolate(config: unknown) { return config; } stopAnimation() {} },
    timing: (_value: unknown, config: { duration: number }) => {
      const stop = jest.fn();
      return { stop, start: (complete: (result: { finished: boolean }) => void) => mockMotions.push({ duration: config.duration, complete, stop }) };
    },
  },
}));

let tree: ReactTestRenderer;
let unregister: (() => void) | undefined;
const hide = jest.fn();
const done = jest.fn();
beforeEach(() => { jest.useFakeTimers(); mockReduced = false; mockWidth = 390; mockMotions.length = 0; hide.mockClear(); done.mockClear(); });
afterEach(() => { act(() => tree?.unmount()); unregister?.(); unregister = undefined; jest.clearAllTimers(); jest.useRealTimers(); });

async function launch(measureHost = true) {
  await act(async () => {
    tree = create(<MagneticDockCover enabled reveal={false} onComplete={done} />, {
      createNodeMock: () => ({ measureInWindow: (callback: (x: number, y: number) => void) => { if (measureHost) callback(0, 24); } }),
    });
  });
  await act(async () => { tree.update(<MagneticDockCover enabled reveal onComplete={done} />); });
}
function register() {
  unregister = registerDockTarget(callback => callback({ x: 174, y: 48, width: 42, height: 36, tint: '#111', hide }));
}

it('hides the real mark during flight and restores it exactly once at landing', async () => {
  register();
  await launch();
  expect(hide).toHaveBeenCalledWith(true);
  expect(mockMotions[0].duration).toBe(950);
  act(() => mockMotions[0].complete({ finished: true }));
  expect(hide).toHaveBeenLastCalledWith(false);
  act(() => jest.advanceTimersByTime(2000));
  expect(done).toHaveBeenCalledTimes(1);
});

it('crossfades without hiding the header when reduced motion is enabled', async () => {
  mockReduced = true;
  register();
  await launch();
  expect(mockMotions[0].duration).toBe(180);
  expect(hide).not.toHaveBeenCalled();
});

it('crossfades when no focused logo exists and releases a stalled host measurement', async () => {
  await launch();
  expect(mockMotions[0].duration).toBe(180);
  act(() => tree.unmount());
  register();
  await launch(false);
  act(() => jest.advanceTimersByTime(1400));
  expect(done).toHaveBeenCalledTimes(1);
});

it('restores the real mark and cancels pending work when entry unmounts', async () => {
  register();
  await launch();
  act(() => tree.unmount());
  expect(hide).toHaveBeenLastCalledWith(false);
  act(() => jest.advanceTimersByTime(2000));
  expect(done).not.toHaveBeenCalled();
});

it('releases the cover when rotation changes the landing coordinates', async () => {
  register();
  await launch();
  mockWidth = 844;
  await act(async () => { tree.update(<MagneticDockCover enabled reveal onComplete={done} />); });
  expect(hide).toHaveBeenLastCalledWith(false);
  expect(done).toHaveBeenCalledTimes(1);
});
