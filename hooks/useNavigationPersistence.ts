/**
 * Navigation State Persistence Hook
 * 
 * Persists navigation state to AsyncStorage so users return to their
 * previous screen when reopening the app.
 * 
 * Features:
 * - Saves state on every navigation change
 * - Validates state before restoring (handles stale/invalid routes)
 * - Skips restoration for auth-gated screens when not authenticated
 * - Handles edge cases gracefully
 * - Debounces saves to prevent excessive writes
 * - Handles app killed scenarios safely
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavigationState, PartialState } from '@react-navigation/native';
import { createLogger } from '../libs/logger';

const logger = createLogger('NavigationPersistence');

const NAVIGATION_STATE_KEY = '@dhb_navigation_state';
const STATE_VERSION = 1; // Increment when navigation structure changes significantly

interface PersistedState {
  version: number;
  state: NavigationState;
  timestamp: number;
}

/** Maximum age of persisted state (24 hours) */
const MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000;

/** Screens that should not be restored (modals, transient screens) */
const NON_RESTORABLE_SCREENS = new Set([
  'SignIn',
  'Upload',
  'VideoPlayer',
  'LiveProducer',
  'LiveViewer',
  'ImageViewer',
]);

/** Screens that require authentication */
const AUTH_REQUIRED_SCREENS = new Set([
  'Dpay',
  'Notifications',
  'Chat',
  'AccountSettings',
  'YourVideos',
  'LikedVideos',
  'EditProfile',
  'LiveProducer',
  'DM',
]);

/**
 * Recursively checks if a navigation state contains only valid, restorable routes
 */
function isRestorableState(
  state: NavigationState | PartialState<NavigationState> | undefined,
  isAuthenticated: boolean
): boolean {
  if (!state || !state.routes || state.routes.length === 0) {
    return false;
  }

  // Check the current active route
  const activeIndex = state.index ?? state.routes.length - 1;
  const activeRoute = state.routes[activeIndex];

  if (!activeRoute?.name) {
    return false;
  }

  // Don't restore non-restorable screens
  if (NON_RESTORABLE_SCREENS.has(activeRoute.name)) {
    return false;
  }

  // Don't restore auth-required screens if not authenticated
  if (!isAuthenticated && AUTH_REQUIRED_SCREENS.has(activeRoute.name)) {
    return false;
  }

  // Recursively check nested navigators
  if (activeRoute.state) {
    return isRestorableState(activeRoute.state as NavigationState, isAuthenticated);
  }

  return true;
}

/**
 * Cleans the navigation state by removing non-restorable routes from the stack
 */
function cleanNavigationState(
  state: NavigationState,
  isAuthenticated: boolean
): NavigationState | undefined {
  if (!state.routes || state.routes.length === 0) {
    return undefined;
  }

  // Filter out non-restorable routes and auth-required routes if not authenticated
  const cleanedRoutes = state.routes
    .map((route) => {
      // Skip non-restorable screens
      if (NON_RESTORABLE_SCREENS.has(route.name)) {
        return null;
      }

      // Skip auth-required screens if not authenticated
      if (!isAuthenticated && AUTH_REQUIRED_SCREENS.has(route.name)) {
        return null;
      }

      // Recursively clean nested state
      if (route.state) {
        const cleanedNestedState = cleanNavigationState(
          route.state as NavigationState,
          isAuthenticated
        );
        return {
          ...route,
          state: cleanedNestedState,
        };
      }

      return route;
    })
    .filter((route): route is typeof state.routes[number] => route !== null);

  if (cleanedRoutes.length === 0) {
    return undefined;
  }

  // Adjust index if it's out of bounds
  let newIndex = state.index ?? cleanedRoutes.length - 1;
  if (newIndex >= cleanedRoutes.length) {
    newIndex = cleanedRoutes.length - 1;
  }

  return {
    ...state,
    routes: cleanedRoutes,
    index: newIndex,
  };
}

