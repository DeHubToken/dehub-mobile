import React from 'react';
import { act, create } from 'react-test-renderer';
import { Platform } from 'react-native';
import ProfileSurface from '../../components/UserProfile/ProfileSurface';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { absoluteFill: { position: 'absolute' } },
  Modal: 'NativeModal',
}));
jest.mock('react-native-modal', () => 'AnimatedModal');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

it('keeps Android profiles in the activity window and handles the back button', () => {
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ProfileSurface visible onClose={close}>profile</ProfileSurface>); });
  expect(tree.root.findAllByType('NativeModal' as any)).toHaveLength(0);
  const surface = tree.root.findByType('AnimatedModal' as any);
  expect(surface.props.coverScreen).toBe(false);
  expect(surface.props.isVisible).toBe(true);
  expect(surface.props.style[1]).toMatchObject({ top: -24, bottom: -16, margin: 0 });
  act(() => surface.props.onBackButtonPress());
  expect(close).toHaveBeenCalledTimes(1);
  act(() => { tree.update(<ProfileSurface visible={false} onClose={close}>profile</ProfileSurface>); });
  expect(tree.root.findByType('AnimatedModal' as any).props.isVisible).toBe(false);
  act(() => tree.unmount());
});

it('preserves the native fullscreen presentation on iOS', () => {
  const previousOS = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const close = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<ProfileSurface visible onClose={close}>profile</ProfileSurface>); });
  expect(tree.root.findAllByType('AnimatedModal' as any)).toHaveLength(0);
  const surface = tree.root.findByType('NativeModal' as any);
  expect(surface.props.presentationStyle).toBe('fullScreen');
  act(() => surface.props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  Object.defineProperty(Platform, 'OS', { configurable: true, value: previousOS });
});
