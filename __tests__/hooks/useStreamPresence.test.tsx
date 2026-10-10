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
jest.mock('socket.io-client', () => ({ io: () => ({
  on: (_event: string, listener: () => void) => { mockConnect = listener; }, emit: mockAnonEmit, disconnect: mockDisconnect,
}) }));
jest.mock('../../config/env', () => ({ __esModule: true, default: { WEBSOCKET_URL: 'https://example.test' } }));
jest.mock('../../context/AuthContext', () => ({ useAuthState: () => ({ isSignedIn: mockSignedIn }) }));
jest.mock('../../context/WebSocketContext', () => ({ useWebSocket: () => ({
  emitAuthed: mockEmit, isCoreConnected: mockIsConnected, coreConnected: mockConnected, connectionEpoch: mockEpoch,
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
