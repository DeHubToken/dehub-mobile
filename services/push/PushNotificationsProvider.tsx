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
  isValidExpoPushToken,
  clearBadge,
} from './push.service';
import { createLogger } from '../../libs/logger';
import { NotificationType, NotificationCategory } from '../enums/notification.enums';

const logger = createLogger('PushProvider');

// =============================================================================
// Types - aligned with backend push notification payload
// =============================================================================

export interface NotificationData {
  type: NotificationType;
  category: NotificationCategory;
  deepLink?: string;
  // Content-related
  tokenId?: number;
  postType?: 'video' | 'feed-images' | 'feed-simple';
  commentId?: string;
  parentCommentId?: string;
  // Actor-related  
  actorAddress?: string;
  actorUsername?: string;
  // Monetization
  amount?: number;
  currency?: string;
  bountyType?: 'viewer' | 'commentor';
  planId?: string;
  // Livestream
  streamId?: string;
  // Messages
  conversationId?: string;
  conversationType?: 'dm' | 'group';
  senderName?: string;
  // Milestone
  milestone?: string;
  // System
  articleUrl?: string;
  // Aggregation
  aggregatedCount?: number;
}

/**
 * Types that can navigate to content
 */
const CONTENT_NAVIGABLE_TYPES = new Set([
  NotificationType.LIKE,
  NotificationType.COMMENT,
  NotificationType.COMMENT_REPLY,
  NotificationType.COMMENT_LIKE,
  NotificationType.TIP,
  NotificationType.PPV_PURCHASE,
  NotificationType.BOUNTY_AVAILABLE,
  NotificationType.BOUNTY_CLAIMED,
  NotificationType.VIDEO_MILESTONE,
  NotificationType.MENTION,
]);

/**
 * Types that navigate to user profile
 */
const PROFILE_NAVIGABLE_TYPES = new Set([
  NotificationType.FOLLOWING,
  NotificationType.SUBSCRIPTION,
  NotificationType.FOLLOW_REQUEST_ACCEPTED,
]);

/**
 * Types that are not navigable - just open notifications
 */
const NON_NAVIGABLE_TYPES = new Set([
  NotificationType.DISLIKE,
  NotificationType.SYSTEM,
  NotificationType.ACCOUNT_WARNING,
  NotificationType.VIDEO_REMOVAL,
]);

interface PushNotificationsProviderProps {
  children: React.ReactNode;
}

