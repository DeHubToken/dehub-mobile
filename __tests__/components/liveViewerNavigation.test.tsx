import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LiveViewerScreen from '../../screens/LiveViewerScreen';

let mockParams: { streamId: string };
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', StatusBar: 'StatusBar',
  Platform: { OS: 'android' }, StyleSheet: { flatten: (style: unknown) => style },
}));
jest.mock('@react-navigation/native', () => ({ useRoute: () => ({ params: mockParams }) }));
jest.mock('../../components/VideoPlayer/LiveStreamPlayer', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return function Player() {
    const [ended, setEnded] = React.useState(false);
    return <Pressable onPress={() => setEnded(true)}><Text>{ended ? 'Ended' : 'Live'}</Text></Pressable>;
  };
});

it('keeps the same stream state but resets it when navigation opens another stream', () => {
  mockParams = { streamId: 'first' };
  const screen = render(<LiveViewerScreen />);
  fireEvent.press(screen.getByText('Live'));
  screen.rerender(<LiveViewerScreen />);
  expect(screen.getByText('Ended')).toBeTruthy();

  mockParams = { streamId: 'second' };
  screen.rerender(<LiveViewerScreen />);
  expect(screen.getByText('Live')).toBeTruthy();
  expect(screen.queryByText('Ended')).toBeNull();
});
