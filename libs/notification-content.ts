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
};

/** Translate event wording at render time; leave names and custom messages intact. */
export function localizedNotificationContent(
  item: NotificationContent,
  t: (key: string, options?: any) => string,
): string | null {
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
  if (item.type === 'tip') {
    const amount = item.amount ? ` ${item.amount} ${item.currency || 'DHB'}` : '';
    return t('notifications.tippedYou', { name: actor }) + amount;
  }
  const key = keys[item.type];
  return key ? t(key, { name: actor }) : null;
}
