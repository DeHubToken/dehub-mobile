import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavigationState } from '@react-navigation/native';
import { createLogger } from '../libs/logger';

const logger = createLogger('NavigationPersistence');
const NAVIGATION_STATE_KEY = '@dhb_navigation_state';
const onStateChange = (_state: NavigationState | undefined): void => {};

/**
 * A new process starts from the navigator's normal initial route. Backgrounding
 * keeps the mounted stack, and explicit launch links remain handled by linking.
 * Remove snapshots from older versions so they cannot revive a transient screen.
 */
export function useNavigationPersistence(_isAuthenticated: boolean) {
  useEffect(() => {
    void clearPersistedNavigationState();
  }, []);

  return {
    isReady: true,
    initialState: undefined,
    onStateChange,
  };
}

export async function clearPersistedNavigationState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
  } catch (error) {
    logger.error('Failed to clear navigation state', error);
  }
}
