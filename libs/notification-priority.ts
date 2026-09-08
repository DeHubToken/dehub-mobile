export type NotificationSortMode = 'priority' | 'newest';
export type NotificationPriorityBand = 'action' | 'important' | 'new' | 'earlier';

export interface PrioritizableNotification {
  _id?: string;
  type: string;
  read?: boolean;
  createdAt: string;
}

const ACTION_TYPES = new Set([
  'account_warning', 'video_removal', 'follow_request', 'followRequest', 'follow-request',
  'fraction_sold', 'fraction_delivered', 'work_application', 'work_submission',
  'dao_vote_deadline', 'dao_payment_deadline', 'dao_payment_submitted',
  'stage_live', 'stage_reminder', 'livestream_start', 'bounty_available',
]);

const IMPORTANT_TYPES = new Set([
  'tip', 'bounty_claimed', 'subscription', 'ppv_purchase', 'store_order',
  'fraction_offer', 'fraction_offer_accepted', 'fraction_offer_rejected',
  'fraction_purchased', 'fraction_settled', 'comment_reply', 'mention',
  'community_mention', 'community_here', 'feature_request_reply',
  'feature_request_mention', 'signal_flare', 'fiat_payment_completed',
]);

const SOCIAL_TYPES = new Set([
  'comment', 'feature_request_comment', 'governance_comment', 'community_join',
  'following', 'follow_request_accepted', 'governance_vote',
]);

function typeWeight(type: string): number {
  if (ACTION_TYPES.has(type)) return 4_000;
  if (IMPORTANT_TYPES.has(type)) return 3_000;
  if (SOCIAL_TYPES.has(type)) return 2_000;
  return 1_000;
}

export function notificationPriorityScore(
  notification: PrioritizableNotification,
  now = Date.now(),
): number {
  const createdAt = new Date(notification.createdAt).getTime();
  const ageMinutes = Number.isFinite(createdAt)
    ? Math.max(0, Math.floor((now - createdAt) / 60_000))
    : 10_000;
  const freshness = Math.max(0, 999 - ageMinutes);
  return (notification.read ? 0 : 10_000) + typeWeight(notification.type) + freshness;
}

export function notificationPriorityBand(
  notification: PrioritizableNotification,
): NotificationPriorityBand {
  if (notification.read) return 'earlier';
  if (ACTION_TYPES.has(notification.type)) return 'action';
  if (IMPORTANT_TYPES.has(notification.type)) return 'important';
  return 'new';
}

export function sortNotifications<T extends PrioritizableNotification>(
  notifications: readonly T[],
  mode: NotificationSortMode,
  now = Date.now(),
): T[] {
  return [...notifications].sort((a, b) => {
    const dateDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (mode === 'newest') return dateDelta || String(a._id ?? '').localeCompare(String(b._id ?? ''));
    const scoreDelta = notificationPriorityScore(b, now) - notificationPriorityScore(a, now);
    return scoreDelta || dateDelta || String(a._id ?? '').localeCompare(String(b._id ?? ''));
  });
}
