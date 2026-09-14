type NotificationContent = {
  type: string;
  actorUsername?: string;
  actorAddress?: string;
  actor?: { displayName?: string; username?: string };
  content?: string;
  commentPreview?: string;
  reaction?: string;
  amount?: number;
  currency?: string;
  aggregatedCount?: number;
  latestActorNames?: string[];
  /**
   * Badge lending rows carry the loan itself here: which tier was lent, which
   * end of it the reader was on, and why it ended. The tier has to come off the
   * row rather than off the account — the sentence has to keep saying what was
   * lent long after the loan ended and the balance moved on.
   */
  metadata?: {
    tier?: string;
    previousTier?: string;
    role?: 'grantor' | 'grantee';
    reason?: string;
    [key: string]: unknown;
  };
};

/** Translate event wording at render time; leave names and custom messages intact. */
export function localizedNotificationContent(
  item: NotificationContent,
  t: (key: string, options?: any) => string,
): string | null {
  // Climbing a rung has no actor — nobody did it to the reader — so it is
  // answered above the guard below, which exists to hand anything without a
  // name back to the server's own English sentence.
  if (item.type === 'badge_tier_up') {
    return t('notifications.badgeTierUp', {
      tier: item.metadata?.tier || t('notifications.badgeGenericTier'),
    });
  }
  const name = item.actor?.displayName || item.actorUsername || item.actor?.username || item.latestActorNames?.[0] || item.actorAddress;
  if (!name) return null;
  const count = item.aggregatedCount ?? 1;
  const multipleActors = count > 1 && (item.type === 'following' || new Set(item.latestActorNames).size > 1);
  const actor = multipleActors
    ? `${name}, ${t('notifications.nOthers', { count: count - 1 })}`
    : name;
  if (count > 1 && !multipleActors && item.type === 'like') {
    return t('notifications.likedPosts', { name, count });
  }
  if (item.type === 'comment_like' && item.commentPreview) {
    return t('notifications.likedCommentPreview', { name: actor, preview: item.commentPreview });
  }
  if (item.type === 'following' && item.content?.toLowerCase().includes('requested')) {
    return t('reactionInfo.followRequest', { name: actor });
  }
  const keys: Record<string, string> = {
    like: 'reactionInfo.reactedPost',
    comment: 'notifications.commentedPost',
    comment_reply: 'notifications.repliedComment',
    comment_like: 'notifications.likedComment',
    following: 'notifications.startedFollowing',
    subscription: 'notifications.subscribedPlan',
    ppv_purchase: 'notifications.purchasedContent',
    livestream_start: 'notifications.startedStreaming',
    repost: 'reactionInfo.repostedPost',
    quote: 'reactionInfo.quotedPost',
    mention: 'reactionInfo.mentionedYou',
    follow_request: 'reactionInfo.followRequest',
    follow_request_accepted: 'reactionInfo.followAccepted',
    signal_flare: 'reactionInfo.signalFlare',
  };
  // Badge lending. Four sentences from three types, because one of them — a
  // loan ending — is the same event read from opposite ends, and a loan that
  // lapsed on a sell-down was nobody's decision to explain.
  if (item.type.startsWith('badge_deleg')) {
    const tier = item.metadata?.tier || t('notifications.badgeGenericTier');
    if (item.type === 'badge_delegated') return t('notifications.badgeLent', { name: actor, tier });
    if (item.type === 'badge_delegation_changed') {
      return t('notifications.badgeLoanRetiered', { name: actor, tier });
    }
    const lapsed = item.metadata?.reason === 'slots' || item.metadata?.reason === 'unbadged';
    if (item.metadata?.role === 'grantor') {
      return lapsed
        ? t('notifications.badgeLoanDropped', { name: actor, tier })
        : t('notifications.badgeHandedBack', { name: actor, tier });
    }
    return lapsed
      ? t('notifications.badgeLoanLapsed', { name: actor, tier })
      : t('notifications.badgeTakenBack', { name: actor, tier });
  }
  if (item.type === 'tip') {
    const amount = item.amount ? ` ${item.amount} ${item.currency || 'DHB'}` : '';
    return t('notifications.tippedYou', { name: actor }) + amount;
  }
  const key = keys[item.type];
  return key ? t(key, { name: actor }) : null;
}
