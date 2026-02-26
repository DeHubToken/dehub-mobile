/**
 * Notification Type Enums
 * Aligned with backend notification.enums.ts
 */

export enum NotificationType {
  LIKE = 'like',
  DISLIKE = 'dislike',
  COMMENT = 'comment',
  COMMENT_REPLY = 'comment_reply',
  COMMENT_LIKE = 'comment_like',
  REPOST = 'repost',
  QUOTE = 'quote',
  FOLLOWING = 'following',
  MENTION = 'mention',
  TIP = 'tip',
  SUBSCRIPTION = 'subscription',
  PPV_PURCHASE = 'ppv_purchase',
  BOUNTY_AVAILABLE = 'bounty_available',
  BOUNTY_CLAIMED = 'bounty_claimed',
  VIDEO_MILESTONE = 'video_milestone',
  LIVESTREAM_START = 'livestream_start',
  NEW_MESSAGE = 'new_message',
  VIDEO_REMOVAL = 'video_removal',
  ACCOUNT_WARNING = 'account_warning',
  SYSTEM = 'system',
  FOLLOW_REQUEST = 'follow_request',
  FOLLOW_REQUEST_ACCEPTED = 'follow_request_accepted',
}

export enum NotificationCategory {
  ENGAGEMENT = 'engagement',
  SOCIAL = 'social',
  MONETIZATION = 'monetization',
  CONTENT = 'content',
  MESSAGES = 'messages',
  SYSTEM = 'system',
}

export type PostType = 'video' | 'feed-images' | 'feed-simple' | 'live';

/**
 * Notification types that support navigation to content
 */
export const CONTENT_NAVIGABLE_TYPES = new Set([
  NotificationType.LIKE,
  NotificationType.COMMENT,
  NotificationType.COMMENT_REPLY,
  NotificationType.COMMENT_LIKE,
  NotificationType.REPOST,
  NotificationType.QUOTE,
  NotificationType.TIP,
  NotificationType.PPV_PURCHASE,
  NotificationType.BOUNTY_AVAILABLE,
  NotificationType.BOUNTY_CLAIMED,
  NotificationType.VIDEO_MILESTONE,
]);

/**
 * Notification types that open user profile
 */
export const PROFILE_NAVIGABLE_TYPES = new Set([
  NotificationType.FOLLOWING,
  NotificationType.SUBSCRIPTION,
  NotificationType.FOLLOW_REQUEST_ACCEPTED,
]);

/**
 * Notification types that may have external links
 */
export const LINK_TYPES = new Set([
  NotificationType.SYSTEM,
  NotificationType.ACCOUNT_WARNING,
  NotificationType.VIDEO_REMOVAL,
]);

/**
 * Notification types that are not clickable (just informational)
 */
export const NON_CLICKABLE_TYPES = new Set([
  NotificationType.DISLIKE,
]);

/**
 * Get notification icon configuration
 */
export const getNotificationIconConfig = (type: NotificationType | string): { 
  name: string; 
  color: string;
} => {
  switch (type) {
    case NotificationType.LIKE:
      return { name: 'heart', color: '#ef4444' };
    case NotificationType.DISLIKE:
      return { name: 'heart-dislike', color: '#6b7280' };
    case NotificationType.COMMENT:
    case NotificationType.COMMENT_REPLY:
      return { name: 'chatbubble', color: '#3b82f6' };
    case NotificationType.COMMENT_LIKE:
      return { name: 'heart', color: '#f472b6' };
    case NotificationType.REPOST:
      return { name: 'repeat', color: '#22c55e' };
    case NotificationType.QUOTE:
      return { name: 'chatbubble-ellipses', color: '#06b6d4' };
    case NotificationType.FOLLOWING:
      return { name: 'person-add', color: '#8b5cf6' };
    case NotificationType.FOLLOW_REQUEST:
      return { name: 'person-add', color: '#f59e0b' };
    case NotificationType.FOLLOW_REQUEST_ACCEPTED:
      return { name: 'checkmark-circle', color: '#22c55e' };
    case NotificationType.MENTION:
      return { name: 'at', color: '#8b5cf6' };
    case NotificationType.TIP:
      return { name: 'cash', color: '#22c55e' };
    case NotificationType.SUBSCRIPTION:
      return { name: 'checkmark-circle', color: '#f59e0b' };
    case NotificationType.PPV_PURCHASE:
      return { name: 'lock-open', color: '#06b6d4' };
    case NotificationType.BOUNTY_AVAILABLE:
    case NotificationType.BOUNTY_CLAIMED:
      return { name: 'gift', color: '#f59e0b' };
    case NotificationType.VIDEO_MILESTONE:
      return { name: 'trophy', color: '#fbbf24' };
    case NotificationType.LIVESTREAM_START:
      return { name: 'radio', color: '#ef4444' };
    case NotificationType.NEW_MESSAGE:
      return { name: 'mail', color: '#3b82f6' };
    case NotificationType.VIDEO_REMOVAL:
      return { name: 'alert-circle', color: '#f97316' };
    case NotificationType.ACCOUNT_WARNING:
      return { name: 'warning', color: '#f97316' };
    case NotificationType.SYSTEM:
      return { name: 'information-circle', color: '#6b7280' };
    default:
      return { name: 'notifications', color: '#9ca3af' };
  }
};
