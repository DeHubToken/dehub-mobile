import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LiveViewerScreen from '../../screens/LiveViewerScreen';

let mockParams: { streamId?: string; tokenId?: number };
const mockGetNFT = jest.fn();
jest.mock('../../services/nft.service', () => ({ getNFT: (...args: unknown[]) => mockGetNFT(...args) }));
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', StatusBar: 'StatusBar',
  ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'android' }, StyleSheet: { flatten: (style: unknown) => style },
}));
jest.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: mockParams }) }));
jest.mock('../../context/ThemeContext', () => ({ useDarkSurface: () => true }));
jest.mock('../../components/VideoPlayer/LiveStreamPlayer', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return function Player({ streamId }: { streamId?: string }) {
    const [ended, setEnded] = React.useState(false);
    return <Pressable onPress={() => setEnded(true)}><Text>{ended ? 'Ended' : `Live ${streamId ?? ''}`.trim()}</Text></Pressable>;
  };
});

it('keeps the same stream state but resets it when navigation opens another stream', () => {
  mockParams = { streamId: 'first' };
  const screen = render(<LiveViewerScreen />);
  fireEvent.press(screen.getByText(/^Live/));
  screen.rerender(<LiveViewerScreen />);
  expect(screen.getByText('Ended')).toBeTruthy();

  mockParams = { streamId: 'second' };
  screen.rerender(<LiveViewerScreen />);
  expect(screen.getByText(/^Live/)).toBeTruthy();
  expect(screen.queryByText('Ended')).toBeNull();
});

it('opens the stream behind a post when a notification only knows the post', async () => {
  mockGetNFT.mockResolvedValue({ result: { tokenId: 6988, stream: { _id: '6ae1295ac8079cd2f39287a7' } } });
  mockParams = { tokenId: 6988 };
  const screen = render(<LiveViewerScreen />);
  expect(mockGetNFT).toHaveBeenCalledWith(6988);
  expect(await screen.findByText('Live 6ae1295ac8079cd2f39287a7')).toBeTruthy();
});
