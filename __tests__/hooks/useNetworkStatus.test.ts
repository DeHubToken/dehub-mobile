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

  afterEach(() => {
    jest.useRealTimers();
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

    // The initial fetch is applied immediately in both directions — a cold
    // start with no network should not sit on the splash for the debounce.
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

  // ── Offline debounce ──────────────────────────────────────────────────────
  //
  // App.tsx renders the offline screen over the app when hasInternet goes
  // false. It used to return that screen INSTEAD of the app, which unmounted
  // every provider and the whole navigator — so a one-second radio drop cost
  // the user their scroll position, any open sheet and any upload in flight.
  // The overlay fixed the cost; this debounce stops it triggering at all for
  // the drops that resolve themselves.
  describe('offline debounce', () => {
    /** Render, then let the initial NetInfo.fetch settle. */
    const renderSettled = async () => {
      const hook = renderHook(() => useNetworkStatus());
      await act(async () => {
        await Promise.resolve();
      });
      return hook;
    };

    it('ignores a drop shorter than the debounce', async () => {
      jest.useFakeTimers();
      const { result } = await renderSettled();

      act(() => {
        subscriberCallback?.({ isConnected: false, isInternetReachable: false });
        jest.advanceTimersByTime(1500);
      });
      expect(result.current.hasInternet).toBe(true);

      act(() => {
        subscriberCallback?.({ isConnected: true, isInternetReachable: true });
        jest.advanceTimersByTime(10_000);
      });
      expect(result.current.hasInternet).toBe(true);
    });

    it('commits to offline once the drop outlasts the debounce', async () => {
      jest.useFakeTimers();
      const { result } = await renderSettled();

      act(() => {
        subscriberCallback?.({ isConnected: false, isInternetReachable: false });
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.hasInternet).toBe(false);
    });

    it('comes back online with no delay', async () => {
      jest.useFakeTimers();
      const { result } = await renderSettled();

      act(() => {
        subscriberCallback?.({ isConnected: false, isInternetReachable: false });
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.hasInternet).toBe(false);

      // Good news is never debounced: the overlay lifts on the same tick.
      act(() => {
        subscriberCallback?.({ isConnected: true, isInternetReachable: true });
      });
      expect(result.current.hasInternet).toBe(true);
    });

    it('clears a pending drop on unmount', async () => {
      jest.useFakeTimers();
      const { unmount } = await renderSettled();

      act(() => {
        subscriberCallback?.({ isConnected: false, isInternetReachable: false });
      });
      unmount();

      // No setState-after-unmount when the debounce would have fired.
      expect(() => jest.advanceTimersByTime(10_000)).not.toThrow();
    });
  });
});