export interface UseNavigationPersistenceResult {
  /** Whether initial state has been loaded */
  isReady: boolean;
  /** The initial navigation state to restore, or undefined for fresh start */
  initialState: NavigationState | undefined;
  /** Callback to save navigation state on change */
  onStateChange: (state: NavigationState | undefined) => void;
}

/**
 * Hook for persisting and restoring navigation state
 * 
 * @param isAuthenticated - Whether the user is currently authenticated
 * @returns Object containing ready state, initial state, and state change handler
 * 
 * @example
 * ```tsx
 * const { isReady, initialState, onStateChange } = useNavigationPersistence(isSignedIn);
 * 
 * if (!isReady) return <SplashScreen />;
 * 
 * return (
 *   <NavigationContainer
 *     initialState={initialState}
 *     onStateChange={onStateChange}
 *   >
 *     ...
 *   </NavigationContainer>
 * );
 * ```
 */
export function useNavigationPersistence(
  isAuthenticated: boolean
): UseNavigationPersistenceResult {
  const [isReady, setIsReady] = useState(false);
  const [initialState, setInitialState] = useState<NavigationState | undefined>(undefined);

  // Load persisted state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const raw = await AsyncStorage.getItem(NAVIGATION_STATE_KEY);
        
        if (!raw) {
          logger.info('No persisted navigation state found');
          setIsReady(true);
          return;
        }

        const persisted: PersistedState = JSON.parse(raw);

        // Check version compatibility
        if (persisted.version !== STATE_VERSION) {
          logger.info('Persisted state version mismatch, starting fresh');
          await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
          setIsReady(true);
          return;
        }

        // Check if state is too old
        const age = Date.now() - persisted.timestamp;
        if (age > MAX_STATE_AGE_MS) {
          logger.info('Persisted state too old, starting fresh');
          await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
          setIsReady(true);
          return;
        }

        // Validate and clean the state
        if (!isRestorableState(persisted.state, isAuthenticated)) {
          logger.info('Persisted state not restorable, cleaning...');
          const cleaned = cleanNavigationState(persisted.state, isAuthenticated);
          if (cleaned && isRestorableState(cleaned, isAuthenticated)) {
            logger.info('Using cleaned navigation state');
            setInitialState(cleaned);
          } else {
            logger.info('Could not clean state, starting fresh');
          }
        } else {
          logger.info('Restoring navigation state');
          setInitialState(persisted.state);
        }
      } catch (error) {
        logger.error('Failed to load navigation state', error);
        // Clear potentially corrupted state
        try {
          await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
        } catch {}
      } finally {
        setIsReady(true);
      }
    };

    loadState();
  }, [isAuthenticated]);

  // Debounce ref to prevent excessive writes
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedStateRef = useRef<string | null>(null);

  // Save state on change with debouncing
  const onStateChange = useCallback((state: NavigationState | undefined) => {
    if (!state) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce saves to prevent excessive writes
    saveTimeoutRef.current = setTimeout(() => {
      const persistedState: PersistedState = {
        version: STATE_VERSION,
        state,
        timestamp: Date.now(),
      };

      const stateString = JSON.stringify(persistedState);
      
      // Don't save if state hasn't changed
      if (stateString === lastSavedStateRef.current) {
        return;
      }

      lastSavedStateRef.current = stateString;

      AsyncStorage.setItem(NAVIGATION_STATE_KEY, stateString).catch(
        (error) => {
          logger.error('Failed to persist navigation state', error);
        }
      );
    }, 500); // 500ms debounce
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isReady,
    initialState,
    onStateChange,
  };
}

/**
 * Clears persisted navigation state
 * Call this when user signs out to prevent restoring auth-gated screens
 */
export async function clearPersistedNavigationState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
    logger.info('Cleared persisted navigation state');
  } catch (error) {
    logger.error('Failed to clear navigation state', error);
  }
}
