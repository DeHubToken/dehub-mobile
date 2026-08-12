/**
 * Push Notifications Module
 * 
 * Exports all push notification related functionality.
 */
export {
  // Service functions
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
  // Types
  type NotificationPreferences,
  type NotificationPreferenceKey,
  type QuietHours,
  type PushTokenPayload,
  type NotificationData,
} from './push.service';

export { PushNotificationsProvider } from './PushNotificationsProvider';
