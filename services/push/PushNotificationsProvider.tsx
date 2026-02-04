/**
 * Push Notifications Provider
 * 
 * This component sets up push notification listeners and should be rendered
 * inside NavigationContainer (so it has access to navigation context).
 * 
 * It handles:
 * - Requesting permissions and registering tokens
 * - Listening for incoming notifications
 * - Handling notification taps with deep linking
 * - Badge management
 */
import React, { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useUser, useAuthState } from '../../context/AuthContext';
import { ScreenNames } from '../../navigation/ScreenNames';
import {
  registerForPushNotifications,
  registerPushTokenWithBackend,
  clearBadge,
  type NotificationData,
} from './push.service';
import { createLogger } from '../../libs/logger';

const logger = createLogger('PushProvider');

interface PushNotificationsProviderProps {
  children: React.ReactNode;
}

export const PushNotificationsProvider: React.FC<PushNotificationsProviderProps> = ({ children }) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const isFullySignedIn = isSignedIn && !needsUsername;
  
  // Refs for subscriptions
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const tokenRefreshListener = useRef<Notifications.Subscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasRegisteredRef = useRef(false);
  const pushTokenRef = useRef<string | null>(null);

  // ==========================================================================
  // Navigation Handler
  // ==========================================================================

  const handleNotificationNavigation = useCallback((data: NotificationData) => {
    const { type, tokenId, actorAddress, actorUsername, postType } = data;

    logger.info('Handling notification tap', { type, tokenId });

    try {
      switch (type) {
        // Engagement - navigate to content
        case 'like':
        case 'comment':
        case 'comment_reply':
        case 'video_milestone':
          if (tokenId) {
            if (postType === 'feed-images' || postType === 'feed-simple') {
              navigation.navigate(ScreenNames.FeedDetail, { tokenId });
            } else {
              navigation.navigate(ScreenNames.VideoPlayer, { tokenId });
            }
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        // Social - navigate to notifications (user can tap to see profile)
        case 'following':
          navigation.navigate(ScreenNames.Notifications);
          break;

        // Monetization
        case 'tip':
        case 'subscription':
        case 'ppv_purchase':
          navigation.navigate(ScreenNames.Notifications);
          break;

        // Livestream
        case 'livestream_start':
          if (tokenId) {
            navigation.navigate(ScreenNames.LiveViewer, { streamId: String(tokenId) });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        // Content moderation
        case 'video_removal':
          navigation.navigate(ScreenNames.Notifications);
          break;

        // Default
        default:
          navigation.navigate(ScreenNames.Notifications);
          break;
      }
    } catch (error) {
      logger.error('Navigation failed', error);
      // Fallback to notifications screen
      try {
        navigation.navigate(ScreenNames.Notifications);
      } catch {
        // Ignore if navigation fails completely
      }
    }
  }, [navigation]);

  // ==========================================================================
  // Registration
  // ==========================================================================

  const registerPushToken = useCallback(async () => {
    if (hasRegisteredRef.current || !isFullySignedIn) return;

    try {
      const token = await registerForPushNotifications();
      if (!token) return;

      pushTokenRef.current = token;
      hasRegisteredRef.current = true;

      // Register with backend
      if (user?.walletAddress) {
        await registerPushTokenWithBackend(token);
      }
    } catch (error) {
      logger.error('Push registration failed', error);
    }
  }, [isFullySignedIn, user?.walletAddress]);

  // ==========================================================================
  // Setup Listeners
  // ==========================================================================

  useEffect(() => {
    // Register when user signs in
    if (isFullySignedIn && !hasRegisteredRef.current) {
      registerPushToken();
    }

    // Reset registration flag when user signs out
    if (!isFullySignedIn) {
      hasRegisteredRef.current = false;
      pushTokenRef.current = null;
    }
  }, [isFullySignedIn, registerPushToken]);

  useEffect(() => {
    // Handle foreground notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        logger.debug('Notification received in foreground', {
          title: notification.request.content.title,
        });
        // Notification will be shown by the OS based on setNotificationHandler config
      }
    );

    // Handle notification tap
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData;
        
        logger.info('User tapped notification', { type: data?.type });

        if (data) {
          handleNotificationNavigation(data);
        }
      }
    );

    // Handle token refresh
    tokenRefreshListener.current = Notifications.addPushTokenListener(({ data }) => {
      logger.info('Push token refreshed');
      pushTokenRef.current = data;

      if (isFullySignedIn && user?.walletAddress) {
        registerPushTokenWithBackend(data);
      }
    });

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
  }, [handleNotificationNavigation, isFullySignedIn, user?.walletAddress]);

  // ==========================================================================
  // Badge Management - Clear on foreground
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

  return <>{children}</>;
};

export default PushNotificationsProvider;
