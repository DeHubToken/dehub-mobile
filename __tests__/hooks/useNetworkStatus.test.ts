import { renderHook, act } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const mockAddEventListener = NetInfo.addEventListener as jest.Mock;
const mockFetch = NetInfo.fetch as jest.Mock;

describe('hooks/useNetworkStatus', () => {
  let subscriberCallback: ((state: any) => void) | null = null;
  const unsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    subscriberCallback = null;
    mockAddEventListener.mockImplementation((cb: any) => {
      subscriberCallback = cb;
      return unsubscribe;
    });
    mockFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  });

  it('starts with null connection state', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isConnected).toBeNull();
  });

  it('updates on NetInfo state change', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      subscriberCallback?.({ isConnected: true, isInternetReachable: true });
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(true);
    expect(result.current.hasInternet).toBe(true);
  });

  it('reports no internet when disconnected', async () => {
    mockFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      subscriberCallback?.({ isConnected: false, isInternetReachable: false });
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.hasInternet).toBe(false);
  });

  it('hasInternet is true when connected and reachable is null', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    await act(async () => {
      subscriberCallback?.({ isConnected: true, isInternetReachable: null });
    });

    // isConnected && (isInternetReachable !== false) → true
    expect(result.current.hasInternet).toBe(true);
  });

  it('checkConnection triggers manual fetch', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    mockFetch.mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });

    await act(async () => {
      await result.current.checkConnection();
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
