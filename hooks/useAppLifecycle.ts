/**
 * App Lifecycle Management Hook
 * 
 * Handles app state transitions (foreground/background/inactive) properly.
 * Big company apps handle these transitions gracefully to prevent crashes.
 * 
 * Features:
 * - Tracks app state changes
 * - Provides callbacks for state transitions
 * - Handles "cold start" vs "warm resume" detection
 * - Manages cleanup on background
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { createLogger } from '../libs/logger';

const logger = createLogger('AppLifecycle');

export type AppLifecycleState = 'active' | 'background' | 'inactive' | 'unknown';

export interface AppLifecycleCallbacks {
  /** Called when app comes to foreground from background */
  onForeground?: () => void;
  /** Called when app goes to background */
  onBackground?: () => void;
  /** Called when app becomes inactive (e.g., notification center pulled down) */
  onInactive?: () => void;
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

      // Transitioning TO background
      if (nextState === 'background' && prevState !== 'background') {
        backgroundTimestampRef.current = Date.now();
        hasBeenBackgroundedRef.current = true;
        setIsColdStart(false);
        
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
          setBackgroundDuration(duration);
          
          // Check if app was likely killed
          if (duration > LIKELY_KILLED_THRESHOLD_MS) {
            logger.info('App was likely killed by OS', { duration });
            setWasLikelyKilled(true);
          } else {
            setWasLikelyKilled(false);
          }
        }
        
        backgroundTimestampRef.current = null;
        
        try {
          callbacksRef.current?.onForeground?.();
        } catch (error) {
          logger.error('onForeground callback error', error);
        }
      }

      previousStateRef.current = nextState;
      setAppState(nextState as AppLifecycleState);
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
