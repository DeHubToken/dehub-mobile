import { act, cleanup, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
let mockOptIn = false;
const mockTrack = jest.fn();
const mockRemove = jest.fn();
const mockChannel = jest.fn(() => {
  const channel = {
    on: () => channel,
    track: mockTrack,
    subscribe: (listener: (status: string) => void) => { listener('SUBSCRIBED'); return channel; },
  };
  return channel;
});
jest.mock('../../services/supabase', () => ({ supabase: { channel: mockChannel, removeChannel: mockRemove } }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ walletAddress: 'ALICE', customs: { showOnline: mockOptIn ? 'on' : 'off' } }) }));
import { useOnlinePresence } from '../../hooks/useOnlinePresence';
import { useIsOnline } from '../../libs/online-presence';

let stateChanged: (state: AppStateStatus) => void;
beforeEach(() => {
  mockOptIn = false; jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active', writable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    stateChanged = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it('opens no channel with no opt-in or focused readers', () => {
  renderHook(useOnlinePresence);
  expect(mockChannel).not.toHaveBeenCalled();
});

it('reads without publishing while a focused dot needs presence', () => {
  renderHook(useOnlinePresence);
  const reader = renderHook(({ focused }) => useIsOnline('bob', focused), { initialProps: { focused: true } });
  expect(mockChannel).toHaveBeenCalledTimes(1);
  expect(mockTrack).not.toHaveBeenCalled();
  reader.rerender({ focused: false });
  expect(mockRemove).toHaveBeenCalledTimes(1);
});

it('publishes opt-in without readers and leaves when backgrounded', () => {
  mockOptIn = true;
  renderHook(useOnlinePresence);
  expect(mockTrack).toHaveBeenCalledTimes(1);
  act(() => stateChanged('background'));
  expect(mockRemove).toHaveBeenCalledTimes(1);
  act(() => stateChanged('active'));
  expect(mockTrack).toHaveBeenCalledTimes(2);
});
