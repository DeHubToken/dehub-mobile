type NotificationContent = {
  type: string;
  actorUsername?: string;
  actorAddress?: string;
  actor?: { displayName?: string; username?: string };
  content?: string;
  customReferenceTitle?: string;
  commentPreview?: string;
  commentId?: number | string;
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
    /** Where a mention was made: 'post', 'comment', 'live_chat' or 'public_chat'. */
    mentionContext?: string;
    [key: string]: unknown;
  };
};

/**
 * One grouped row per community chat (backend community-chat-notification.service.ts):
 * "James sent a message in X", "James and Charlie sent messages in X",
 * "James + 2 others sent messages in X". Whoever spoke first leads.
 */
function communityChatSentence(item: NotificationContent, t: (key: string, options?: any) => string): string | null {
  const meta = item.metadata as { senders?: { n: string }[]; senderCount?: number; communityName?: string } | undefined;
  const senders = meta?.senders || [];
  const name = senders[0]?.n || item.actorUsername || item.latestActorNames?.[0];
  if (!name) return null;
  const count = Math.max(meta?.senderCount || 0, senders.length, item.aggregatedCount || 0, 1);
  const community = meta?.communityName || '';
  if (count === 1) {
    return t('notifications.communityChatOne', { name, community, defaultValue: '{{name}} sent a message in {{community}}' });
  }
  if (count === 2) {
    const second = senders[1]?.n || item.latestActorNames?.[1] || '';
    return t('notifications.communityChatTwo', { name, second, community, defaultValue: '{{name}} and {{second}} sent messages in {{community}}' });
  }
  return t('notifications.communityChatMany', { name, others: count - 1, community, defaultValue: '{{name}} + {{others}} others sent messages in {{community}}' });
}

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
  // Losing the last rung is a different sentence, not the same one with an
  // empty tier in it — so the row carries no tier at all in that case, and
  // the absence is what picks the wording.
  if (item.type === 'badge_tier_down') {
    return item.metadata?.tier
      ? t('notifications.badgeTierDown', { tier: item.metadata.tier })
      : t('notifications.badgeTierLost');
  }
  if (item.type === 'community_chat') return communityChatSentence(item, t);
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
  if (item.type === 'work_application_reply') {
    const sentence = t('notifications.repliedComment', { name: actor });
    return item.customReferenceTitle ? `${sentence} “${item.customReferenceTitle}”` : sentence;
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
    const amount = item.amount
      ? ` ${item.currency && item.currency !== 'DHB' ? `${item.amount} ${item.currency}` : t('notifications.tokenAmount', { amount: item.amount })}`
      : '';
    return t('notifications.tippedYou', { name: actor }) + amount;
  }
  if (item.type === 'mention') {
    // Where the reader was named, as the web row says it.
    const where = item.metadata?.mentionContext;
    const mentionKey = where === 'live_chat'
      ? 'reactionInfo.mentionedYouLiveChat'
      : where === 'public_chat'
        ? 'reactionInfo.mentionedYouPublicChat'
        : where === 'comment' || item.commentId
          ? 'reactionInfo.mentionedYouComment'
          : 'reactionInfo.mentionedYouPost';
    return t(mentionKey, { name: actor });
  }
  const key = keys[item.type];
  return key ? t(key, { name: actor }) : null;
}
