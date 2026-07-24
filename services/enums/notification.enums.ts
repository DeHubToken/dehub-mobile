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
  FIAT_PAYMENT_COMPLETED = 'fiat_payment_completed',
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

export const PROFILE_NAVIGABLE_TYPES = new Set([
  NotificationType.FOLLOWING,
  NotificationType.SUBSCRIPTION,
  NotificationType.FOLLOW_REQUEST_ACCEPTED,
]);

export const LINK_TYPES = new Set([
  NotificationType.SYSTEM,
  NotificationType.ACCOUNT_WARNING,
  NotificationType.VIDEO_REMOVAL,
]);

export const NON_CLICKABLE_TYPES = new Set([
  NotificationType.DISLIKE,
]);

export const getNotificationIconConfig = (type: NotificationType | string): { 
  name: string; 
  color: string;
} => {
  switch (type) {
    case NotificationType.LIKE:
      return { name: 'Heart', color: '#ef4444' };
    case NotificationType.DISLIKE:
      return { name: 'HeartOff', color: '#6b7280' };
    case NotificationType.COMMENT:
    case NotificationType.COMMENT_REPLY:
      return { name: 'MessageSquareText', color: '#3b82f6' };
    case NotificationType.COMMENT_LIKE:
      return { name: 'Heart', color: '#f472b6' };
    case NotificationType.REPOST:
      return { name: 'Repeat2', color: '#22c55e' };
    case NotificationType.QUOTE:
      return { name: 'Quote', color: '#06b6d4' };
    case NotificationType.FOLLOWING:
      return { name: 'UserPlus', color: '#8b5cf6' };
    case NotificationType.FOLLOW_REQUEST:
      return { name: 'UserPlus', color: '#f59e0b' };
    case NotificationType.FOLLOW_REQUEST_ACCEPTED:
      return { name: 'UserCheck', color: '#22c55e' };
    case NotificationType.MENTION:
      return { name: 'AtSign', color: '#8b5cf6' };
    case NotificationType.TIP:
      return { name: 'Gem', color: '#22c55e' };
    case NotificationType.SUBSCRIPTION:
      return { name: 'CircleCheck', color: '#f59e0b' };
    case NotificationType.PPV_PURCHASE:
      return { name: 'LockOpen', color: '#06b6d4' };
    case NotificationType.BOUNTY_AVAILABLE:
    case NotificationType.BOUNTY_CLAIMED:
      return { name: 'Gift', color: '#f59e0b' };
    case NotificationType.VIDEO_MILESTONE:
      return { name: 'Trophy', color: '#fbbf24' };
    case NotificationType.LIVESTREAM_START:
      return { name: 'Radio', color: '#ef4444' };
    case NotificationType.NEW_MESSAGE:
      return { name: 'Mail', color: '#3b82f6' };
    case NotificationType.VIDEO_REMOVAL:
      return { name: 'AlertCircle', color: '#f97316' };
    case NotificationType.ACCOUNT_WARNING:
      return { name: 'AlertTriangle', color: '#f97316' };
    case NotificationType.SYSTEM:
      return { name: 'Info', color: '#6b7280' };
    case NotificationType.FIAT_PAYMENT_COMPLETED:
      return { name: 'CreditCard', color: '#22c55e' };
    default:
      return { name: 'Bell', color: '#9ca3af' };
  }
};
