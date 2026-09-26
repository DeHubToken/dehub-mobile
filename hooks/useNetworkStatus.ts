import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * How long the device has to look offline before this hook says so.
 *
 * NetInfo reports the raw link state, and the raw link state flaps: a Wi-Fi to
 * cellular handoff, a lift, a tunnel, a train between masts all produce a
 * false for a second or two with a true immediately behind it. App.tsx used to
 * act on that instantly, and acting on it meant replacing the entire tree with
 * the offline screen — unmounting AuthProvider, the query cache provider, the
 * WebSocket clients and the whole navigator, losing scroll position, open
 * sheets, in-flight uploads and the nav stack, then rebuilding all of it when
 * the network came back two seconds later.
 *
 * Coming back online is applied immediately: there is no reason to make anyone
 * wait for good news.
 */
const OFFLINE_DEBOUNCE_MS = 4000;
const INITIAL_STATUS_WAIT_MS = 5000;

export const useNetworkStatus = () => {
  const [isReady, setIsReady] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(null);
  const hasDefiniteStatusRef = useRef(false);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOfflineTimer = useCallback(() => {
    if (offlineTimerRef.current) {
      clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
  }, []);

  /**
   * Commit a NetInfo reading. Anything that looks connected lands now; a
   * disconnection has to still be true after the debounce to count.
   */
  const apply = useCallback(
    (connected: boolean | null, reachable: boolean | null, immediate = false) => {
      const looksOffline = connected === false || reachable === false;
      const definite = connected !== null || reachable === false;
      // A transient unknown reading must not erase the last known status.
      if (!definite && hasDefiniteStatusRef.current) return;
      if (definite) {
        hasDefiniteStatusRef.current = true;
        setIsReady(true);
      }

      if (!looksOffline || immediate) {
        clearOfflineTimer();
        setIsConnected(connected);
        setIsInternetReachable(reachable);
        return;
      }

      // Already committed to offline — nothing to schedule.
      if (offlineTimerRef.current) return;
      offlineTimerRef.current = setTimeout(() => {
        offlineTimerRef.current = null;
        setIsConnected(connected);
        setIsInternetReachable(reachable);
      }, OFFLINE_DEBOUNCE_MS);
    },
    [clearOfflineTimer],
  );

  useEffect(() => {
    let mounted = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      const initialReading = !hasDefiniteStatusRef.current;
      apply(state.isConnected, state.isInternetReachable, initialReading);
    });

    // Unknown connectivity must not hold the logo forever. Only release the
    // boot gate: do not invent an online reading or discard a late real one.
    const initialTimer = setTimeout(() => {
      if (mounted) setIsReady(true);
    }, INITIAL_STATUS_WAIT_MS);

    void NetInfo.fetch().then(
      (state) => {
        if (!mounted || hasDefiniteStatusRef.current) return;
        apply(state.isConnected, state.isInternetReachable, true);
      },
      () => { /* The deadline above releases boot if NetInfo is unavailable. */ },
    );

    return () => {
      mounted = false;
      clearTimeout(initialTimer);
      clearOfflineTimer();
      unsubscribe();
    };
  }, [apply, clearOfflineTimer]);

  /** Manual retry from the offline screen — applied at once, both ways. */
  const checkConnection = useCallback(async () => {
    const state = await NetInfo.fetch();
    apply(state.isConnected, state.isInternetReachable, true);
  }, [apply]);

  return {
    isReady,
    isConnected,
    isInternetReachable,
    checkConnection,
    hasInternet: isConnected === false || isInternetReachable === false
      ? false
      : isConnected === true ? true : null,
  };
};
