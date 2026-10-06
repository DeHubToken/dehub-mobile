import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
let mockFocused = true;
let mockReconnect: (() => void) | undefined;
const mockDisconnect = jest.fn();
const mockOnReconnect = jest.fn((listener: () => void) => { mockReconnect = listener; return mockDisconnect; });
jest.mock('../../context/WebSocketContext', () => ({ useWebSocketApi: () => ({ onDmReconnect: mockOnReconnect }) }));
jest.mock('../../hooks/useFocusedInterval', () => ({ useIsScreenFocused: () => mockFocused }));
import { useDmHeadRecovery } from '../../hooks/useDmHeadRecovery';

let foreground: (state: string) => void;
beforeEach(() => {
  mockFocused = true;
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active', writable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    foreground = handler;
    return { remove: jest.fn() };
  });
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('coalesces open, foreground and reconnect while a recovery is pending', async () => {
  let done!: () => void;
  const refresh = jest.fn(() => new Promise<void>(resolve => { done = resolve; }));
  const { unmount } = renderHook(() => useDmHeadRecovery(refresh, true));
  await act(async () => { foreground('active'); mockReconnect?.(); });
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => { done(); });
  await act(async () => { mockReconnect?.(); });
  expect(refresh).toHaveBeenCalledTimes(2);
  unmount();
  expect(mockDisconnect).toHaveBeenCalled();
});

it('recovers on focus and ignores reconnects while the app is in the background', async () => {
  mockFocused = false;
  const refresh = jest.fn(async () => {});
  const { rerender } = renderHook(() => useDmHeadRecovery(refresh, true));
  expect(refresh).not.toHaveBeenCalled();
  mockFocused = true;
  await act(async () => { rerender({}); });
  expect(refresh).toHaveBeenCalledTimes(1);
  AppState.currentState = 'background';
  await act(async () => { mockReconnect?.(); });
  expect(refresh).toHaveBeenCalledTimes(1);
  AppState.currentState = 'active';
  await act(async () => { foreground('active'); });
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('invalidates a response after the thread is closed or replaced', () => {
  let current!: () => boolean;
  const refresh = jest.fn((isCurrent: () => boolean) => {
    current = isCurrent;
    return new Promise<void>(() => {});
  });
  const { unmount } = renderHook(() => useDmHeadRecovery(refresh, true));
  expect(current()).toBe(true);
  unmount();
  expect(current()).toBe(false);
});
