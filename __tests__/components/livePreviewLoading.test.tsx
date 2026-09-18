import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LiveFeedPreview from '../../components/common/LiveFeedPreview';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', Switch: 'Switch',
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
}));

let mockStatus = 'loading';
const mockPlayer = { play: jest.fn(), status: 'loading' };
jest.mock('expo', () => ({ useEvent: () => ({ status: mockStatus }) }));
jest.mock('expo-video', () => ({
  useVideoPlayer: (_url: string, setup: (p: unknown) => void) => { setup(mockPlayer); return mockPlayer; },
  VideoView: (props: any) => require('react').createElement(require('react-native').View, { ...props, testID: 'live-video' }),
}));
jest.mock('../../components/DeHubLoader', () => ({
  DeHubLoader: () => require('react').createElement(require('react-native').View, { testID: 'live-loader' }),
}));
jest.mock('../../components/common/SmartImage', () => () => null);
jest.mock('../../components/ui/Icon', () => () => null);

describe('live preview loading feedback', () => {
  beforeEach(() => { mockStatus = 'loading'; });

  it('waits for a rendered frame, returns on buffering, and clears on error', () => {
    const view = render(<LiveFeedPreview url="https://example.com/live.m3u8" active />);
    expect(view.getByTestId('live-loader')).toBeTruthy();
    mockStatus = 'readyToPlay';
    fireEvent(view.getByTestId('live-video'), 'firstFrameRender');
    expect(view.queryByTestId('live-loader')).toBeNull();
    mockStatus = 'loading';
    view.rerender(<LiveFeedPreview url="https://example.com/live.m3u8" active label="Live" />);
    expect(view.getByTestId('live-loader')).toBeTruthy();
    mockStatus = 'error';
    view.rerender(<LiveFeedPreview url="https://example.com/live.m3u8" active label="Unavailable" />);
    expect(view.queryByTestId('live-loader')).toBeNull();
  });

  it('allocates no player or loader for an inactive card', () => {
    const view = render(<LiveFeedPreview url="https://example.com/live.m3u8" active={false} />);
    expect(view.queryByTestId('live-video')).toBeNull();
    expect(view.queryByTestId('live-loader')).toBeNull();
  });
});
