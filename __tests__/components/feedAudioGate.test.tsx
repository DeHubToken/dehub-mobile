import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { View, Pressable } from 'react-native';
import FeedAudioContent from '../../components/Home/FeedAudioContent';
import FeedGatePreview from '../../components/Home/FeedGatePreview';

jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('../../components/common/SmartImage', () => ({ __esModule: true,
  default: (props: any) => require('react').createElement(require('react-native').View, { ...props, testID: 'cover-image' }),
}));

it('a coverless locked post shows its unlock action and never mounts the audio loader', () => {
  const load = jest.fn();
  const unlock = jest.fn();
  function Player() { load(); return <View testID="audio-player" />; }
  const cover = <Pressable testID="unlock" onPress={unlock}><FeedGatePreview priority="normal" /></Pressable>;
  const screen = render(<FeedAudioContent gated cover={cover}><Player /></FeedAudioContent>);
  expect(screen.queryByTestId('audio-player')).toBeNull();
  expect(screen.queryByTestId('cover-image')).toBeNull();
  expect(load).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('unlock'));
  expect(unlock).toHaveBeenCalledTimes(1);
  screen.rerender(<FeedAudioContent gated={false} cover={null}><Player /></FeedAudioContent>);
  expect(screen.getByTestId('audio-player')).toBeTruthy();
});

it('a supplied public preview remains visible without mounting the paid player', () => {
  const screen = render(<FeedAudioContent gated cover={<FeedGatePreview uri="https://example.test/preview.jpg" priority="normal" />}>
    <View testID="audio-player" />
  </FeedAudioContent>);
  expect(screen.getByTestId('cover-image')).toBeTruthy();
  expect(screen.queryByTestId('audio-player')).toBeNull();
  fireEvent(screen.getByTestId('cover-image'), 'error');
  expect(screen.queryByTestId('cover-image')).toBeNull();
});