export const PushNotificationsProvider: React.FC<PushNotificationsProviderProps> = ({ children }) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const isFullySignedIn = isSignedIn && !needsUsername;
  const userAddress = user?.walletAddress || user?.address;
  
  // Refs for subscriptions
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const tokenRefreshListener = useRef<Notifications.Subscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasRegisteredRef = useRef(false);
  const isRegisteringRef = useRef(false);
  const pushTokenRef = useRef<string | null>(null);
  // Store pending navigation to execute after auth completes
  const pendingNavigationRef = useRef<NotificationData | null>(null);

  // ==========================================================================
  // Navigation Handler
  // ==========================================================================

  const handleNotificationNavigation = useCallback((data: NotificationData) => {
    // Guard: Don't navigate if no valid notification type
    if (!data?.type) {
      logger.debug('Skipping navigation - no notification type', { data });
      return;
    }

    // Guard: If user isn't fully signed in, store for later
    if (!isFullySignedIn) {
      logger.debug('User not authenticated, storing pending navigation', { type: data.type });
      pendingNavigationRef.current = data;
      return;
    }

    const { type, tokenId, postType, commentId, actorAddress, actorUsername, streamId, conversationId } = data;

    logger.info('Handling notification tap', { type, tokenId, commentId });

    try {
      // Non-navigable types - just open notifications screen
      if (NON_NAVIGABLE_TYPES.has(type as NotificationType)) {
        navigation.navigate(ScreenNames.Notifications);
        return;
      }

      switch (type) {
        // =====================================================================
        // Social - Open notifications (profile handled via in-app notification)
        // =====================================================================
        case NotificationType.FOLLOWING:
        case NotificationType.SUBSCRIPTION:
        case NotificationType.FOLLOW_REQUEST:
        case NotificationType.FOLLOW_REQUEST_ACCEPTED:
          // For push notifications, navigate to notifications screen
          // Follow requests have inline accept/reject buttons there
          navigation.navigate(ScreenNames.Notifications);
          break;

        // =====================================================================
        // Content Engagement - Navigate to content
        // =====================================================================
        case NotificationType.LIKE:
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

        case NotificationType.COMMENT:
        case NotificationType.COMMENT_REPLY:
        case NotificationType.COMMENT_LIKE:
          // Navigate to content with commentId
          if (tokenId) {
            if (postType === 'feed-images' || postType === 'feed-simple') {
              navigation.navigate(ScreenNames.FeedDetail, { tokenId, commentId });
            } else {
              navigation.navigate(ScreenNames.VideoPlayer, { tokenId, commentId });
            }
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.MENTION:
          if (tokenId) {
            if (postType === 'feed-images' || postType === 'feed-simple') {
              navigation.navigate(ScreenNames.FeedDetail, { tokenId, commentId });
            } else {
              navigation.navigate(ScreenNames.VideoPlayer, { tokenId, commentId });
            }
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        // =====================================================================
        // Monetization - Navigate to content
        // =====================================================================
        case NotificationType.TIP:
        case NotificationType.PPV_PURCHASE:
        case NotificationType.BOUNTY_AVAILABLE:
        case NotificationType.BOUNTY_CLAIMED:
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

        // =====================================================================
        // Content - Milestones and Livestreams
        // =====================================================================
        case NotificationType.VIDEO_MILESTONE:
          if (tokenId) {
            navigation.navigate(ScreenNames.VideoPlayer, { tokenId });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.LIVESTREAM_START:
          if (streamId || tokenId) {
            navigation.navigate(ScreenNames.LiveViewer, { 
              streamId: streamId || String(tokenId) 
            });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        // =====================================================================
        // Messages
        // =====================================================================
        case NotificationType.NEW_MESSAGE:
          if (conversationId) {
            navigation.navigate(ScreenNames.Chat, { conversationId });
          } else {
            navigation.navigate(ScreenNames.DirectMessages);
          }
          break;

        // =====================================================================
        // Default - Open notifications screen
        // =====================================================================
        default:
          navigation.navigate(ScreenNames.Notifications);
          break;
      }
    } catch (error) {
      logger.error('Navigation failed', error);
      // Fallback to notifications screen
      try {
        navigation.navigate(ScreenNames.Notifications);
      } catch (e) {
        // Ignore - navigation not ready
      }
    }
  }, [navigation, isFullySignedIn]);

  // ==========================================================================
  // Registration
  // ==========================================================================

  const registerPushToken = useCallback(async () => {
    // Guard: Already registered or registration in progress
    if (hasRegisteredRef.current || isRegisteringRef.current || !isFullySignedIn) return;
    
    // Guard: Need user address for backend registration
    if (!userAddress) {
      logger.debug('Waiting for user address before push registration');
      return;
    }

    isRegisteringRef.current = true;

    try {
      // Service layer handles caching and deduplication
      const token = await registerForPushNotifications();
      if (!token) {
        isRegisteringRef.current = false;
        return;
      }

      pushTokenRef.current = token;

      // Service layer handles backend deduplication
      logger.info('Registering push token with backend', { userAddress: userAddress.slice(0, 10) + '...' });
      await registerPushTokenWithBackend(token);
      
      hasRegisteredRef.current = true;
    } catch (error) {
      logger.error('Push registration failed', error);
    } finally {
      isRegisteringRef.current = false;
    }
  }, [isFullySignedIn, userAddress]);

  // ==========================================================================
  // Setup Listeners
  // ==========================================================================

  useEffect(() => {
    // Register when user signs in - add delay to ensure auth is fully propagated
    if (isFullySignedIn && userAddress && !hasRegisteredRef.current) {
      const timer = setTimeout(() => {
        registerPushToken();
      }, 1000); // 1 second delay to ensure JWT is ready
      return () => clearTimeout(timer);
    }

    // Handle pending navigation after auth completes
    if (isFullySignedIn && pendingNavigationRef.current) {
      const pendingData = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      // Small delay to ensure navigation is ready
      setTimeout(() => {
        handleNotificationNavigation(pendingData);
      }, 500);
    }

    // Reset registration flag when user signs out
    if (!isFullySignedIn) {
      hasRegisteredRef.current = false;
      isRegisteringRef.current = false;
      pushTokenRef.current = null;
      pendingNavigationRef.current = null;
    }
  }, [isFullySignedIn, userAddress, registerPushToken, handleNotificationNavigation]);

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
        const rawData = response.notification.request.content.data;
        const data = rawData as unknown as NotificationData;
        
        // Only process if we have valid notification data with a type
        if (data?.type) {
          logger.info('User tapped notification', { type: data.type });
          handleNotificationNavigation(data);
        } else {
          logger.debug('Ignoring notification response without valid type', { data });
        }
      }
    );

    // Handle token refresh - service layer handles deduplication
    tokenRefreshListener.current = Notifications.addPushTokenListener(async () => {
      // Service layer caches token and handles deduplication
      const expoToken = await registerForPushNotifications();
      if (expoToken && isValidExpoPushToken(expoToken)) {
        pushTokenRef.current = expoToken;

        if (isFullySignedIn && userAddress) {
          try {
            // Service layer handles backend deduplication
            await registerPushTokenWithBackend(expoToken);
          } catch (error) {
            logger.error('Failed to re-register refreshed token', error);
          }
        }
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
  }, [handleNotificationNavigation, isFullySignedIn, userAddress]);

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
