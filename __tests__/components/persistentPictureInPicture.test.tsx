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

const mockStart = jest.fn().mockResolvedValue(undefined);
let mockHostStop: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ addListener: () => () => {} }) }));
jest.mock('../../libs/audioSession', () => ({
  configureForBackgroundPlayback: jest.fn().mockResolvedValue(undefined),
  releaseBackgroundPlayback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-video', () => {
  const React = require('react');
  return { VideoView: React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ startPictureInPicture: mockStart }));
    if (props.startsPictureInPictureAutomatically === false) mockHostStop = props.onPictureInPictureStop;
    return null;
  }) };
});

afterEach(() => { setPictureInPicturePlayer(null); jest.restoreAllMocks(); });

it('keeps the root PiP view and player after the source route unmounts', async () => {
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0; });
  const player = {} as any;
  const ref = createRef<VideoView>();
  const ui = render(<><PersistentVideoView ref={ref} player={player} allowsPictureInPicture /><PictureInPictureHost /></>);
  let starting: Promise<void>;
  await act(async () => { starting = ref.current!.startPictureInPicture(); await Promise.resolve(); });
  await act(async () => { await starting!; });
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(getPictureInPicturePlayer()).toBe(player);
  ui.rerender(<PictureInPictureHost />);
  expect(getPictureInPicturePlayer()).toBe(player);
  act(() => mockHostStop?.());
  expect(getPictureInPicturePlayer()).toBeNull();
});
