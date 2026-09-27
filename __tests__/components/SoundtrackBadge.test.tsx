import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import SoundtrackBadge from '../../components/Post/SoundtrackBadge';
import { requestAudioFocus, revokeAudioFocus } from '../../libs/audioFocus';
import { configureForDuckedPlayback } from '../../libs/audioSession';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
  TouchableOpacity: (props: any) => require('react').createElement('View', { ...props, accessible: true }),
  StyleSheet: { create: (styles: any) => styles, flatten: (styles: any) => styles },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
}));

let mockStatus: (status: any) => void;
const mockPlayer = {
  loop: false,
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  addListener: jest.fn((_event, listener) => { mockStatus = listener; return { remove: jest.fn() }; }),
};
jest.mock('expo-audio', () => ({ useAudioPlayer: () => mockPlayer }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../libs/audioSession', () => ({ configureForDuckedPlayback: jest.fn(() => Promise.resolve()) }));

const props = { title: 'Song', creator: 'Artist', url: 'https://example.com/song.mp3' };
const press = (view: ReturnType<typeof render>) => fireEvent.press(view.getByRole('button'), { stopPropagation: jest.fn() });

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => { act(() => revokeAudioFocus()); jest.useRealTimers(); });

it('loads on tap and waits for native playback confirmation', async () => {
  const view = render(<SoundtrackBadge {...props} />);
  expect(mockPlayer.replace).not.toHaveBeenCalled();
  await act(async () => press(view));
  expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: props.url });
  expect(view.getByText('common.loading')).toBeTruthy();
  act(() => mockStatus({ isLoaded: true, isBuffering: false, playing: true }));
  expect(view.getByText('audioPost.pause')).toBeTruthy();
  view.unmount();
});

it('cancels a pending setup when another source takes audio focus', async () => {
  let resolve!: () => void;
  jest.mocked(configureForDuckedPlayback).mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const view = render(<SoundtrackBadge {...props} />);
  act(() => press(view));
  act(() => requestAudioFocus(() => {}));
  await act(async () => resolve());
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(view.getByText('audioPost.play')).toBeTruthy();
  view.unmount();
});

it('stops offscreen and never auto-resumes on return', async () => {
  const view = render(<SoundtrackBadge {...props} />);
  await act(async () => press(view));
  view.rerender(<SoundtrackBadge {...props} isVisible={false} />);
  expect(view.getByText('audioPost.play')).toBeTruthy();
  view.rerender(<SoundtrackBadge {...props} isVisible />);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('offers retry when loading never completes', async () => {
  const view = render(<SoundtrackBadge {...props} />);
  await act(async () => press(view));
  act(() => jest.advanceTimersByTime(15000));
  expect(view.getByText('common.retry')).toBeTruthy();
  await act(async () => press(view));
  expect(mockPlayer.replace).toHaveBeenCalledTimes(2);
  view.unmount();
});
