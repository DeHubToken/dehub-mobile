import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from '../../libs/api.client';
import { createLogger } from '../../libs/logger';

const logger = createLogger('PushService');

export type NotificationPreferenceKey =
  | 'likes'
  | 'comments'
  | 'commentReplies'
  | 'mentions'
  // Key name matches web's `PushPreferences.directMessages`
  // (dehubweb src/lib/api/dehub/push.ts) so the two clients agree on the name.
  | 'directMessages'
  | 'newFollowers'
  | 'tips'
  | 'subscriptions'
  | 'ppvPurchases'
  | 'milestones'
  | 'livestreamStart'
  | 'accountAlerts'
  | 'announcements';

export interface QuietHours {
  enabled: boolean;
  start: number; // Hour (0-23)
  end: number;   // Hour (0-23)
  timezone: string;
}

export interface NotificationPreferences {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  inApp: Record<NotificationPreferenceKey, boolean>;
  push: Record<NotificationPreferenceKey, boolean>;
  quietHours: QuietHours;
}

export interface PushTokenPayload {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
  deviceName?: string;
}

export interface NotificationData {
  type: string;
  category?: string;
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
  [key: string]: unknown;
}

// Configure default behavior when notification is received in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Singleton state for token registration
let cachedExpoPushToken: string | null = null;
let isRegistrationInProgress = false;
let registrationPromise: Promise<string | null> | null = null;
let androidChannelsConfigured = false;

/**
 * Validate that a token is a valid Expo push token format.
 * Expo push tokens start with "ExponentPushToken[" and end with "]".
 */
export function isValidExpoPushToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  return token.startsWith('ExponentPushToken[') && token.endsWith(']');
}

/**
 * Get cached Expo push token without triggering a new registration.
 */
export function getCachedPushToken(): string | null {
  return cachedExpoPushToken;
}

/**
 * Request push notification permissions and get Expo push token.
 * Returns null if permissions denied or not on physical device.
 * 
 * Uses singleton pattern - if already registered, returns cached token.
 * If registration in progress, returns the same promise.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Return cached token if already registered
  if (cachedExpoPushToken) {
    return cachedExpoPushToken;
  }

  // If registration is in progress, return the existing promise
  if (isRegistrationInProgress && registrationPromise) {
    return registrationPromise;
  }

  // Start new registration
  isRegistrationInProgress = true;
  registrationPromise = doRegisterForPushNotifications();
  
  try {
    const token = await registrationPromise;
    cachedExpoPushToken = token;
    return token;
  } finally {
    isRegistrationInProgress = false;
    registrationPromise = null;
  }
}

/**
 * Internal function that does the actual registration work.
 */
async function doRegisterForPushNotifications(): Promise<string | null> {
  // Must be a physical device for push notifications
  if (!Device.isDevice) {
    logger.warn('Push notifications require a physical device');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      logger.info('Requesting push notification permissions...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('Push notification permission denied');
      return null;
    }

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      logger.error('EAS project ID not found in app config');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;

    logger.info('Expo push token obtained', { token: token.substring(0, 20) + '...' });

    // Set up Android notification channels (only once)
    if (Platform.OS === 'android' && !androidChannelsConfigured) {
      await setupAndroidChannels();
      androidChannelsConfigured = true;
    }

    return token;
  } catch (error) {
    logger.error('Failed to get push token', error);
    return null;
  }
}

/**
 * Set up Android notification channels for different notification types.
 * Channels allow users to customize notifications per category in system settings.
 */
async function setupAndroidChannels(): Promise<void> {
  try {
    // Default channel for general notifications
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      description: 'General notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#000000',
      sound: 'default',
    });

    // Engagement channel (likes, comments)
    await Notifications.setNotificationChannelAsync('engagement', {
      name: 'Likes & Comments',
      description: 'Notifications for likes, comments, and replies',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200],
      lightColor: '#000000',
      sound: 'default',
    });

    // Social channel (follows, mentions)
    await Notifications.setNotificationChannelAsync('social', {
      name: 'Social',
      description: 'Followers, mentions, and social interactions',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      lightColor: '#000000',
      sound: 'default',
    });

    // Monetization channel (tips, subscriptions, purchases)
    await Notifications.setNotificationChannelAsync('monetization', {
      name: 'Tips & Earnings',
      description: 'Tips, subscriptions, and purchase notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 100, 250],
      lightColor: '#000000',
      sound: 'default',
    });

    // Live streams channel
    await Notifications.setNotificationChannelAsync('livestream', {
      name: 'Live Streams',
      description: 'When creators you follow go live',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 100, 300],
      lightColor: '#000000',
      sound: 'default',
    });

    // Content channel (milestones, moderation)
    await Notifications.setNotificationChannelAsync('content', {
      name: 'Content Updates',
      description: 'Milestones, content status, and moderation',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#000000',
      sound: 'default',
    });

    logger.info('Android notification channels configured');
  } catch (error) {
    logger.error('Failed to set up Android channels', error);
  }
}

