import React, { createRef } from 'react';
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Switch: 'Switch', ScrollView: 'ScrollView', Modal: 'Modal',
  StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: unknown) => styles },
}));
import { act, render } from '@testing-library/react-native';
import { VideoView } from 'expo-video';
import { PersistentVideoView, PictureInPictureHost } from '../../components/common/PersistentVideoView';
import { getPictureInPicturePlayer, setPictureInPicturePlayer } from '../../libs/pictureInPicture';

const mockStart = jest.fn();
const mockStop = jest.fn();
let mockHost: any;
let mockInline: any;
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ addListener: () => () => {} }) }));
jest.mock('../../libs/audioSession', () => ({
  configureForBackgroundPlayback: jest.fn().mockResolvedValue(undefined),
  releaseBackgroundPlayback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-video', () => {
  const React = require('react');
  return { VideoView: React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ startPictureInPicture: mockStart, stopPictureInPicture: mockStop }));
    if (props.startsPictureInPictureAutomatically === false) mockHost = props;
    else mockInline = props;
    return null;
  }) };
});

beforeEach(() => {
  jest.useFakeTimers();
  mockStart.mockReset().mockResolvedValue(undefined);
  mockStop.mockReset().mockResolvedValue(undefined);
  mockHost = undefined;
});
afterEach(() => {
  act(() => mockHost?.onPictureInPictureStop());
  setPictureInPicturePlayer(null);
  jest.useRealTimers();
});

async function begin() {
  const player = { staysActiveInBackground: false, showNowPlayingNotification: false } as any;
  const ref = createRef<VideoView>();
  const ui = render(<><PersistentVideoView ref={ref} player={player} allowsPictureInPicture /><PictureInPictureHost /></>);
  let starting!: Promise<void>;
  await act(async () => { starting = ref.current!.startPictureInPicture(); });
  return { player, ref, ui, starting };
}

async function renderHost() {
  await act(async () => {
    mockHost.onLayout({ nativeEvent: { layout: { width: 280, height: 158 } } });
    mockHost.onFirstFrameRender();
  });
}

it('waits for a laid-out video frame and actual OS confirmation, then survives navigation', async () => {
  const { player, ui, starting } = await begin();
  expect(mockStart).not.toHaveBeenCalled();
  await act(async () => { mockHost.onFirstFrameRender(); });
  expect(mockStart).not.toHaveBeenCalled();
  await renderHost();
  expect(mockStart).toHaveBeenCalledTimes(1);
  let confirmed = false;
  void starting.then(() => { confirmed = true; });
  await act(async () => {});
  expect(confirmed).toBe(false);
  await act(async () => { mockHost.onPictureInPictureStart(); await starting; });
  expect(mockHost.style).toContainEqual({ opacity: 0 });
  expect(getPictureInPicturePlayer()).toBe(player);
  ui.rerender(<PictureInPictureHost />);
  expect(getPictureInPicturePlayer()).toBe(player);
  act(() => mockHost.onPictureInPictureStop());
  expect(getPictureInPicturePlayer()).toBeNull();
  expect(player.staysActiveInBackground).toBe(false);
});

it('removes the inert host when native start resolves without opening PiP', async () => {
  const { player, starting } = await begin();
  await renderHost();
  const rejected = expect(starting).rejects.toThrow('Picture-in-picture did not start');
  await act(async () => { jest.advanceTimersByTime(5000); await rejected; });
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(getPictureInPicturePlayer()).toBeNull();
  expect(player.staysActiveInBackground).toBe(false);
  expect(player.showNowPlayingNotification).toBe(false);
  expect(mockInline.player).toBe(player);
});

it('does not enter PiP if the first frame arrives after the startup deadline', async () => {
  const { starting } = await begin();
  const rejected = expect(starting).rejects.toThrow('Picture-in-picture did not start');
  await act(async () => { jest.advanceTimersByTime(5000); await rejected; });
  await renderHost();
  expect(mockStart).not.toHaveBeenCalled();
  expect(getPictureInPicturePlayer()).toBeNull();
});

it('coalesces repeated taps and ignores the outgoing inline stop event', async () => {
  const { player, ref, starting } = await begin();
  expect(ref.current!.startPictureInPicture()).toBe(starting);
  act(() => mockInline.onPictureInPictureStop());
  expect(getPictureInPicturePlayer()).toBe(player);
  await renderHost();
  await act(async () => { mockHost.onPictureInPictureStart(); await starting; });
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it('restores the inline player when native PiP rejects', async () => {
  const { player, starting } = await begin();
  mockStart.mockRejectedValueOnce(new Error('Unavailable'));
  const rejected = expect(starting).rejects.toThrow('Unavailable');
  await renderHost();
  await act(async () => { await rejected; });
  expect(getPictureInPicturePlayer()).toBeNull();
  expect(mockInline.player).toBe(player);
});
