import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
let mockSignedIn = true;
let mockConnected = true;
let mockEpoch = 1;
const mockEmit = jest.fn();
const mockIsConnected = () => mockConnected;
const mockDisconnect = jest.fn();
const mockAnonEmit = jest.fn();
let mockConnect: () => void;
let mockReceiveCount: (data: any) => void;
const mockOn = jest.fn((_event: string, listener: (data: any) => void) => { mockReceiveCount = listener; return jest.fn(); });
jest.mock('socket.io-client', () => ({ io: () => ({
  on: (event: string, listener: () => void) => { if (event === 'connect') mockConnect = listener; }, emit: mockAnonEmit, disconnect: mockDisconnect,
}) }));
jest.mock('../../config/env', () => ({ __esModule: true, default: { WEBSOCKET_URL: 'https://example.test' } }));
jest.mock('../../context/AuthContext', () => ({ useAuthState: () => ({ isSignedIn: mockSignedIn }) }));
jest.mock('../../context/WebSocketContext', () => ({ useWebSocket: () => ({
  emitAuthed: mockEmit, isCoreConnected: mockIsConnected, coreConnected: mockConnected, connectionEpoch: mockEpoch,
  on: mockOn,
}) }));
import { useStreamPresence } from '../../hooks/useStreamPresence';
let stateChanged: (state: AppStateStatus) => void;
beforeEach(() => {
  mockSignedIn = true; mockConnected = true; mockEpoch++; jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    stateChanged = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('joins when preview playback starts and leaves on pause, background and unmount', () => {
  const hook = renderHook(({ watching }: { watching: boolean }) => useStreamPresence('live', watching), { initialProps: { watching: false } });
  expect(mockEmit).not.toHaveBeenCalled();
  hook.rerender({ watching: true });
  expect(mockEmit).toHaveBeenLastCalledWith('stream.join', { streamId: 'live' });
  act(() => stateChanged('background'));
  expect(mockEmit).toHaveBeenLastCalledWith('stream.left', { streamId: 'live' });
  act(() => stateChanged('active'));
  expect(mockEmit).toHaveBeenLastCalledWith('stream.join', { streamId: 'live' });
  hook.rerender({ watching: false });
  expect(mockEmit).toHaveBeenLastCalledWith('stream.left', { streamId: 'live' });
  hook.rerender({ watching: true });
  hook.unmount();
  expect(mockEmit).toHaveBeenLastCalledWith('stream.left', { streamId: 'live' });
});

it('counts a signed-out viewer only while their preview is playing', () => {
  mockSignedIn = false;
  const hook = renderHook(() => useStreamPresence('live', true));
  act(() => mockConnect());
  expect(mockAnonEmit).toHaveBeenCalledWith('stream.join.anon', { streamId: 'live' });
  expect(mockEmit).not.toHaveBeenCalled();
  hook.unmount();
  expect(mockDisconnect).toHaveBeenCalledTimes(1);
});

it('forwards counts only for the playing stream so feed peaks update live', () => {
  const receive = jest.fn();
  renderHook(() => useStreamPresence('live', true, receive));
  act(() => mockReceiveCount({ streamId: 'other', viewerCount: 50 }));
  expect(receive).not.toHaveBeenCalled();
  act(() => mockReceiveCount({ streamId: 'live', viewerCount: 2 }));
  expect(receive).toHaveBeenCalledWith(2);
});