// Track the last token registered with backend to avoid duplicates
let lastBackendRegisteredToken: string | null = null;
let backendRegistrationInProgress = false;

/**
 * Register push token with backend for the authenticated user.
 * Backend will use this to send push notifications to this device.
 * 
 * Includes deduplication - won't register the same token twice.
 */
export async function registerPushTokenWithBackend(token: string): Promise<boolean> {
  // Validate token format before sending to backend
  if (!isValidExpoPushToken(token)) {
    logger.error('Invalid Expo push token format', { token: token?.substring(0, 30) });
    throw new Error('Invalid Expo push token format');
  }

  // Skip if same token already registered
  if (lastBackendRegisteredToken === token) {
    logger.debug('Token already registered with backend, skipping');
    return true;
  }

  // Skip if registration already in progress
  if (backendRegistrationInProgress) {
    logger.debug('Backend registration already in progress, skipping');
    return false;
  }

  backendRegistrationInProgress = true;

  try {
    const deviceId = Device.deviceName || `${Platform.OS}-${Date.now()}`;
    
    const payload: PushTokenPayload = {
      token,
      platform: Platform.OS as 'ios' | 'android',
      deviceId,
      deviceName: Device.modelName || undefined,
    };

    const response = await apiClient.post('/push/token', payload, { isAuthRequired: true });
    
    if (response?.success) {
      logger.info('Push token registered with backend');
      lastBackendRegisteredToken = token;
      return true;
    }
    
    logger.warn('Backend rejected push token registration', response);
    return false;
  } catch (error) {
    logger.error('Failed to register push token with backend', error);
    return false;
  } finally {
    backendRegistrationInProgress = false;
  }
}

/**
 * Clear the cached registration state (call on logout).
 */
export function clearPushTokenCache(): void {
  cachedExpoPushToken = null;
  lastBackendRegisteredToken = null;
  androidChannelsConfigured = false;
}

/**
 * Unregister all push tokens for the current user (e.g., on logout).
 */
export async function unregisterPushTokens(): Promise<boolean> {
  try {
    await apiClient.delete('/push/tokens', { isAuthRequired: true });
    logger.info('Push tokens unregistered');
    return true;
  } catch (error) {
    logger.error('Failed to unregister push tokens', error);
    return false;
  }
}

/**
 * Unregister the current device's push token only.
 */
export async function unregisterCurrentDeviceToken(): Promise<boolean> {
  try {
    const deviceId = Device.deviceName || `${Platform.OS}-${Date.now()}`;
    await apiClient.delete(`/push/token/${encodeURIComponent(deviceId)}`, { isAuthRequired: true });
    logger.info('Current device push token unregistered');
    return true;
  } catch (error) {
    logger.error('Failed to unregister current device token', error);
    return false;
  }
}

/**
 * Get default notification preferences structure.
 */
