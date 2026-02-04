/**
 * Push Notification Service
 * 
 * Handles Expo push notifications setup, token management, and device registration.
 * Uses FCM under the hood for Android, APNs for iOS - all abstracted by Expo.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from '../../libs/api.client';
import { createLogger } from '../../libs/logger';

const logger = createLogger('PushService');

// =============================================================================
// Types
// =============================================================================

export type NotificationPreferenceKey =
  | 'likes'
  | 'comments'
  | 'commentReplies'
  | 'mentions'
  | 'newFollowers'
  | 'tips'
  | 'subscriptions'
  | 'ppvPurchases'
  | 'milestones'
  | 'livestreamStart';

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
  tokenId?: number;
  actorAddress?: string;
  actorUsername?: string;
  postType?: string;
  amount?: number;
  currency?: string;
  [key: string]: unknown;
}

// =============================================================================
// Configuration
// =============================================================================

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

// =============================================================================
// Permission & Token Management
// =============================================================================

/**
 * Request push notification permissions and get Expo push token.
 * Returns null if permissions denied or not on physical device.
 */
export async function registerForPushNotifications(): Promise<string | null> {
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

    // Set up Android notification channels
    if (Platform.OS === 'android') {
      await setupAndroidChannels();
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
      lightColor: '#8b5cf6', // DeHub purple
      sound: 'default',
    });

    // Engagement channel (likes, comments)
    await Notifications.setNotificationChannelAsync('engagement', {
      name: 'Likes & Comments',
      description: 'Notifications for likes, comments, and replies',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200],
      lightColor: '#ef4444', // Red for hearts
      sound: 'default',
    });

    // Social channel (follows, mentions)
    await Notifications.setNotificationChannelAsync('social', {
      name: 'Social',
      description: 'Followers, mentions, and social interactions',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      lightColor: '#8b5cf6', // Purple
      sound: 'default',
    });

    // Monetization channel (tips, subscriptions, purchases)
    await Notifications.setNotificationChannelAsync('monetization', {
      name: 'Tips & Earnings',
      description: 'Tips, subscriptions, and purchase notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 100, 250],
      lightColor: '#22c55e', // Green for money
      sound: 'default',
    });

    // Live streams channel
    await Notifications.setNotificationChannelAsync('livestream', {
      name: 'Live Streams',
      description: 'When creators you follow go live',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 100, 300],
      lightColor: '#ef4444', // Red for live
      sound: 'default',
    });

    // Content channel (milestones, moderation)
    await Notifications.setNotificationChannelAsync('content', {
      name: 'Content Updates',
      description: 'Milestones, content status, and moderation',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#fbbf24', // Gold for achievements
      sound: 'default',
    });

    logger.info('Android notification channels configured');
  } catch (error) {
    logger.error('Failed to set up Android channels', error);
  }
}

// =============================================================================
// Backend Token Registration
// =============================================================================

/**
 * Register push token with backend for the authenticated user.
 * Backend will use this to send push notifications to this device.
 */
export async function registerPushTokenWithBackend(token: string): Promise<boolean> {
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
      return true;
    }
    
    logger.warn('Backend rejected push token registration', response);
    return false;
  } catch (error) {
    logger.error('Failed to register push token with backend', error);
    return false;
  }
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

// =============================================================================
// Notification Preferences
// =============================================================================

/**
 * Get default notification preferences structure.
 */
export function getDefaultNotificationPreferences(): NotificationPreferences {
  const defaultTypePrefs: Record<NotificationPreferenceKey, boolean> = {
    likes: true,
    comments: true,
    commentReplies: true,
    mentions: true,
    newFollowers: true,
    tips: true,
    subscriptions: true,
    ppvPurchases: true,
    milestones: true,
    livestreamStart: true,
  };

  return {
    inAppEnabled: true,
    pushEnabled: true,
    inApp: { ...defaultTypePrefs },
    push: { ...defaultTypePrefs },
    quietHours: {
      enabled: false,
      start: 22, // 10 PM
      end: 7,    // 7 AM
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

/**
 * Update notification preferences on the backend.
 */
export async function updateNotificationPreferences(
  preferences: Partial<NotificationPreferences>
): Promise<boolean> {
  try {
    const response = await apiClient.post(
      '/user/update_profile',
      { notificationPreferences: JSON.stringify(preferences) },
      { isAuthRequired: true }
    );

    if (response?.success) {
      logger.info('Notification preferences updated');
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Failed to update notification preferences', error);
    return false;
  }
}

// =============================================================================
// Badge Management
// =============================================================================

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

// =============================================================================
// Notification Actions
// =============================================================================

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

// =============================================================================
// Local Notifications (for testing or offline features)
// =============================================================================

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

// =============================================================================
// Permission Check Utilities
// =============================================================================

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
  getDefaultNotificationPreferences,
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
