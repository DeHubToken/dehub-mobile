
import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { createLogger } from '../libs/logger';

const logger = createLogger('AppLifecycle');

export type AppLifecycleState = 'active' | 'background' | 'inactive' | 'unknown';

export interface AppLifecycleCallbacks {
  /**
   * Called when app comes to foreground from background.
   *
   * The time spent in background is passed in rather than read from the hook's
   * `backgroundDuration` state: that state is set with `setState` immediately
   * before this fires, so a callback closing over it sees the *previous*
   * foreground's value, not this one.
   */
  onForeground?: (backgroundDurationMs: number) => void;
  /** Called when app goes to background */
  onBackground?: () => void;
  /** Called when app becomes inactive (e.g., notification center pulled down) */
  onInactive?: () => void;
  /**
   * Re-render the caller whenever lifecycle state changes, so the returned
   * `appState` / `backgroundDuration` / `wasLikelyKilled` stay live.
   *
   * Off by default. These transitions fire constantly — every notification
   * shade pull, control centre swipe and system dialog produces an
   * active→inactive→active round trip — and the only consumer today is the
   * root App component, which reads none of them. Leaving the state updates
   * on meant re-rendering the entire provider tree for each of those.
   */
  trackState?: boolean;
}

export interface UseAppLifecycleResult {
  /** Current app state */
  appState: AppLifecycleState;
  /** Whether this is a fresh app start (not a resume) */
  isColdStart: boolean;
  /** Time spent in background (ms), 0 if never backgrounded */
  backgroundDuration: number;
  /** Whether app was likely killed and restarted by OS */
  wasLikelyKilled: boolean;
}

/** Threshold to consider app was likely killed by OS (5 minutes) */
const LIKELY_KILLED_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Hook to manage app lifecycle transitions
 * 
 * @param callbacks - Optional callbacks for state transitions
 * @returns Current lifecycle state and metadata
 */
export function useAppLifecycle(callbacks?: AppLifecycleCallbacks): UseAppLifecycleResult {
  const [appState, setAppState] = useState<AppLifecycleState>(
    AppState.currentState as AppLifecycleState || 'unknown'
  );
  const [isColdStart, setIsColdStart] = useState(true);
  const [backgroundDuration, setBackgroundDuration] = useState(0);
  const [wasLikelyKilled, setWasLikelyKilled] = useState(false);

  const previousStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundTimestampRef = useRef<number | null>(null);
  const hasBeenBackgroundedRef = useRef(false);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prevState = previousStateRef.current;
      
      logger.debug('App state change', { from: prevState, to: nextState });

      const trackState = callbacksRef.current?.trackState ?? false;

      // Transitioning TO background
      if (nextState === 'background' && prevState !== 'background') {
        backgroundTimestampRef.current = Date.now();
        hasBeenBackgroundedRef.current = true;
        if (trackState) setIsColdStart(false);
        
        try {
          callbacksRef.current?.onBackground?.();
        } catch (error) {
          logger.error('onBackground callback error', error);
        }
      }

      // Transitioning TO inactive
      if (nextState === 'inactive' && prevState === 'active') {
        try {
          callbacksRef.current?.onInactive?.();
        } catch (error) {
          logger.error('onInactive callback error', error);
        }
      }

      // Transitioning TO foreground (active)
      if (nextState === 'active' && prevState !== 'active') {
        const bgTimestamp = backgroundTimestampRef.current;
        let duration = 0;
        
        if (bgTimestamp) {
          duration = Date.now() - bgTimestamp;

          // Check if app was likely killed
          const likelyKilled = duration > LIKELY_KILLED_THRESHOLD_MS;
          if (likelyKilled) logger.info('App was likely killed by OS', { duration });

          if (trackState) {
            setBackgroundDuration(duration);
            setWasLikelyKilled(likelyKilled);
          }
        }
        
        backgroundTimestampRef.current = null;
        
        try {
          callbacksRef.current?.onForeground?.(duration);
        } catch (error) {
          logger.error('onForeground callback error', error);
        }
      }

      previousStateRef.current = nextState;
      if (trackState) setAppState(nextState as AppLifecycleState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    appState,
    isColdStart,
    backgroundDuration,
    wasLikelyKilled,
  };
}

/**
 * Simple hook that just returns whether the app is in foreground
 */
export function useIsForeground(): boolean {
  const [isForeground, setIsForeground] = useState(
    AppState.currentState === 'active'
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsForeground(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  return isForeground;
}