export function getDefaultNotificationPreferences(): NotificationPreferences {
  const defaultTypePrefs: Record<NotificationPreferenceKey, boolean> = {
    likes: true,
    comments: true,
    commentReplies: true,
    mentions: true,
    directMessages: true,
    newFollowers: true,
    tips: true,
    subscriptions: true,
    ppvPurchases: true,
    milestones: true,
    livestreamStart: true,
    accountAlerts: true,
    announcements: true,
  };

  // Push mirrors in-app: every type on. These defaults are only ever a display
  // state — nothing writes them at load, and the server treats an absent key as
  // enabled — so any type that starts `false` here describes something the
  // backend is not doing, and only becomes true once an unrelated toggle saves
  // the whole object. Keep the two lists in agreement.
  return {
    inAppEnabled: true,
    pushEnabled: true,
    inApp: { ...defaultTypePrefs },
    push: { ...defaultTypePrefs },
    quietHours: {
      enabled: false,
      start: 22, // 10 PM
      end: 8,    // 8 AM (matching API docs)
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

/**
 * Merge a saved preferences blob onto the defaults.
 *
 * A plain spread is shallow, so a saved `inApp` block replaces the defaults
 * wholesale rather than filling the gaps: a user who has only ever toggled one
 * type ends up with a single key and `undefined` for the other twelve. That
 * currently survives because the screen reads every switch as `value ?? true`,
 * but it means the in-memory object does not describe what the server will do,
 * and `savePreferences` sends that object back verbatim. Merge per block so the
 * two always agree, and so an unknown key from a newer client is preserved
 * rather than dropped on the next save.
 */
export function mergePreferences(
  defaults: NotificationPreferences,
  saved: Partial<NotificationPreferences> | null | undefined,
): NotificationPreferences {
  if (!saved || typeof saved !== 'object') return defaults;
  return {
    ...defaults,
    ...saved,
    inApp: { ...defaults.inApp, ...(saved.inApp ?? {}) },
    push: { ...defaults.push, ...(saved.push ?? {}) },
    quietHours: { ...defaults.quietHours, ...(saved.quietHours ?? {}) },
  };
}

/**
 * Update notification preferences on the backend.
 * Uses the /update_profile endpoint with notificationPreferences field.
 */
export async function updateNotificationPreferences(
  preferences: Partial<NotificationPreferences>
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append('notificationPreferences', JSON.stringify(preferences));
    
    const response = await apiClient.post<any>(
      '/update_profile',
      formData,
      { isAuthRequired: true }
    );

    if (response?.result || response?.success) {
      logger.info('Notification preferences updated');
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Failed to update notification preferences', error);
    return false;
  }
}

/**
 * Get current app badge count.
 */
export async function getBadgeCount(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch {
    return 0;
  }
}

/**
 * Set app badge count.
 */
export async function setBadgeCount(count: number): Promise<boolean> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
    return true;
  } catch (error) {
    logger.error('Failed to set badge count', error);
    return false;
  }
}

/**
 * Clear app badge.
 */
export async function clearBadge(): Promise<boolean> {
  return setBadgeCount(0);
}

/**
 * Dismiss all delivered notifications.
 */
export async function dismissAllNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
    logger.debug('All notifications dismissed');
  } catch (error) {
    logger.error('Failed to dismiss notifications', error);
  }
}

/**
 * Dismiss a specific notification by identifier.
 */
export async function dismissNotification(identifier: string): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch (error) {
    logger.error('Failed to dismiss notification', error);
  }
}

/**
 * Get all presented/delivered notifications.
 */
export async function getPresentedNotifications(): Promise<Notifications.Notification[]> {
  try {
    return await Notifications.getPresentedNotificationsAsync();
  } catch (error) {
    logger.error('Failed to get presented notifications', error);
    return [];
  }
}

/**
 * Schedule a local notification immediately (useful for testing).
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: NotificationData
): Promise<string | null> {
  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data as Record<string, unknown>,
        sound: 'default',
      },
      trigger: null, // Immediate
    });
    return identifier;
  } catch (error) {
    logger.error('Failed to send local notification', error);
    return null;
  }
}

/**
 * Check if push notifications are currently enabled.
 */
export async function arePushNotificationsEnabled(): Promise<boolean> {
  if (!Device.isDevice) return false;
  
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Get current notification permission status with details.
 */
export async function getNotificationPermissionStatus(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
}> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return {
      granted: status === 'granted',
      canAskAgain: canAskAgain ?? false,
      status,
    };
  } catch {
    return {
      granted: false,
      canAskAgain: true,
      status: Notifications.PermissionStatus.UNDETERMINED,
    };
  }
}

export default {
  registerForPushNotifications,
  registerPushTokenWithBackend,
  unregisterPushTokens,
  unregisterCurrentDeviceToken,
  isValidExpoPushToken,
  getCachedPushToken,
  clearPushTokenCache,
  getDefaultNotificationPreferences,
  mergePreferences,
  updateNotificationPreferences,
  getBadgeCount,
  setBadgeCount,
  clearBadge,
  dismissAllNotifications,
  dismissNotification,
  getPresentedNotifications,
  sendLocalNotification,
  arePushNotificationsEnabled,
  getNotificationPermissionStatus,
};
