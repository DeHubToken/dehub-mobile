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
  /** Someone you follow spent a Signal Flare to point you at one post */
  SIGNAL_FLARE = 'signal_flare',
  NEW_MESSAGE = 'new_message',
  VIDEO_REMOVAL = 'video_removal',
  ACCOUNT_WARNING = 'account_warning',
  SYSTEM = 'system',
  FOLLOW_REQUEST = 'follow_request',
  FOLLOW_REQUEST_ACCEPTED = 'follow_request_accepted',
  FIAT_PAYMENT_COMPLETED = 'fiat_payment_completed',
  FRACTION_OFFER = 'fraction_offer',
  FRACTION_OFFER_ACCEPTED = 'fraction_offer_accepted',
  FRACTION_OFFER_REJECTED = 'fraction_offer_rejected',
  FRACTION_PURCHASED = 'fraction_purchased',
  /** Someone lent you their badge tier */
  BADGE_DELEGATED = 'badge_delegated',
  /** A badge loan ended — handed back, taken back, or lapsed */
  BADGE_DELEGATION_ENDED = 'badge_delegation_ended',
  /** The badge you are wearing on loan moved to a different tier */
  BADGE_DELEGATION_CHANGED = 'badge_delegation_changed',
  /** You climbed a rung of the badge ladder on your own balance */
  BADGE_TIER_UP = 'badge_tier_up',
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

/**
 * Badge lending. Every one of these opens the delegation panel in settings —
 * the only place a loan can be seen or ended — so they need neither a tokenId
 * nor an actor to be tappable.
 */
export const BADGE_DELEGATION_TYPES = new Set<string>([
  NotificationType.BADGE_DELEGATED,
  NotificationType.BADGE_DELEGATION_ENDED,
  NotificationType.BADGE_DELEGATION_CHANGED,
]);

/**
 * A rung climbed. Same problem as a loan — no tokenId, no actor, nothing the
 * default clickability test would pass it on — and a different destination:
 * the ladder itself, on the staking tab, where the rung above is drawn.
 */
export const BADGE_LADDER_TYPES = new Set<string>([
  NotificationType.BADGE_TIER_UP,
]);

export const getNotificationIconConfig = (type: NotificationType | string): { 
  name: string; 
  color: string;
} => {
  switch (type) {
    case NotificationType.LIKE:
      return { name: 'Heart', color: '#F4F4F5' };
    case NotificationType.DISLIKE:
      return { name: 'HeartOff', color: '#8B8D90' };
    case NotificationType.COMMENT:
    case NotificationType.COMMENT_REPLY:
      return { name: 'MessageSquareText', color: '#F4F4F5' };
    case NotificationType.COMMENT_LIKE:
      return { name: 'Heart', color: '#F4F4F5' };
    case NotificationType.REPOST:
      return { name: 'Repeat2', color: '#F4F4F5' };
    case NotificationType.QUOTE:
      return { name: 'Quote', color: '#D4D4D8' };
    case NotificationType.FOLLOWING:
      return { name: 'UserPlus', color: '#D4D4D8' };
    case NotificationType.FOLLOW_REQUEST:
      return { name: 'UserPlus', color: '#D4D4D8' };
    case NotificationType.FOLLOW_REQUEST_ACCEPTED:
      return { name: 'UserCheck', color: '#F4F4F5' };
    case NotificationType.MENTION:
      return { name: 'AtSign', color: '#D4D4D8' };
    case NotificationType.TIP:
      return { name: 'Gem', color: '#F4F4F5' };
    case NotificationType.SUBSCRIPTION:
      return { name: 'CircleCheck', color: '#D4D4D8' };
    case NotificationType.PPV_PURCHASE:
      return { name: 'LockOpen', color: '#D4D4D8' };
    case NotificationType.BOUNTY_AVAILABLE:
    case NotificationType.BOUNTY_CLAIMED:
      return { name: 'Gift', color: '#D4D4D8' };
    case NotificationType.VIDEO_MILESTONE:
      return { name: 'Trophy', color: '#D4D4D8' };
    case NotificationType.LIVESTREAM_START:
      return { name: 'Radio', color: '#F4F4F5' };
    case NotificationType.NEW_MESSAGE:
      return { name: 'Mail', color: '#F4F4F5' };
    case NotificationType.VIDEO_REMOVAL:
      return { name: 'CircleAlert', color: '#D4D4D8' };
    case NotificationType.ACCOUNT_WARNING:
      return { name: 'TriangleAlert', color: '#D4D4D8' };
    case NotificationType.SYSTEM:
      return { name: 'Info', color: '#8B8D90' };
    // A lent badge is still a badge — the same glyph whichever direction the
    // loan moved.
    case NotificationType.BADGE_DELEGATED:
    case NotificationType.BADGE_DELEGATION_ENDED:
    case NotificationType.BADGE_DELEGATION_CHANGED:
      return { name: 'Award', color: '#F4F4F5' };
    // Earned rather than lent, and the ladder is a climb — the trophy the
    // view milestones already use says that where a second Award would not.
    case NotificationType.BADGE_TIER_UP:
      return { name: 'Trophy', color: '#F4F4F5' };
    case NotificationType.FIAT_PAYMENT_COMPLETED:
      return { name: 'CreditCard', color: '#F4F4F5' };
    case NotificationType.FRACTION_OFFER:
    case NotificationType.FRACTION_OFFER_REJECTED:
      return { name: 'Store', color: '#D4D4D8' };
    case NotificationType.FRACTION_OFFER_ACCEPTED:
    case NotificationType.FRACTION_PURCHASED:
      return { name: 'Store', color: '#F4F4F5' };
    // Supabase-side bounty rows. Matched as strings because they are written by
    // a database trigger and have no entry in NotificationType.
    case 'work_application':
    case 'work_submission':
      return { name: 'Briefcase', color: '#D4D4D8' };
    default:
      return { name: 'Bell', color: '#9ca3af' };
  }
};
