import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import LiveFeedPreview from '../../components/common/LiveFeedPreview';
import { visualActivity } from '../../libs/visualActivity';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', Switch: 'Switch',
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
}));

let mockStatus = 'loading';
const mockPlayingListeners = new Set<() => void>();
const mockPlayer = {
  play: jest.fn(), pause: jest.fn(), release: jest.fn(), status: 'loading',
  addListener: jest.fn((_event: string, listener: () => void) => {
    mockPlayingListeners.add(listener);
    return { remove: () => mockPlayingListeners.delete(listener) };
  }),
};
jest.mock('expo', () => ({ useEvent: () => ({ status: mockStatus }) }));
jest.mock('expo-video', () => ({
  useVideoPlayer: (_url: string, setup: (p: unknown) => void) => { setup(mockPlayer); return mockPlayer; },
  createVideoPlayer: () => mockPlayer,
  VideoView: (props: any) => require('react').createElement(require('react-native').View, { ...props, testID: 'live-video' }),
}));
jest.mock('@react-navigation/native', () => ({ NavigationContext: require('react').createContext(undefined) }));
jest.mock('../../components/DeHubLoader', () => ({
  DeHubLoader: () => require('react').createElement(require('react-native').View, { testID: 'live-loader' }),
}));
jest.mock('../../components/common/SmartImage', () => () => null);
jest.mock('../../components/ui/Icon', () => () => null);
jest.mock('../../hooks/useStreamPresence', () => ({ useStreamPresence: jest.fn() }));
jest.mock('../../hooks/useLivePaused', () => ({ useLivePaused: (_id: string, status: string) => status === 'PAUSED' }));

describe('live preview loading feedback', () => {
  beforeEach(() => { jest.useFakeTimers(); mockStatus = 'loading'; });
  afterEach(() => {
    act(() => { visualActivity.setCall(false, false); jest.advanceTimersByTime(250); });
    jest.useRealTimers();
  });

  it('waits for a rendered frame, returns on buffering, and clears on error', () => {
    const view = render(<LiveFeedPreview url="https://example.com/live.m3u8" active />);
    expect(view.queryByTestId('live-video')).toBeNull();
    act(() => jest.advanceTimersByTime(400));
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

  it('shows the paused state instead of spinning when the broadcaster is paused', () => {
    const view = render(<LiveFeedPreview url="https://example.com/live.m3u8" streamStatus="PAUSED" active />);
    act(() => jest.advanceTimersByTime(400));
    expect(view.queryByTestId('live-loader')).toBeNull();
    expect(view.getByText('liveViewer.streamPaused')).toBeTruthy();
  });

  it('replaces an unbounded loading animation with a waiting message', () => {
    const view = render(<LiveFeedPreview url="https://example.com/live.m3u8" active />);
    act(() => jest.advanceTimersByTime(400));
    act(() => jest.advanceTimersByTime(12_000));
    expect(view.queryByTestId('live-loader')).toBeNull();
    expect(view.getByText('liveViewer.waitingForVideo')).toBeTruthy();
    mockStatus = 'readyToPlay';
    fireEvent(view.getByTestId('live-video'), 'firstFrameRender');
    expect(view.queryByText('liveViewer.waitingForVideo')).toBeNull();
  });

  it('pauses for a call and rejects a late native playing event until the call ends', () => {
    const view = render(<LiveFeedPreview url="https://example.com/live.m3u8" active />);
    act(() => jest.advanceTimersByTime(400));
    expect(view.getByTestId('live-video')).toBeTruthy();
    mockPlayer.pause.mockClear();
    act(() => visualActivity.setCall(true, true));
    expect(mockPlayer.pause).toHaveBeenCalled();
    mockPlayer.pause.mockClear();
    act(() => { mockPlayingListeners.forEach(listener => listener()); });
    expect(mockPlayer.pause).toHaveBeenCalled();
    mockPlayer.play.mockClear();
    act(() => { visualActivity.setCall(false, false); jest.advanceTimersByTime(250); });
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  it('does not allocate for a live row passed during a fling', () => {
    const view = render(<LiveFeedPreview url="https://example.com/live.m3u8" active />);
    act(() => jest.advanceTimersByTime(200));
    view.rerender(<LiveFeedPreview url="https://example.com/live.m3u8" active={false} />);
    act(() => jest.advanceTimersByTime(1000));
    expect(view.queryByTestId('live-video')).toBeNull();
    expect(view.queryByTestId('live-loader')).toBeNull();
    view.rerender(<LiveFeedPreview url="https://example.com/live.m3u8" active />);
    act(() => jest.advanceTimersByTime(400));
    expect(view.getByTestId('live-video')).toBeTruthy();
  });
});
