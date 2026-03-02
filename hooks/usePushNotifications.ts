import { useEffect, useRef, useCallback, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { useUser, useAuthState } from '../context/AuthContext';
import {
  registerForPushNotifications,
  registerPushTokenWithBackend,
  isValidExpoPushToken,
  clearBadge,
  type NotificationData,
} from '../services/push/push.service';
import { createLogger } from '../libs/logger';

const logger = createLogger('usePushNotifications');

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

export function usePushNotifications(
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsReturn {
  const { autoRegister = true, onNotificationReceived, onNotificationResponse } = options;
  
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const isFullySignedIn = isSignedIn && !needsUsername;
  const userAddress = user?.walletAddress || user?.address;
  
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

  const register = useCallback(async (): Promise<string | null> => {
    if (isRegistering) {
      logger.debug('Registration already in progress');
      return pushToken;
    }

    setIsRegistering(true);

    try {
      // Service layer handles caching and deduplication
      const token = await registerForPushNotifications();

      if (!token) {
        setIsEnabled(false);
        setPushToken(null);
        return null;
      }

      setPushToken(token);
      setIsEnabled(true);

      // Service layer handles backend deduplication
      if (isFullySignedIn && userAddress) {
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
  }, [isRegistering, pushToken, isFullySignedIn, userAddress]);

  useEffect(() => {
    // Auto-register on mount if enabled and fully signed in
    if (autoRegister && isFullySignedIn && userAddress && !hasRegisteredRef.current) {
      register();
    }
  }, [autoRegister, isFullySignedIn, userAddress, register]);

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

    // Handle token refresh - service layer handles deduplication
    tokenRefreshListener.current = Notifications.addPushTokenListener(async () => {
      // Service layer caches token and handles deduplication
      const expoToken = await registerForPushNotifications();
      if (expoToken && isValidExpoPushToken(expoToken)) {
        setPushToken(expoToken);

        // Service layer handles backend deduplication
        if (isSignedIn && userAddress) {
          try {
            await registerPushTokenWithBackend(expoToken);
          } catch (error) {
            logger.error('Failed to re-register refreshed token', error);
          }
        }
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

  useEffect(() => {
    if (isFullySignedIn && pushToken && userAddress && isValidExpoPushToken(pushToken)) {
      // Service layer handles deduplication
      registerPushTokenWithBackend(pushToken).catch((error) => {
        logger.error('Failed to register push token on sign in', error);
      });
    }
  }, [isFullySignedIn, pushToken, userAddress]);

  return {
    pushToken,
    isEnabled,
    isRegistering,
    register,
    lastNotification,
  };
}

export default usePushNotifications;
