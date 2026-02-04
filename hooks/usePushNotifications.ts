/**
 * Push Notifications Hook
 * 
 * Handles the complete push notification lifecycle:
 * - Permission requests and token registration
 * - Notification listeners (foreground & response)
 * - Token refresh handling
 * - Cleanup on logout
 * 
 * NOTE: Navigation from notification taps is handled globally by PushNotificationsProvider.
 * This hook is for registration/status only.
 * 
 * Usage: Call usePushNotifications() in components that need push notification status.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { useUser, useAuthState } from '../context/AuthContext';
import {
  registerForPushNotifications,
  registerPushTokenWithBackend,
  clearBadge,
  type NotificationData,
} from '../services/push/push.service';
import { createLogger } from '../libs/logger';

const logger = createLogger('usePushNotifications');

// =============================================================================
// Types
// =============================================================================

interface UsePushNotificationsOptions {
  /** Whether to auto-register on mount (default: true) */
  autoRegister?: boolean;
  /** Callback when notification received in foreground */
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  /** Callback when user taps notification */
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void;
}

interface UsePushNotificationsReturn {
  /** Current push token (null if not registered) */
  pushToken: string | null;
  /** Whether push notifications are enabled */
  isEnabled: boolean;
  /** Whether registration is in progress */
  isRegistering: boolean;
  /** Manually trigger registration */
  register: () => Promise<string | null>;
  /** Last notification received */
  lastNotification: Notifications.Notification | null;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function usePushNotifications(
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsReturn {
  const { autoRegister = true, onNotificationReceived, onNotificationResponse } = options;
  
  const user = useUser();
  const { isSignedIn } = useAuthState();
  
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastNotification, setLastNotification] = useState<Notifications.Notification | null>(null);
  
  // Refs to hold subscriptions
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const tokenRefreshListener = useRef<Notifications.Subscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasRegisteredRef = useRef(false);

  // ==========================================================================
  // Registration
  // ==========================================================================

  const register = useCallback(async (): Promise<string | null> => {
    if (isRegistering) {
      logger.debug('Registration already in progress');
      return pushToken;
    }

    setIsRegistering(true);

    try {
      // Get Expo push token
      const token = await registerForPushNotifications();

      if (!token) {
        setIsEnabled(false);
        setPushToken(null);
        return null;
      }

      setPushToken(token);
      setIsEnabled(true);

      // Register with backend if user is signed in
      if (isSignedIn && user?.walletAddress) {
        await registerPushTokenWithBackend(token);
      }

      hasRegisteredRef.current = true;
      return token;
    } catch (error) {
      logger.error('Push notification registration failed', error);
      setIsEnabled(false);
      return null;
    } finally {
      setIsRegistering(false);
    }
  }, [isRegistering, pushToken, isSignedIn, user?.walletAddress]);

  // ==========================================================================
  // Notification Listeners Setup
  // ==========================================================================

  useEffect(() => {
    // Auto-register on mount if enabled and signed in
    if (autoRegister && isSignedIn && !hasRegisteredRef.current) {
      register();
    }
  }, [autoRegister, isSignedIn, register]);

  useEffect(() => {
    // Handle foreground notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        logger.debug('Notification received in foreground', {
          title: notification.request.content.title,
          data: notification.request.content.data,
        });

        setLastNotification(notification);
        onNotificationReceived?.(notification);
      }
    );

    // Handle notification tap/response
    // NOTE: Navigation is handled by PushNotificationsProvider globally
    // This listener is only for custom callback handling and state updates
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData;
        
        logger.debug('Notification response received', {
          type: data?.type,
          actionIdentifier: response.actionIdentifier,
        });

        // Call custom callback if provided
        onNotificationResponse?.(response);
        
        // Update local state with the notification
        setLastNotification(response.notification);
      }
    );

    // Handle token refresh
    tokenRefreshListener.current = Notifications.addPushTokenListener(({ data }) => {
      logger.info('Push token refreshed');
      setPushToken(data);

      // Re-register with backend
      if (isSignedIn && user?.walletAddress) {
        registerPushTokenWithBackend(data);
      }
    });

    // Cleanup
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      if (tokenRefreshListener.current) {
        tokenRefreshListener.current.remove();
      }
    };
  }, [onNotificationReceived, onNotificationResponse, isSignedIn, user?.walletAddress]);

  // ==========================================================================
  // App State Handling - Clear badge when app comes to foreground
  // ==========================================================================

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground - clear badge
        clearBadge();
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // ==========================================================================
  // Re-register token when user signs in
  // ==========================================================================

  useEffect(() => {
    if (isSignedIn && pushToken && user?.walletAddress) {
      // User just signed in and we have a token - register it
      registerPushTokenWithBackend(pushToken);
    }
  }, [isSignedIn, pushToken, user?.walletAddress]);

  return {
    pushToken,
    isEnabled,
    isRegistering,
    register,
    lastNotification,
  };
}

export default usePushNotifications;
