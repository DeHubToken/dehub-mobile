import React, { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useUser, useAuthState, useAuthActions } from '../../context/AuthContext';
import { ScreenNames } from '../../navigation/ScreenNames';
import {
  registerForPushNotifications,
  registerPushTokenWithBackend,
  isValidExpoPushToken,
  clearBadge,
} from './push.service';
import { createLogger } from '../../libs/logger';
import { openInApp } from '../../libs/links.utils';
import { NotificationType, NotificationCategory } from '../enums/notification.enums';
import { storage } from '../../libs/storage';
import { getNotifications } from '../user.service';
import { countUnreadNotifications, incrementUnreadCount } from '../../libs/notifications.unread';

const logger = createLogger('PushProvider');

// Persisted so a cold start can tell a fresh notification tap apart from the
// stale response Android replays on every launch via getLastNotificationResponseAsync.
const LAST_HANDLED_RESPONSE_KEY = 'push.lastHandledResponseId';

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
  broadcastId?: string;
  // Aggregation
  aggregatedCount?: number;
  // Moderation (in-app metadata)
  moderationType?: string;
  // Quote post reference
  quoteTokenId?: number;
}

/**
 * Types that can navigate to content
 */
const CONTENT_NAVIGABLE_TYPES = new Set([
  NotificationType.LIKE,
  NotificationType.COMMENT,
  NotificationType.COMMENT_REPLY,
  NotificationType.COMMENT_LIKE,
  NotificationType.REPOST,
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

/**
 * A platform announcement names the page it is about in `articleUrl`, which the
 * admin broadcast puts in both the in-app row's metadata and the push payload.
 * NotificationScreen has always opened it on a row tap; a push tap fell through
 * to NON_NAVIGABLE_TYPES and dumped the user on the notifications list, so the
 * two taps on the same announcement went to different places.
 *
 * Same three types the row handles, and only http(s) — the value is
 * admin-authored, but openInApp prefixes a bare scheme onto anything, so an
 * unfiltered value would decide for itself what it opens.
 */
const ANNOUNCEMENT_TYPES = new Set([
  NotificationType.SYSTEM,
  NotificationType.ACCOUNT_WARNING,
  NotificationType.VIDEO_REMOVAL,
]);

function announcementUrl(data: NotificationData): string | null {
  if (!ANNOUNCEMENT_TYPES.has(data.type as NotificationType)) return null;
  const url = typeof data.articleUrl === 'string' ? data.articleUrl.trim() : '';
  return /^https?:\/\//i.test(url) ? url : null;
}

interface PushNotificationsProviderProps {
  children: React.ReactNode;
}

export const PushNotificationsProvider: React.FC<PushNotificationsProviderProps> = ({ children }) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { patchUser } = useAuthActions();
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
  // Track if cold-start notification has been checked
  const coldStartCheckedRef = useRef(false);
  // Track the last processed notification identifier to avoid double-handling
  const lastProcessedIdRef = useRef<string | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!isFullySignedIn) return;

    try {
      // The backend defaults to unread-only. Fetch enough rows to support the
      // app's 99+ badge without downloading notification history.
      const response = await getNotifications({ limit: 100 });
      await patchUser({ notificationCount: countUnreadNotifications(response) });
    } catch (error) {
      logger.warn('Unread notification refresh failed', error);
    }
  }, [isFullySignedIn, patchUser]);

  const handleNotificationNavigation = useCallback((data: NotificationData, responseId?: string) => {
    // Guard: Don't navigate if no valid notification type
    if (!data?.type) {
      logger.debug('Skipping navigation - no notification type', { data });
      return;
    }

    // Guard: Avoid double-processing the same notification
    if (responseId && lastProcessedIdRef.current === responseId) {
      logger.debug('Skipping duplicate notification response', { responseId });
      return;
    }
    if (responseId) {
      lastProcessedIdRef.current = responseId;
      storage.set(LAST_HANDLED_RESPONSE_KEY, responseId);
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
      // An announcement carrying a link goes to the link. Notifications first,
      // so dismissing the in-app browser leaves the user on the row that sent
      // them there rather than on whatever screen the tap interrupted.
      const articleUrl = announcementUrl(data);
      if (articleUrl) {
        navigation.navigate(ScreenNames.Notifications);
        openInApp(articleUrl);
        return;
      }

      // Non-navigable types - just open notifications screen
      if (NON_NAVIGABLE_TYPES.has(type as NotificationType)) {
        navigation.navigate(ScreenNames.Notifications);
        return;
      }

      switch (type) {
        case NotificationType.FOLLOWING:
          // New follower → open FollowList on followers tab
          if (userAddress) {
            navigation.navigate(ScreenNames.FollowList, {
              address: userAddress,
              initialTab: 'followers',
              isOwnProfile: true,
            });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.FOLLOW_REQUEST:
          // Follow request → notifications screen (has accept/reject buttons)
          navigation.navigate(ScreenNames.Notifications);
          break;

        case NotificationType.FOLLOW_REQUEST_ACCEPTED:
          // Accepted → open FollowList on following tab
          if (userAddress) {
            navigation.navigate(ScreenNames.FollowList, {
              address: userAddress,
              initialTab: 'following',
              isOwnProfile: true,
            });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.LIKE:
          if (tokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.COMMENT:
        case NotificationType.COMMENT_REPLY:
        case NotificationType.COMMENT_LIKE:
          if (tokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId, commentId });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.MENTION:
          if (tokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId, commentId });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.REPOST:
          if (tokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.QUOTE:
          if (data.quoteTokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId: data.quoteTokenId });
          } else if (tokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.TIP:
          // Tip → open the tipper's profile
          if (actorAddress || actorUsername) {
            navigation.navigate(ScreenNames.Profile, {
              address: actorAddress,
              username: actorUsername,
            });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.BOUNTY_AVAILABLE:
        case NotificationType.BOUNTY_CLAIMED:
        case NotificationType.PPV_PURCHASE:
          if (tokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId });
          } else {
            navigation.navigate(ScreenNames.Notifications);
          }
          break;

        case NotificationType.SUBSCRIPTION:
          // New subscriber → open notifications (no SubscribersScreen yet)
          navigation.navigate(ScreenNames.Notifications);
          break;

        case NotificationType.VIDEO_MILESTONE:
          if (tokenId) {
            navigation.navigate(ScreenNames.FeedDetail, { tokenId });
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

        case NotificationType.NEW_MESSAGE:
          if (conversationId) {
            navigation.navigate(ScreenNames.Chat, { conversationId });
          } else {
            // The DM list is mounted as ScreenNames.DM
            // (navigation/BottomTabNavigator.tsx). A duplicate
            // `DirectMessages` enum entry used to be used here; it was never
            // registered on a navigator, so navigating to it threw and fell
            // through to the catch below, dumping the user on Notifications
            // instead of their DMs. That alias has since been removed.
            navigation.navigate(ScreenNames.DM);
          }
          break;

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
  }, [navigation, isFullySignedIn, userAddress]);

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

  useEffect(() => {
    // Register when user signs in - add delay to ensure auth is fully propagated
    if (isFullySignedIn && userAddress && !hasRegisteredRef.current) {
      const timer = setTimeout(() => {
        registerPushToken();
      }, 1000); // 1 second delay to ensure JWT is ready
      return () => clearTimeout(timer);
    }

    // Handle pending navigation after auth completes (cold-start stored pending)
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

  // When the app is launched from a killed state by tapping a notification,
  // addNotificationResponseReceivedListener may fire before this component
  // mounts or the event can be lost entirely. We use
  // getLastNotificationResponseAsync() to retrieve it on mount.

  useEffect(() => {
    if (coldStartCheckedRef.current) return;
    coldStartCheckedRef.current = true;

    const checkColdStartNotification = async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (!lastResponse) return;

        const data = lastResponse.notification.request.content.data as unknown as NotificationData;
        if (!data?.type) return;

        // notification.date is the DELIVERY time, not the tap time — an age
        // check here silently drops taps on any notification older than the
        // window (the common case for messages). Dedup by response id instead:
        // skip only if this exact response was already handled, this session
        // or a previous one.
        const responseId = lastResponse.notification.request.identifier;
        if (storage.getString(LAST_HANDLED_RESPONSE_KEY) === responseId) {
          logger.debug('Cold-start notification already handled', { responseId });
          return;
        }
        logger.info('Processing cold-start notification', { type: data.type, responseId });
        handleNotificationNavigation(data, responseId);
      } catch (error) {
        logger.error('Failed to check cold-start notification', error);
      }
    };

    // Small delay to ensure navigation container is fully mounted and ready
    const timer = setTimeout(checkColdStartNotification, 750);
    return () => clearTimeout(timer);
  }, [handleNotificationNavigation]);

  useEffect(() => {
    // Handle foreground notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        logger.debug('Notification received in foreground', {
          title: notification.request.content.title,
        });
        // Foreground pushes do not trigger auth enrichment, so update the
        // in-app badge immediately. The periodic/server refresh below remains
        // authoritative and corrects aggregation or duplicate delivery.
        if (isFullySignedIn) {
          void patchUser((current) => ({
            notificationCount: incrementUnreadCount(current.notificationCount),
          }));
        }
        // Notification will be shown by the OS based on setNotificationHandler config
      }
    );

    // Handle notification tap (foreground and background — but NOT cold-start)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const rawData = response.notification.request.content.data;
        const data = rawData as unknown as NotificationData;
        const responseId = response.notification.request.identifier;
        
        // Only process if we have valid notification data with a type
        if (data?.type) {
          logger.info('User tapped notification', { type: data.type, responseId });
          handleNotificationNavigation(data, responseId);
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
  }, [handleNotificationNavigation, isFullySignedIn, patchUser, userAddress]);

  // Keep the home bell and navigation badge fresh even when push permission is
  // denied or a delivery is missed. This also replaces the auth-time snapshot,
  // which otherwise remains stale for the entire session.
  useEffect(() => {
    if (!isFullySignedIn) return;
    void refreshUnreadCount();
    const interval = setInterval(() => void refreshUnreadCount(), 60_000);
    return () => clearInterval(interval);
  }, [isFullySignedIn, refreshUnreadCount]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground: refresh the in-app count before clearing the
        // OS-level app icon badge. The two indicators have separate lifecycles.
        void refreshUnreadCount();
        clearBadge();
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refreshUnreadCount]);

  return <>{children}</>;
};

export default PushNotificationsProvider;
