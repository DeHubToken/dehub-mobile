import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MotionClipPlayer from '../../components/Assistant/MotionClipPlayer';
import { FEED_BUFFER_OPTIONS } from '../../libs/videoBuffering';

const mockPlayers = new Set<any>();
jest.mock('expo-video', () => ({
  VideoView: require('react-native').View,
  useVideoPlayer: (_source: string, setup: (player: any) => void) => {
    const React = require('react');
    const [player] = React.useState(() => {
      const instance = { muted: false, playing: false, currentTime: 0, play: jest.fn(), pause: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) };
      setup(instance);
      return instance;
    });
    React.useEffect(() => { mockPlayers.add(player); return () => { mockPlayers.delete(player); }; }, [player]);
    return player;
  },
}));
jest.mock('@react-native-community/slider', () => require('react-native').View);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it('allocates the capped original only for comparison and releases players on close', () => {
  const clip = { url: 'https://media.test/original.mp4', variants: [{ url: 'https://media.test/result.mp4' }] } as any;
  const screen = render(<MotionClipPlayer clip={clip} width={300} />);
  expect(mockPlayers.size).toBe(1);
  fireEvent.press(screen.getByRole('button', { name: 'motionLibrary.compare' }));
  expect(mockPlayers.size).toBe(2);
  for (const player of mockPlayers) expect(player.bufferOptions).toEqual(FEED_BUFFER_OPTIONS);
  fireEvent.press(screen.getByRole('button', { name: 'motionLibrary.original' }));
  expect(mockPlayers.size).toBe(1);
  screen.unmount();
  expect(mockPlayers.size).toBe(0);
});
