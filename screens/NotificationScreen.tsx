import SkeletonBlock from '../components/Feed/SkeletonBlock';
import { openChatMention } from "../libs/openChatMention";
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  UIManager,
  InteractionManager,
} from "react-native";

import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import Animated, {
  Easing,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { PageTabs, useFlatPage } from "../components/page/PageKit";
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  acceptFollowRequest,
  rejectFollowRequest,
  type NotificationItem,
  type NotificationCategory,
} from "../services/user.service";
import {
  fetchCustomNotifications,
  isCustomNotificationId,
  markCustomNotificationRead,
  markAllCustomNotificationsRead,
  type CustomNotificationItem,
} from "../libs/custom-notifications";
import { supabase } from "../services/supabase";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { localizedNotificationContent } from "../libs/notification-content";
import { formatShortAgo } from "../libs/date.util";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { seedUserProfileCache } from "../hooks/useUserProfileData";
import { buildCdnPath, getAvatarUrl, getBadgeUrlFor, getShortsThumbnailUrl, getBadgeOpticalStyle } from "../libs";
import { cdnImage } from "../libs/cdnImage";
import { addDismissedIds, getDismissedIds } from "../libs/notifications.dismissed";
import { openInApp } from "../libs/links.utils";
import { emitStageDeepLink } from "../libs/deeplink.events";
import { stageDeepLinkFor } from "../libs/stage-notifications";
import Avatar from "../components/common/Avatar";
import SmartImage from "../components/common/SmartImage";
import { reactionMeta } from "../libs/reactions";
import AppealSheet from "../components/Notifications/AppealSheet";
import QuickSettingsSheet from "../components/Notifications/QuickSettingsSheet";
import PageDrawer from "../components/common/PageDrawer";
import { createLogger } from "../libs/logger";
import { useWebSocketApi } from "../context/WebSocketContext";
import { orderNotificationTabKeys } from "../libs/notification-tab-order";
import {
  NotificationType,
  getNotificationIconConfig,
  NON_CLICKABLE_TYPES,
  BADGE_DELEGATION_TYPES,
  BADGE_LADDER_TYPES,
} from "../services/enums/notification.enums";
import { useAppTheme } from "../context/ThemeContext";
import { DhbCoin } from "../components/common/DhbCoin";
import {
  MINIMAL_HAIRLINE,
} from "../theme/minimal";

type NotificationTypeFilter = 'all' | 'likes' | 'follows' | 'comments' | 'reposts' | 'features' | 'communities' | 'stores' | 'subscriptions' | 'tips' | 'payments' | 'livestreams';

function hideDuplicateReplyMentions(items: NotificationItem[]): NotificationItem[] {
  const replies = new Set(
    items
      .filter((item) => item.type === NotificationType.COMMENT_REPLY && item.commentId && item.actorAddress)
      .map((item) => `${item.commentId}:${item.actorAddress!.toLowerCase()}`),
  );
  return items.filter((item) =>
    item.type !== NotificationType.MENTION ||
    !item.commentId ||
    !item.actorAddress ||
    !replies.has(`${item.commentId}:${item.actorAddress.toLowerCase()}`),
  );
}

// `label` is an i18n key: the screen is wired to i18next, and hardcoded tab
// names left 109 locales reading English here.
const TYPE_TABS: { key: NotificationTypeFilter; icon: string; label: string }[] = [
  { key: 'all', icon: 'Bell', label: "notifications.all" },
  { key: 'likes', icon: 'ThumbsUp', label: "notifications.reactions" },
  { key: 'follows', icon: 'UserPlus', label: "notifications.follows" },
  { key: 'comments', icon: 'MessageSquareText', label: "notifications.comments" },
  { key: 'reposts', icon: 'Repeat2', label: "notifications.reposts" },
  { key: 'features', icon: 'Lightbulb', label: "notifications.features" },
  { key: 'communities', icon: 'UsersRound', label: "nav.communities" },
  { key: 'stores', icon: 'Store', label: "notifications.stores" },
  { key: 'subscriptions', icon: 'Users', label: "notifications.subs" },
  { key: 'tips', icon: 'Gem', label: "notifications.tips" },
  { key: 'payments', icon: 'CreditCard', label: "notifications.payments" },
  { key: 'livestreams', icon: 'Zap', label: "notifications.live" },
];

/**
 * Newest first by the time the day headings read (a grouped row's updatedAt),
 * with unread rows on top under New. The feed arrives ordered by createdAt, so
 * a reaction group that picked up a like today sat among yesterday's rows and
 * the headings ran This week, Today, This week. `unread` is whether a row was
 * unread when it was listed, so opening one doesn't move it under you, not even
 * when the list refreshes on the way back from it.
 */
function byFeedGroup(items: NotificationItem[], unread: (n: NotificationItem) => boolean): NotificationItem[] {
  const at = (n: NotificationItem) => new Date(n.updatedAt || n.createdAt).getTime() || 0;
  return [...items].sort((a, b) => Number(unread(b)) - Number(unread(a)) || at(b) - at(a));
}

const FILTER_TYPE_MAP: Record<NotificationTypeFilter, NotificationType[]> = {
  all: [],
  likes: [
    NotificationType.LIKE,
    NotificationType.COMMENT_LIKE,
    ...(['feature_request_like', 'governance_vote'] as unknown as NotificationType[]),
  ],
  follows: [NotificationType.FOLLOWING, NotificationType.FOLLOW_REQUEST, NotificationType.FOLLOW_REQUEST_ACCEPTED],
  comments: [
    NotificationType.COMMENT,
    NotificationType.COMMENT_REPLY,
    NotificationType.MENTION,
    ...([
      'community_mention',
      'feature_request_comment',
      'feature_request_reply',
      'feature_request_mention',
      'governance_comment',
      'governance_reply',
      'work_application_reply',
    ] as unknown as NotificationType[]),
  ],
  reposts: [NotificationType.REPOST, NotificationType.QUOTE],
  // Same split as web's filterTypeMap: feature request and store/trade rows
  // get their own tabs instead of only showing under All.
  features: [
    ...(['feature_request_like', 'feature_request_comment', 'feature_request_reply', 'feature_request_mention'] as unknown as NotificationType[]),
  ],
  communities: [
    ...(['community_chat', 'community_join', 'community_mention', 'community_here'] as unknown as NotificationType[]),
  ],
  stores: [
    ...([
      'store_order',
      'fraction_offer', 'fraction_offer_accepted', 'fraction_offer_rejected',
      'fraction_purchased', 'fraction_sold', 'fraction_delivered', 'fraction_settled',
      'username_offer', 'username_offer_accepted', 'username_offer_declined',
    ] as unknown as NotificationType[]),
  ],
  subscriptions: [NotificationType.SUBSCRIPTION, NotificationType.PPV_PURCHASE],
  // work_application / work_submission are Supabase-side rows with no entry in
  // this enum — cast in rather than invented as enum members, so nothing else
  // can start believing the API knows about them.
  tips: [
    NotificationType.TIP,
    NotificationType.BOUNTY_AVAILABLE,
    NotificationType.BOUNTY_CLAIMED,
    ...(['work_application', 'work_submission'] as unknown as NotificationType[]),
  ],
  payments: [NotificationType.FIAT_PAYMENT_COMPLETED],
  livestreams: [
    NotificationType.LIVESTREAM_START,
    ...(['stage_live', 'stage_reminder'] as unknown as NotificationType[]),
  ],
};

/**
 * Types the API does not store, so it cannot filter on them. Sending one makes
 * the API drop the whole filter and answer with an unfiltered page, so they are
 * stripped before the request and matched client-side only.
 *
 * fiat_payment_completed exists in this app's enum but has no counterpart
 * server-side and nothing emits it, so the Payments tab stays empty until
 * something does.
 */
const CLIENT_ONLY_TYPES = new Set<string>([
  NotificationType.FIAT_PAYMENT_COMPLETED,
  // Supabase-side. Sending either to the API drops the whole filter and returns
  // an unfiltered page, which is exactly the bug this set exists to prevent.
  'work_application',
  'work_submission',
  'work_application_reply',
  'community_join',
  'community_mention',
  'community_here',
  'feature_request_like',
  'feature_request_comment',
  'feature_request_reply',
  'feature_request_mention',
  'governance_vote',
  'governance_comment',
  'governance_reply',
  'store_order',
  'fraction_sold',
  'fraction_delivered',
  'fraction_settled',
  'stage_live',
  'stage_reminder',
]);

/** The subset of a tab's types the API can filter on, or undefined for no server filter. */
function apiTypesForFilter(filter: NotificationTypeFilter): string[] | undefined {
  const types = FILTER_TYPE_MAP[filter].filter((t) => !CLIENT_ONLY_TYPES.has(t));
  return types.length ? types : undefined;
}

// Minimal swaps every filled chip and small button in a row for a 1px
// outline, so the only fill left on a row is the unread wash.
const MINIMAL_OUTLINE = {
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: MINIMAL_HAIRLINE,
} as const;

interface TypeTabsProps {
  selected: NotificationTypeFilter;
  onSelect: (filter: NotificationTypeFilter) => void;
  counts: Record<NotificationTypeFilter, number>;
  activityCounts: Record<NotificationTypeFilter, number>;
  actions?: React.ReactNode;
}

// Icon-only page-kit chips with the unread count beside the icon, as web's
// notifications strip draws them. The tab name is the chip's accessibility label.
const TypeTabs: React.FC<TypeTabsProps> = React.memo(({ selected, onSelect, counts, activityCounts, actions }) => {
  const { t } = useTranslation();
  const appTheme = useAppTheme() as ReturnType<typeof useAppTheme> & { accent?: unknown };
  const flatPage = useFlatPage();
  // Ink on the active chip, matching the page kit: white on the bright canvas
  // accents, near-black on white (System) and the rest.
  const activeInk =
    !flatPage && !!appTheme.accent && ["hazy", "swarms", "lavalamp", "island"].includes(appTheme.theme)
      ? "#FFFFFF"
      : "#0B0B0C";
  const orderedTabKeys = useMemo(
    () => orderNotificationTabKeys(TYPE_TABS.map(({ key }) => key), activityCounts, 'all'),
    [activityCounts],
  );

  return (
    <View>
      <PageTabs
        beforeTabs={actions}
        value={selected}
        onChange={onSelect}
        style={{ paddingBottom: 10 }}
        tabs={orderedTabKeys.map((tabKey) => {
          const tab = TYPE_TABS.find(({ key }) => key === tabKey)!;
          const isActive = selected === tab.key;
          const count = counts[tab.key];
          return {
            id: tab.key,
            label: '',
            icon: (
              <View
                accessible
                accessibilityLabel={t(tab.label)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: -6 }}
              >
                <Icon name={tab.icon as any} size={16} color={isActive ? activeInk : '#a1a1aa'} />
                {count > 0 ? (
                  <Text style={{ color: isActive ? activeInk : '#d4d4d8', fontSize: 12, fontWeight: '700' }}>
                    {count > 99 ? '99+' : count}
                  </Text>
                ) : null}
              </View>
            ),
          };
        })}
      />
    </View>
  );
});

// Monochrome constraint over the shared icon config: the per-type saturated
// tints bypass the monochrome system. Semantic color survives only where it
// means something — red for warnings/removals, green for money received.
const MONEY_RECEIVED_TYPES = new Set<string>([
  NotificationType.TIP,
  NotificationType.BOUNTY_CLAIMED,
  NotificationType.PPV_PURCHASE,
  NotificationType.FIAT_PAYMENT_COMPLETED,
]);
const WARNING_TYPES = new Set<string>([
  NotificationType.VIDEO_REMOVAL,
  NotificationType.ACCOUNT_WARNING,
]);
const MONO_ICON_COLORS = new Set(['#F4F4F5', '#D4D4D8']);

const getMonoIconConfig = (type: NotificationType | string): { name: string; color: string } => {
  const cfg = getNotificationIconConfig(type);
  if (WARNING_TYPES.has(type as string)) return { ...cfg, color: '#F4F4F5' };
  if (MONEY_RECEIVED_TYPES.has(type as string)) return { ...cfg, color: '#F4F4F5' };
  return MONO_ICON_COLORS.has(cfg.color) ? cfg : { ...cfg, color: '#D4D4D8' };
};

/**
 * Check if notification is clickable based on type and available data
 */
/**
 * Supabase-backed rows this screen knows how to open, beyond the bounty and
 * community ones handled just below. Each carries its destination in
 * `customReferenceId`: a feature request uuid, a proposal uuid, a stage's
 * short id or uuid, a post's token id.
 */
const SUPABASE_ROUTED_TYPES = new Set([
  'trench_price_alert',
  'feature_request_like',
  'feature_request_comment',
  'feature_request_reply',
  'feature_request_mention',
  'governance_vote',
  'governance_comment',
  'governance_reply',
  'stage_live',
  'stage_reminder',
  'fraction_settled',
  'miniapp',
]);

const isNotificationClickable = (notification: NotificationItem): boolean => {
  const type = notification.type as NotificationType;

  // Bounty rows carry job_number in customReferenceId, which is enough to open
  // the bounty — the uuid the detail screen wants is looked up on tap.
  const typeStr = notification.type as string;
  if (['work_application', 'work_submission', 'work_application_reply'].includes(typeStr)) {
    return !!(notification as CustomNotificationItem).customReferenceId;
  }

  // Community rows carry the community slug, which is all CommunityDetail
  // needs. Without this they fell through to the default below, counted as
  // clickable on the strength of the actor alone, and then did nothing.
  if (typeStr === 'community_join' || typeStr === 'community_mention' || typeStr === 'community_here') {
    return !!(notification as CustomNotificationItem).customReferenceId;
  }
  // Grouped chat rows come from the API and carry the community in metadata.
  if (typeStr === 'community_chat') return !!(notification as any).metadata?.communitySlug;

  // DAO rows open the DAO screen, as web's /dao does for a row with no id.
  // Mobile has no proposal view to take the id to yet.
  if (String(typeStr).startsWith('dao_')) return true;

  // Every other Supabase-backed row. They carry no tokenId, so the default at
  // the bottom of this function passed them on the strength of having an actor
  // — the row looked tappable and the switch below then navigated to a post
  // that does not exist. What they all do carry is the id of the thing they
  // are about, so that is the test.
  if (SUPABASE_ROUTED_TYPES.has(typeStr)) {
    return !!(notification as CustomNotificationItem).customReferenceId;
  }

  // Non-clickable types (dislike doesn't generate notifications but just in case)
  if (NON_CLICKABLE_TYPES.has(type)) return false;

  // Badge lending rows open settings, so they carry neither a tokenId nor
  // anything the default test below would pass them on.
  if (BADGE_DELEGATION_TYPES.has(typeStr)) return true;

  // Same shape, different page: a climb opens the ladder, not settings.
  if (BADGE_LADDER_TYPES.has(typeStr)) return true;
  
  // Follow request — handled via inline accept/reject buttons, not clickable to navigate
  if (type === NotificationType.FOLLOW_REQUEST) return false;

  // Follow request accepted — navigate to the requester's profile
  if (type === NotificationType.FOLLOW_REQUEST_ACCEPTED) {
    return !!(notification.actorAddress || notification.actorUsername);
  }

  // Following/Subscription - need actor info to show profile
  if (type === NotificationType.FOLLOWING || type === NotificationType.SUBSCRIPTION) {
    return !!(notification.actorAddress || notification.actorUsername);
  }
  
  // Content types - need tokenId
  if (type === NotificationType.LIKE ||
      type === NotificationType.COMMENT ||
      type === NotificationType.COMMENT_REPLY ||
      type === NotificationType.COMMENT_LIKE ||
      type === NotificationType.REPOST ||
      type === NotificationType.TIP ||
      type === NotificationType.PPV_PURCHASE ||
      type === NotificationType.BOUNTY_AVAILABLE ||
      type === NotificationType.BOUNTY_CLAIMED ||
      type === NotificationType.VIDEO_MILESTONE ||
      type === NotificationType.MENTION) {
    return !!notification.tokenId;
  }

  // Quote - clickable if has quoteTokenId or tokenId
  if (type === NotificationType.QUOTE) {
    return !!(notification.metadata?.quoteTokenId || notification.tokenId);
  }
  
  // Livestream - need tokenId
  if (type === NotificationType.LIVESTREAM_START) {
    return !!notification.tokenId;
  }
  
  // System notifications - not clickable unless they have external link
  if (type === NotificationType.SYSTEM || 
      type === NotificationType.VIDEO_REMOVAL || 
      type === NotificationType.ACCOUNT_WARNING) {
    return !!(notification.metadata?.articleUrl);
  }
  
  // Default: clickable if has tokenId or actor info
  return !!(notification.tokenId || notification.actorAddress || notification.actorUsername);
};

/** Rendered size of the row's post preview, in CSS points. */
const THUMB_PT = 44;

/**
 * The API sends `tokenThumbnail` as a CDN-relative path ("images/2008.jpg"),
 * which React Native's image loader cannot resolve — so the row painted an
 * empty tile with the play badge floating in it, which is the "sideways
 * triangle instead of a preview" this fixes. Web has always prefixed the CDN
 * origin here; this is that same rule, plus the resize every other image in
 * the app asks for.
 */
function resolveNotificationThumbnail(item: NotificationItem): string | undefined {
  const raw = item.tokenThumbnail?.trim();
  if (raw) {
    const absolute = /^https?:\/\//i.test(raw) ? raw : buildCdnPath(raw) ?? raw;
    return cdnImage(absolute, { width: THUMB_PT });
  }
  // Shorts carry no stored thumbnail path — their poster frame is derived from
  // the tokenId, the same way the feed builds it. Long-form video posts can't
  // be derived (the extension lives in the stored path), so they stay blank.
  if (item.postType === 'short' && item.tokenId != null) {
    return getShortsThumbnailUrl(item.tokenId, THUMB_PT);
  }
  return undefined;
}

// Motion for the per-row actions: the unread dot fades out, a cleared row
// slides and collapses.
const DOT_EXIT_DURATION = 220;
const CLEAR_DURATION = 260;
const ACTION_EASING = Easing.bezier(0.4, 0, 0.2, 1);

const CLEAR_HIT_SLOP = { top: 4, bottom: 10, left: 10, right: 10 };

/**
 * What the reader's notification filters held back. Reached only from
 * Settings → Notifications → Filter notifications from, so readers who never
 * use filters never see it on this screen. Rows draw exactly like the main
 * list's.
 */
function FilteredNotificationsSection({
  renderRow,
}: {
  renderRow: (info: { item: NotificationItem; index: number }) => React.ReactElement;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    if (!open || items) return;
    let live = true;
    getNotifications({ unreadOnly: false, filtered: true, page: 1, limit: 30 })
      .then((res: any) => {
        if (live) setItems(res?.data?.result || res?.result || []);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [open, items]);

  return (
    <View className="mt-2 border-t border-white/5" testID="filtered-notifications">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between px-4 py-4"
      >
        <View className="flex-row items-center">
          <Icon name="Funnel" size={16} color="#8B8D90" />
          <Text className="ml-2 text-theme-neutrals-400 text-sm">{t("notificationFilters.filteredTitle")}</Text>
        </View>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={16} color="#8B8D90" />
      </TouchableOpacity>
      {open &&
        (items === null ? (
          <View className="py-4 items-center">
            <ActivityIndicator size="small" color="#F4F4F5" />
          </View>
        ) : items.length === 0 ? (
          <Text className="px-4 pb-4 text-theme-neutrals-500 text-sm">{t("notificationFilters.filteredEmpty")}</Text>
        ) : (
          items.map((item) => <View key={item._id}>{renderRow({ item, index: -1 })}</View>)
        ))}
    </View>
  );
}

interface NotificationRowProps {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
  onMarkRead: (item: NotificationItem) => void;
  onClear: (item: NotificationItem) => void;
  onOpenProfile: (
    actorAddress?: string,
    actorUsername?: string,
    actor?: NotificationItem['actor'],
  ) => void;
  onAcceptFollowRequest: (item: NotificationItem) => void;
  onRejectFollowRequest: (item: NotificationItem) => void;
  /** Day heading drawn above this row when it starts a new group. */
  groupLabel?: string | null;
}

/** A row that stands for more than one person (likes, comments, follows...). */
const isGrouped = (item: NotificationItem) => (item.aggregatedCount ?? 1) > 1;

/** A follow row that stands for more than one new follower. */
const isGroupedFollow = (item: NotificationItem) =>
  (item.type as string) === NotificationType.FOLLOWING && isGrouped(item);

const NotificationRow: React.FC<NotificationRowProps> = React.memo(({
  item,
  onPress,
  onMarkRead,
  onClear,
  onOpenProfile,
  onAcceptFollowRequest,
  onRejectFollowRequest,
  groupLabel,
}) => {
  const { t } = useTranslation();
  const { isMinimal, skin, accent, pageColors } = useAppTheme();
  // Unread dot and primary pill: the theme's own colour on the canvas skins,
  // the page ink (white on System, black on System Light) everywhere else.
  const accentFill = skin ? `rgb(${accent.join(',')})` : undefined;
  // Written in dark-theme colours; System Light's tone pass turns them to ink.
  const dotColor = accentFill ?? '#F4F4F5';
  const badgeInk = '#F4F4F5';
  const icon = getMonoIconConfig(item.type);
  // Every positive reaction arrives as a `like`; show which one it was.
  // Absent on legacy rows and on aggregated rows whose actors disagreed —
  // the thumbs-up icon is right for both. The message text needs no special
  // casing: it comes from the server's pre-rendered `content`, which
  // already uses the reaction's verb ("Ada loved your post").
  const reactionGlyph =
    item.type === 'like' && item.reaction && item.reaction !== 'like'
      ? reactionMeta(item.reaction).emoji
      : null;
  const avatarUrl = getAvatarUrl(item.actorAvatar);
  const hasAvatar = !!item.actorAvatar &&
    item.type !== NotificationType.VIDEO_MILESTONE &&
    item.type !== NotificationType.VIDEO_REMOVAL &&
    item.type !== NotificationType.SYSTEM &&
    item.type !== NotificationType.ACCOUNT_WARNING;
  const sentence = localizedNotificationContent(item, t) ?? item.content;
  const actorName = item.actor?.displayName || item.actor?.username || item.actorUsername;
  const actorBadge = item.actor && !item.actor.hideBadgeAndBalance && !(item.aggregatedCount && item.aggregatedCount > 1)
    ? getBadgeUrlFor(item.actor)
    : undefined;
  const actorNameAt = actorName ? sentence.indexOf(actorName) : -1;
  const showActorBadge = !!actorBadge && actorNameAt >= 0 &&
    !/\w/.test(sentence.charAt(actorNameAt - 1)) &&
    !/\w/.test(sentence.charAt(actorNameAt + (actorName?.length || 0)));

  const clickable = isNotificationClickable(item);
  const thumbnail = useMemo(() => resolveNotificationThumbnail(item), [item]);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [marking, setMarking] = useState(false);

  // A decision someone can disagree with, as opposed to something that merely
  // happened. The two types notifyModerationAction sends.
  const isModerationDecision =
    (item.type as string) === NotificationType.VIDEO_REMOVAL ||
    (item.type as string) === NotificationType.ACCOUNT_WARNING;
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealRef, setAppealRef] = useState<string | null>(null);

  // Clear: the row slides out and collapses, then the parent drops it. maxHeight
  // rather than height so the resting style needs no measurement — 9999 does not
  // constrain a row, and the measured value is only used once the collapse runs.
  const clearing = useSharedValue(0);
  const collapse = useSharedValue(0);
  const measuredHeight = useSharedValue(0);
  // The collapse shrinks the view it is measured from, so the last natural
  // height has to be frozen before the animation starts or each layout pass
  // feeds a smaller height back in and the row snaps shut.
  const clearingRef = useRef(false);

  const finishClear = useCallback(() => onClear(item), [onClear, item]);
  const finishMarkRead = useCallback(() => onMarkRead(item), [onMarkRead, item]);

  const rowStyle = useAnimatedStyle(() => {
    const collapsing = clearing.value === 1;
    return {
      opacity: collapsing ? 1 - collapse.value : 1,
      transform: [{ translateX: collapsing ? collapse.value * 56 : 0 }],
      // 9999 at rest constrains nothing; the measured value only takes over
      // once the collapse runs.
      maxHeight: collapsing ? measuredHeight.value * (1 - collapse.value) : 9999,
    };
  });

  const clearIconStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${collapse.value * 90}deg` },
      { scale: 1 - collapse.value * 0.25 },
    ],
  }));

  const handleClear = useCallback(() => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    clearing.value = 1;
    collapse.value = withTiming(
      1,
      { duration: CLEAR_DURATION, easing: ACTION_EASING },
      (finished) => {
        if (finished) runOnJS(finishClear)();
      },
    );
  }, [clearing, collapse, finishClear]);

  // Mark as read: the unread dot shrinks away, then the row takes its read
  // styling.
  const markOpacity = useSharedValue(1);
  const markScale = useSharedValue(1);

  const markButtonStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));

  const handleMarkRead = useCallback(() => {
    if (marking) return;
    setMarking(true);
    markScale.value = withTiming(0.3, { duration: DOT_EXIT_DURATION, easing: ACTION_EASING });
    markOpacity.value = withTiming(0, { duration: DOT_EXIT_DURATION, easing: ACTION_EASING }, (finished) => {
      if (finished) runOnJS(finishMarkRead)();
    });
  }, [marking, markOpacity, markScale, finishMarkRead]);

  return (
    <>
    {!!groupLabel && (
      <Text
        className="text-theme-neutrals-500"
        style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4, fontSize: 12, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase' }}
      >
        {groupLabel}
      </Text>
    )}
    <Animated.View
      style={[{ overflow: 'hidden' }, rowStyle]}
      onLayout={(e) => {
        if (!clearingRef.current) measuredHeight.value = e.nativeEvent.layout.height;
      }}
    >
      <TouchableOpacity
        onPress={() => onPress(item)}
        disabled={!clickable}
        activeOpacity={0.5}
        // Clean feed: no fill and no separator. Unread is the dot on the left.
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingVertical: 12,
          paddingLeft: 18,
          paddingRight: 12,
        }}
      >
        {!item.read && (
          <TouchableOpacity
            onPress={handleMarkRead}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.markAsRead')}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 4 }}
            style={{ position: 'absolute', left: 0, top: 19, width: 18, height: 24, alignItems: 'center', justifyContent: 'center' }}
          >
            <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }, markButtonStyle]} />
          </TouchableOpacity>
        )}
        {/* Avatar or Icon — tap to open profile */}
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!item.actorUsername && !item.actorAddress}
          onPress={() => isGrouped(item) && clickable
            ? onPress(item)
            : onOpenProfile(item.actorAddress, item.actorUsername, item.actor)}
          style={{ position: 'relative' }}
        >
          {hasAvatar ? (
            <Avatar uri={avatarUrl || undefined} size={46} name={item.actorUsername} />
          ) : (
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${icon.color}20`,
              }}
            >
              {reactionGlyph ? (
                <Text style={{ fontSize: 20, lineHeight: 26 }}>{reactionGlyph}</Text>
              ) : (
                <Icon name={icon.name as any} size={22} color={icon.color} />
              )}
            </View>
          )}
          {/* Type badge overlay for avatar */}
          {hasAvatar && (
            <View
              style={{
                position: 'absolute',
                bottom: -3,
                right: -3,
                width: 20,
                height: 20,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: pageColors.background,
              }}
              className="bg-theme-neutrals-800"
            >
              {reactionGlyph ? (
                <Text style={{ fontSize: 12, lineHeight: 15 }}>{reactionGlyph}</Text>
              ) : (
                <Icon name={icon.name as any} size={10} color={badgeInk} />
              )}
            </View>
          )}
        </TouchableOpacity>

        {/* Content */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            className={!item.read ? 'text-theme-neutrals-100' : 'text-theme-neutrals-300'}
            style={{ fontSize: 14.5, lineHeight: 20 }}
            numberOfLines={3}
          >
            {showActorBadge ? <>{sentence.slice(0, actorNameAt)}{actorName}<SmartImage source={actorBadge!} style={getBadgeOpticalStyle(actorBadge!, 14, 0, 20)} />{sentence.slice(actorNameAt + actorName!.length)}</> : sentence}
            <Text className="text-theme-neutrals-500" style={{ fontSize: 13 }}>
              {' · '}{formatShortAgo(item.updatedAt || item.createdAt)}
            </Text>
          </Text>

          {/* Aggregation indicator */}
          {item.aggregatedCount && item.aggregatedCount > 1 && item.latestActorNames && (
            <Text className="text-theme-neutrals-500" style={{ fontSize: 13, marginTop: 2 }}>
              {item.latestActorNames.slice(0, 3).join(', ')}
              {item.aggregatedCount > 3 &&
                ` ${t('notifications.andNOthers', { count: item.aggregatedCount - 3 })}`}
            </Text>
          )}


          {/* Tip/Bounty amount badge */}
          {(item.type === NotificationType.TIP ||
            item.type === NotificationType.BOUNTY_CLAIMED ||
            item.type === NotificationType.PPV_PURCHASE) && item.amount && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <View style={[{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }, isMinimal && MINIMAL_OUTLINE]}>
                <Text style={{ color: '#F4F4F5', fontSize: 12, fontWeight: '600' }}>
                  +{item.amount} {item.currency && item.currency.toUpperCase() !== 'DHB' ? item.currency : <DhbCoin size={12} />}
                </Text>
              </View>
            </View>
          )}

          {/* Bounty available badge */}
          {item.type === NotificationType.BOUNTY_AVAILABLE && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <View style={[{ backgroundColor: 'rgba(255,255,255, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }, isMinimal && MINIMAL_OUTLINE]}>
                <Text style={{ color: '#D4D4D8', fontSize: 12, fontWeight: '600' }}>
                  {t('notifications.claimBounty')}
                </Text>
              </View>
            </View>
          )}

          {/* A moderation decision is the one notification a reader may
              actually disagree with. It used to end by asking them to email
              support; this files an appeal against the decision itself. */}
          {isModerationDecision && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
              {appealRef ? (
                <View style={[{ backgroundColor: '#27272a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, isMinimal && MINIMAL_OUTLINE]}>
                  <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '500' }}>
                    {t('moderation.appealSentRef', { defaultValue: 'Appeal sent · {{ref}}', ref: appealRef })}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAppealOpen(true)}
                  activeOpacity={0.85}
                  className="border-theme-neutrals-600"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1 }}
                >
                  <Icon name="Scale" size={13} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                    {t('moderation.appeal', 'Appeal')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Follow request accept/reject buttons */}
          {(item.type as string) === NotificationType.FOLLOW_REQUEST && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                onPress={() => onAcceptFollowRequest(item)}
                activeOpacity={0.85}
                // ~31pt tall pills; the slop brings them to a full target
                // without touching each other across the 8pt gap.
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                className={accentFill ? undefined : 'bg-theme-accent'}
                style={[{ height: 30, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 15 }, accentFill ? { backgroundColor: accentFill } : null]}
              >
                <Text className="text-theme-accent-foreground" style={[{ fontSize: 13, fontWeight: '600' }, accentFill ? { color: '#FFFFFF' } : null]}>
                  {t('settings.accept')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onRejectFollowRequest(item)}
                activeOpacity={0.85}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                className="border-theme-neutrals-600"
                style={{ height: 30, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 15, borderWidth: 1 }}
              >
                <Text className="text-theme-neutrals-100" style={{ fontSize: 13, fontWeight: '600' }}>
                  {t('settings.decline')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Thumbnail for content notifications. A source that 404s hides the
            whole tile — a play badge over nothing is what this looked like. */}
        {!!thumbnail && !thumbFailed && (
          <View style={{ marginLeft: 12 }}>
            <SmartImage
              source={{ uri: thumbnail }}
              style={{ width: THUMB_PT, height: THUMB_PT, borderRadius: 10, backgroundColor: '#18181B' }}
              contentFit="cover"
              recyclingKey={item._id}
              transition={120}
              onError={() => setThumbFailed(true)}
            />
            {(item.postType === 'video' || item.postType === 'short') && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 }}>
                  <Icon name="Play" size={12} color="white" fill="white" />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Clear this one away. Mark-as-read is the unread dot on the left. */}
        <TouchableOpacity
          onPress={handleClear}
          activeOpacity={0.7}
          hitSlop={{ ...CLEAR_HIT_SLOP, top: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.clearNotification')}
          style={{ marginLeft: 6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
        >
          <Animated.View style={clearIconStyle}>
            <View style={{ opacity: 0.45 }}><Icon name="X" size={14} color="#F4F4F5" /></View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>

      {isModerationDecision && (
        <AppealSheet
          visible={appealOpen}
          onClose={() => setAppealOpen(false)}
          notificationId={item._id}
          subject={item.tokenTitle ? `"${item.tokenTitle}"` : undefined}
          onFiled={setAppealRef}
        />
      )}
    </Animated.View>
    </>
  );
});

const log = createLogger("NotificationScreen");

// The last list this session painted, keyed by account. The screen is a
// stack route, so every open is a fresh mount, and until now every open began
// with eight skeleton rows and then swapped to the real list once the API
// answered — the "flash" on tapping the bell. Reopening now paints the
// previous rows at once and refreshes them in the background, the way the
// feeds behave. Only the unfiltered list is kept; the screen always opens
// on All.
let lastPainted: {
  wallet: string | null;
  notifications: NotificationItem[];
  countsSource: NotificationItem[];
} | null = null;

const NotificationScreen = () => {
  const { t } = useTranslation();
  const { isMinimal, pageColors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { patchUser } = useAuthActions();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const navigation = useNavigation<any>();
  // Settings → Notifications opens this screen with `filtered` to show what
  // the reader's filters held back; a plain open never shows that section.
  const showFiltered = useRoute<any>().params?.filtered === true;
  const { on: onSocketEvent } = useWebSocketApi();
  const { showUserProfile } = useUserProfileSheet();
  
  const walletAddress = user?.walletAddress || user?.address || null;
  // Read from the fire-and-forget callbacks below, which are deliberately
  // dependency-free so they stay stable across every render of the list.
  const walletAddressRef = useRef<string | null>(walletAddress);
  walletAddressRef.current = walletAddress;

  const cached = lastPainted && lastPainted.wallet === walletAddress ? lastPainted : null;
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => cached?.notifications ?? []);
  /**
   * Rows this device has cleared. The API has no delete endpoint, so a cleared
   * row is remembered here and filtered out — otherwise the next refetch would
   * hand every one of them straight back.
   */
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(!cached);
  // Set when a refresh fails with nothing on screen to fall back on. Until now
  // a failed fetch was a console.warn and an empty list that read as "No
  // notifications", which is a lie the person cannot act on.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<NotificationTypeFilter>('all');
  // Unfiltered snapshot kept alongside the (now server-filtered) list purely so
  // the tab badges and the app badge keep seeing every type.
  const [countsSource, setCountsSource] = useState<NotificationItem[]>(() => cached?.countsSource ?? []);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (loading || selectedFilter !== "all") return;
    lastPainted = { wallet: walletAddress, notifications, countsSource };
  }, [loading, selectedFilter, notifications, countsSource, walletAddress]);

  // Cleared rows are per account: two wallets on one phone must not inherit
  // each other's list.
  useEffect(() => {
    if (!walletAddress) {
      setDismissedIds(new Set());
      return;
    }
    let alive = true;
    getDismissedIds(walletAddress).then((ids) => {
      if (alive) setDismissedIds(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, [walletAddress]);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    const isFabric = (global as any)?.nativeFabricUIManager != null;
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental &&
      !isFabric
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Every post type goes to the post page, matching the push-tap handler. The
  // shorts viewer used to be seeded with a bare { tokenId } item, so the first
  // slide had no creator, no caption and zero counts.
  const navigateToFeed = useCallback((tokenId: number, commentId?: string, postType?: string) => {
    navigation.navigate(ScreenNames.FeedDetail, { tokenId, commentId, postType, overDrawer: true });
  }, [navigation]);

  const openUserProfile = useCallback((
    actorAddress?: string,
    actorUsername?: string,
    actor?: NotificationItem['actor'],
  ) => {
    const identifier = actorAddress || actorUsername;
    if (!identifier) return;
    if (actor) {
      seedUserProfileCache({
        ...actor,
        address: actor.address || actorAddress,
        username: actor.username || actorUsername,
        avatarImageUrl: actor.avatarImageUrl || undefined,
      }, actorAddress, actorUsername);
    }
    showUserProfile(identifier);
  }, [showUserProfile]);

  const navigateToLivestream = useCallback((tokenId?: number, streamId?: string) => {
    // A tokenId is the post, not the stream; the viewer looks the stream up.
    if (streamId) navigation.navigate(ScreenNames.LiveViewer, { streamId, ...(tokenId ? { tokenId } : {}) });
    else if (tokenId) navigation.navigate(ScreenNames.LiveViewer, { tokenId });
  }, [navigation]);

  const navigateToDM = useCallback((conversationId: string) => {
    navigation.navigate(ScreenNames.Chat, { conversationId });
  }, [navigation]);

  /**
   * Fire-and-forget mark as read
   */
  const markAsReadAsync = useCallback((notificationId: string) => {
    // Supabase-side rows are not in the DeHub API, so a PATCH there would 404
    // and the row would come back unread on the next refresh. The `custom_`
    // prefix is the only thing distinguishing them — see libs/custom-notifications.
    const mark = isCustomNotificationId(notificationId)
      ? markCustomNotificationRead(notificationId, walletAddressRef.current)
      : markNotificationAsRead(notificationId);
    mark.catch((e: unknown) => {
      log.error("markAsRead failed", e);
    });
  }, []);

  /**
   * Open a bounty from its job_number.
   *
   * WorkJobDetail is keyed on the row uuid, and the notification only carries
   * the human-facing number, so one lookup stands between the two. On failure
   * this falls back to the bounty list rather than leaving the tap inert.
   */
  const openBountyByNumber = useCallback(async (jobNumber: string | undefined) => {
    if (!jobNumber) return;
    try {
      const { data } = await supabase
        .from('work_jobs')
        .select('id')
        .eq('job_number', Number(jobNumber))
        .maybeSingle();
      const jobId = (data as { id?: string } | null)?.id;
      if (jobId) {
        navigation.navigate(ScreenNames.WorkJobDetail, { jobId });
        return;
      }
    } catch (e) {
      log.error("bounty lookup failed", e);
    }
    navigation.navigate(ScreenNames.Work);
  }, [navigation]);

  /**
   * Handle notification press - navigate immediately, mark read in background
   */
  const handleNotificationPress = useCallback((notification: NotificationItem) => {
    const { _id, type, postType, tokenId, actorAddress, actorUsername, commentId, metadata } = notification;
    
    // Check if clickable
    if (!isNotificationClickable(notification)) return;
    
    // Mark as read (fire and forget) - only if unread. The row and the badge
    // update once the page has slid in: re-rendering the list in the same
    // tick as the navigate made every tap stutter at the start of the slide.
    if (!notification.read) {
      InteractionManager.runAfterInteractions(() => {
        setNotifications((prev) =>
          prev.map((n) => (n._id === _id ? { ...n, read: true } : n))
        );
        // The app badge is derived from this snapshot by the effect below, so
        // marking the row read here is the whole update — no manual decrement to
        // race with it.
        setCountsSource((prev) =>
          prev.map((n) => (n._id === _id ? { ...n, read: true } : n))
        );
      });
      markAsReadAsync(_id);
    }

    // Navigate based on notification type
    switch (type as string) {
      case 'trench_price_alert':
        navigation.navigate(ScreenNames.ArcadeGame as never, {slug:'trenchstar',symbol:(notification as CustomNotificationItem).customReferenceTitle || 'BTC'} as never);
        break;
      // The row stores job_number (what web's canonical /bounty/<n> URL is
      // keyed on); this screen's route wants the uuid, so it is resolved on tap
      // rather than duplicated into the notification.
      case 'work_application':
      case 'work_submission':
      case 'work_application_reply':
        openBountyByNumber((notification as CustomNotificationItem).customReferenceId);
        break;

      // Community joins, @mentions and @here all land on the community they
      // came from; the row stores its slug, which is what the screen is keyed on.
      case 'community_chat': {
        const communitySlug = (notification as any).metadata?.communitySlug;
        if (communitySlug) navigation.navigate(ScreenNames.CommunityDetail as never, { slug: communitySlug, tab: 'chat' } as never);
        break;
      }

      case 'community_join':
      case 'community_mention':
      case 'community_here': {
        const communitySlug = (notification as CustomNotificationItem).customReferenceId;
        if (communitySlug) navigation.navigate(ScreenNames.CommunityDetail as never, { slug: communitySlug } as never);
        break;
      }

      // The board can't be relied on to be showing the request a row names —
      // it may be shipped, declined, filtered out or pages down — so the id
      // goes through and the screen pins that one request above the list.
      case 'feature_request_like':
      case 'feature_request_comment':
      case 'feature_request_reply':
      case 'feature_request_mention': {
        const custom = notification as CustomNotificationItem;
        if (!custom.customReferenceId) break;
        navigation.navigate(ScreenNames.FeatureRequests as never, {
          requestId: custom.customReferenceId,
          commentId: custom.customCommentId,
        } as never);
        break;
      }

      // Straight to the proposal. The board used to receive the id and read
      // it for nothing; a comment row also carries the comment it is about,
      // which the proposal screen opens and lights.
      case 'governance_vote':
      case 'governance_comment':
      case 'governance_reply': {
        const custom = notification as CustomNotificationItem;
        if (!custom.customReferenceId) break;
        navigation.navigate(ScreenNames.GovernanceProposal as never, {
          proposalId: custom.customReferenceId,
          commentId: custom.customCommentId,
        } as never);
        break;
      }

      // Stages are modals rather than routes, so they go through the same bus
      // an invite link uses. stageDeepLinkFor has been sitting unused since it
      // was written — this is the caller it was written for.
      case 'stage_live':
      case 'stage_reminder':
        emitStageDeepLink(stageDeepLinkFor((notification as CustomNotificationItem).customReferenceId));
        break;

      // A settled trade is informational and its reference is the post's token
      // id. The two rows that carry an obligation (fraction_sold /
      // fraction_delivered) keep their inline action and stay unrouted.
      // A mini app's notification opens the app, at the page it named if any.
      case 'miniapp': {
        const item = notification as CustomNotificationItem;
        if (!item.customReferenceId) break;
        navigation.navigate(ScreenNames.MiniApp as never, {
          slug: item.customReferenceId,
          from: 'notification',
          ...(item.customReferenceTitle ? { url: item.customReferenceTitle } : {}),
        } as never);
        break;
      }

      case 'fraction_settled': {
        const settledToken = Number((notification as CustomNotificationItem).customReferenceId);
        if (Number.isFinite(settledToken)) navigateToFeed(settledToken, undefined, postType);
        break;
      }

      // Several new followers in one row open the followers list with the new
      // ones marked, rather than one profile after another.
      case NotificationType.FOLLOWING:
        if (isGroupedFollow(notification) && (user?.address || notification.address)) {
          navigation.navigate(ScreenNames.FollowList, {
            address: user?.address || notification.address,
            username: user?.username,
            initialTab: 'followers',
            isOwnProfile: true,
            newCount: notification.aggregatedCount,
            newUsernames: notification.latestActorNames,
          });
          break;
        }
        openUserProfile(actorAddress, actorUsername, notification.actor);
        break;

      case NotificationType.SUBSCRIPTION:
      case NotificationType.FOLLOW_REQUEST_ACCEPTED:
        openUserProfile(actorAddress, actorUsername, notification.actor);
        break;

      case 'like':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'comment':
      case 'comment_reply':
      // "The creator replied to your comment" — sent instead of a plain reply.
      // It fell to the default below, which opened the post without the reply.
      case 'creator_comment_reply':
      case 'comment_like':
        if (tokenId) navigateToFeed(tokenId, commentId, postType);
        break;

      case 'repost':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'quote':
        if (metadata?.quoteTokenId) {
          navigateToFeed(metadata.quoteTokenId);
        } else if (tokenId) {
          navigateToFeed(tokenId, undefined, postType);
        }
        break;

      // A tip on a comment carries that comment, like a comment row does.
      case 'tip':
        if (tokenId) navigateToFeed(tokenId, commentId, postType);
        break;

      case 'ppv_purchase':
      case 'bounty_available':
      case 'bounty_claimed':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'video_milestone':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'livestream_start':
        if (tokenId) navigateToLivestream(tokenId, undefined);
        break;

      // A Signal Flare points at a POST. Routing it to the livestream player
      // — the obvious place to reuse, since it shares the preference toggle
      // server-side — lands the tap on nothing to watch.
      case 'signal_flare':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'new_message':
        if (metadata?.deepLink) {
          const match = metadata.deepLink.match(/\/dm\/(.+)/);
          if (match?.[1]) navigateToDM(match[1]);
        }
        break;

      case NotificationType.FIAT_PAYMENT_COMPLETED:
        navigation.navigate(ScreenNames.Dpay as never);
        break;

      // The delegation panel is the only surface a loan can be seen or ended
      // on, and it lives on the Assets tab of settings on both clients.
      case NotificationType.BADGE_DELEGATED:
      case NotificationType.BADGE_DELEGATION_ENDED:
      case NotificationType.BADGE_DELEGATION_CHANGED:
        navigation.navigate(ScreenNames.AccountSettings, { initialTab: 'assets' });
        break;

      // The ladder lives on the staking tab, with the next rung and its price
      // already on it — which settings, where the loans are, does not have.
      // Answering an offer and paying for an accepted one happen on the same
      // tab, so all three rows lead to it.
      case NotificationType.USERNAME_OFFER:
      case NotificationType.USERNAME_OFFER_ACCEPTED:
      case NotificationType.USERNAME_OFFER_DECLINED:
        navigation.navigate(ScreenNames.Usernames, { tab: 'offers' });
        break;

      case NotificationType.BADGE_TIER_UP:
      case NotificationType.BADGE_TIER_DOWN:
        navigation.navigate(
          ScreenNames.Dpay as never,
          { initialTab: "stake" } as never,
        );
        break;

      case 'video_removal':
      case 'account_warning':
      case 'system':
        if (metadata?.articleUrl) openInApp(metadata.articleUrl);
        break;

      case 'mention':
        // A tag in live or public chat opens that chat, not a post page.
        if (openChatMention(navigation.navigate as any, { mentionContext: metadata?.mentionContext, tokenId })) break;
        if (tokenId) navigateToFeed(tokenId, commentId, postType);
        break;

      default:
        // A case label cannot match a prefix, so every dao_* type lands here.
        if (String(type).startsWith('dao_')) {
          navigation.navigate(ScreenNames.Dao);
          break;
        }
        if (tokenId) navigateToFeed(tokenId, commentId, postType);
        break;
    }
  }, [
    navigateToFeed,
    openUserProfile,
    navigateToLivestream,
    navigateToDM,
    markAsReadAsync,
    openBountyByNumber,
    navigation,
    user?.address,
    user?.username,
  ]);

  const pageRef = useRef(1);
  const selectedFilterRef = useRef<NotificationTypeFilter>('all');
  
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  
  useEffect(() => {
    selectedFilterRef.current = selectedFilter;
  }, [selectedFilter]);

  // The list arrives already narrowed by the API. This pass still runs: it
  // covers the client-only types, and it keeps the tab correct against an API
  // that predates the `types` param.
  // Read state as of when each row was listed; see byFeedGroup.
  const listedUnreadRef = useRef(new Map<string, boolean>());
  const listedUnread = useCallback((n: NotificationItem) => listedUnreadRef.current.get(n._id) ?? !n.read, []);
  const filteredNotifications = useMemo(() => {
    const visible = dismissedIds.size
      ? notifications.filter((n) => !dismissedIds.has(n._id))
      : notifications;
    const unique = hideDuplicateReplyMentions(visible);
    if (selectedFilter === 'all') return byFeedGroup(unique, listedUnread);
    const allowedTypes = FILTER_TYPE_MAP[selectedFilter];
    return byFeedGroup(unique.filter((n) => allowedTypes.includes(n.type as NotificationType)), listedUnread);
  }, [notifications, selectedFilter, dismissedIds, listedUnread]);

  // Both badge sources — the tabs and the app icon — count what is still on
  // screen, so a cleared row stops being counted the moment it goes.
  const visibleCountsSource = useMemo(
    () => hideDuplicateReplyMentions(dismissedIds.size ? countsSource.filter((n) => !dismissedIds.has(n._id)) : countsSource),
    [countsSource, dismissedIds],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<NotificationTypeFilter, number> = {
      all: 0, likes: 0, follows: 0, comments: 0, features: 0, communities: 0, stores: 0,
      reposts: 0, subscriptions: 0, tips: 0, payments: 0, livestreams: 0,
    };
    const unread = visibleCountsSource.filter((n) => !n.read);
    counts.all = unread.length;
    for (const n of unread) {
      for (const [key, types] of Object.entries(FILTER_TYPE_MAP)) {
        if (key !== 'all' && types.includes(n.type as NotificationType)) {
          counts[key as NotificationTypeFilter]++;
        }
      }
    }
    return counts;
  }, [visibleCountsSource]);

  // Rank categories by the unread counts printed on the tabs. Historical read
  // rows must not outrank a category whose visible badge is larger.
  const tabActivityCounts = useMemo(() => {
    const counts: Record<NotificationTypeFilter, number> = {
      all: tabCounts.all, likes: 0, follows: 0, comments: 0, features: 0, communities: 0, stores: 0,
      reposts: 0, subscriptions: 0, tips: 0, payments: 0, livestreams: 0,
    };

    for (const notification of visibleCountsSource.filter((item) => !item.read)) {
      for (const [key, types] of Object.entries(FILTER_TYPE_MAP)) {
        if (key !== 'all' && types.includes(notification.type as NotificationType)) {
          counts[key as NotificationTypeFilter] += 1;
        }
      }
    }

    return counts;
  }, [visibleCountsSource, tabCounts.all]);

  // App badge follows the unfiltered snapshot, so selecting a tab no longer
  // rewrites it with just that tab's unread count.
  useEffect(() => {
    patchUser?.({ notificationCount: visibleCountsSource.filter((n) => !n.read).length });
    // patchUser is intentionally not a dependency: it is recreated on every
    // user patch, and depending on it would make this effect re-run its own
    // update forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsSource]);

  // Each fetch takes a generation number; a response only paints if its
  // generation is still the newest. Flicking through tabs fires overlapping
  // requests, and without this the slowest one wins — landing you on rows
  // from a tab you already left.
  const fetchGenRef = useRef(0);

  const fetchNotifications = useCallback(
    async (isRefresh = false, opts?: { skipCounts?: boolean }) => {
      const gen = ++fetchGenRef.current;
      try {
        const targetPage = isRefresh ? 1 : pageRef.current;
        const types = apiTypesForFilter(selectedFilterRef.current);

        // Ask for this tab's types rather than paging through everything and
        // narrowing in memory — that left a tab empty whenever its rows sat
        // past the loaded window.
        const listRequest = getNotifications({
          unreadOnly: false,
          types,
          page: targetPage,
          limit: 30,
        });
        // Start independent sources together. Counts never hold the list's
        // loading state open, and custom rows are reused for both snapshots.
        const customRequest = isRefresh
          ? fetchCustomNotifications(walletAddressRef.current).catch((error) => {
              log.error('Custom notifications refresh failed', error);
              return [];
            })
          : Promise.resolve([]);
        const countsRequest = isRefresh && !opts?.skipCounts && types
          ? getNotifications({ unreadOnly: false, page: 1, limit: 30 })
              .then((result: any) => result?.data?.result || result?.result || [])
              .catch((error) => { log.error('Notification counts refresh failed', error); return null; })
          : null;
        const [res, custom]: any = await Promise.all([listRequest, customRequest]);
        if (gen !== fetchGenRef.current) return;

        const apiPayload = res?.data?.result || res?.result || [];
        let payload = apiPayload;

        // Supabase-side rows (bounty applications, store orders, community
        // joins, stage alerts) are merged on refresh only. They are a single
        // recent page, not a paginated source, so folding them in again on
        // every "load more" would duplicate them down the list.
        if (isRefresh) {
          if (custom.length) {
            payload = [...payload, ...custom].sort(
              (a: NotificationItem, b: NotificationItem) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
          }
        }

        for (const n of payload as NotificationItem[]) {
          if (!listedUnreadRef.current.has(n._id)) listedUnreadRef.current.set(n._id, !n.read);
        }
        setLoadError(null);
        if (isRefresh) {
          setNotifications(payload);
          setPage(1);
        } else {
          setNotifications((prev) => [...prev, ...payload]);
        }

        // Measured on the API page alone. The merged Supabase rows are not
        // paginated, so counting them here would claim another page exists.
        setHasMore(apiPayload.length >= 30);
        setRefreshing(false);
        setLoading(false);
        setLoadingMore(false);

        if (isRefresh && !opts?.skipCounts) {
          // The tab badges and the app badge both need every type, so a
          // filtered refresh pulls one unfiltered page alongside it. On the All
          // tab the response we already have is that page. A tab switch skips
          // this: the snapshot is kept honest by every local mark-read/clear,
          // and it re-syncs on focus and pull-to-refresh.
          if (types) {
            const allPayload = await countsRequest;
            if (gen !== fetchGenRef.current) return;
            // The badge has to count the Supabase rows too, or the Tips tab
            // shows a bounty application it does not admit to having.
            if (allPayload) setCountsSource(custom.length ? [...allPayload, ...custom] : allPayload);
          } else {
            setCountsSource(payload);
          }
        }
      } catch (e) {
        log.error("fetch error", e, {
          phase: isRefresh ? "refresh" : "page",
          page: pageRef.current,
          filter: selectedFilterRef.current,
        });
        if (gen === fetchGenRef.current) {
          setLoadError((e as Error)?.message || "error");
          // Stop the list asking for the next page. onEndReached fires again
          // the moment loadingMore clears, and a failed page leaves the row
          // count unchanged — so with hasMore still true the page counter
          // walks up as fast as the API can refuse it, which is how one
          // rate-limited refresh turns into fifty. Retry goes through
          // onRefresh, which resets the page and clears the error.
          setHasMore(false);
        }
      } finally {
        if (gen === fetchGenRef.current) {
          setRefreshing(false);
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    []
  );

  // Store fetchNotifications in a ref to avoid dependency issues
  const fetchNotificationsRef = useRef(fetchNotifications);
  fetchNotificationsRef.current = fetchNotifications;

  useEffect(() => {
    if (!walletAddress) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshLiveList = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => fetchNotificationsRef.current(true), 150);
    };

    const unsubscribeSocket = onSocketEvent('notification', refreshLiveList);
    // A content-free ping the database sends whenever this wallet's
    // custom_notifications rows change; the list is re-read through the API.
    // Broadcast keeps no backlog, so every join re-reads as well.
    const channel = supabase
      .channel(`notif:${walletAddress.toLowerCase()}`, { config: { private: true } })
      .on('broadcast', { event: 'ping' }, refreshLiveList)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refreshLiveList(); });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribeSocket();
      void supabase.removeChannel(channel);
    };
  }, [onSocketEvent, walletAddress]);

  const hasFetchedRef = useRef(!!cached);

  useFocusEffect(
    useCallback(() => {
      // Only show skeleton on first load, not when returning from another screen
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        setLoading(true);
      }
      // Always refresh data in background
      fetchNotificationsRef.current(true);
    }, [])
  );

  const isFirstFilterRender = useRef(true);
  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      return;
    }
    // The filter is applied server-side now, so a tab change needs a refetch.
    // No loading gate here: the old rows clear immediately and the new tab's
    // rows land when the response does — the stale-response guard in
    // fetchNotifications makes rapid flicking land on the last tab tapped.
    // selectedFilterRef is updated by the effect above, which runs first — it
    // is declared earlier in the file, and React fires effects in declaration
    // order.
    setPage(1);
    // Show the skeleton while the new tab loads; emptying the list without it
    // flashed "No ... notifications yet" under a badge that said otherwise.
    setLoading(true);
    setNotifications([]);
    fetchNotificationsRef.current(true, { skipCounts: true });
  }, [selectedFilter]);

  useEffect(() => {
    if (page > 1) {
      setLoadingMore(true);
      fetchNotificationsRef.current(false);
    }
  }, [page]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchNotificationsRef.current(true);
  }, []);

  const onLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setPage((p) => p + 1);
  }, [loadingMore, hasMore]);

  const handleFilterChange = useCallback((filter: NotificationTypeFilter) => {
    setSelectedFilter(filter);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    // Keep the badge source in step, or the tab counts stay lit until the next
    // refresh even though the rows all show as read. The app badge follows from
    // this via the effect above.
    setCountsSource((prev) => prev.map((n) => ({ ...n, read: true })));

    markAllNotificationsAsRead().catch((e) => {
      log.error("markAllRead error", e);
    });
    // Supabase-side rows (stage alerts, community joins, store orders...) live
    // in their own table; without this they came back unread next launch.
    markAllCustomNotificationsRead(walletAddressRef.current).catch((e) => {
      log.error("markAllCustomRead error", e);
    });
  }, []);

  const handleAcceptFollowRequest = useCallback(async (notification: NotificationItem) => {
    const followId = notification.metadata?.followId;
    if (!followId) {
      log.warn("Missing followId in notification metadata");
      return;
    }
    // Optimistic: remove from list
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id));
    try {
      await acceptFollowRequest(followId);
      // Increment follower count
      const currentCount = user?.followers || 0;
      patchUser?.({ followers: currentCount + 1 });
    } catch (e) {
      log.error("acceptFollowRequest error", e);
      // Revert
      setNotifications((prev) => {
        const exists = prev.some((n) => n._id === notification._id);
        if (exists) return prev;
        return [notification, ...prev];
      });
    }
  }, [patchUser, user?.followers]);

  const handleRejectFollowRequest = useCallback(async (notification: NotificationItem) => {
    const followId = notification.metadata?.followId;
    if (!followId) {
      log.warn("Missing followId in notification metadata");
      return;
    }
    // Optimistic: remove from list
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id));
    try {
      await rejectFollowRequest(followId);
    } catch (e) {
      log.error("rejectFollowRequest error", e);
      // Revert
      setNotifications((prev) => {
        const exists = prev.some((n) => n._id === notification._id);
        if (exists) return prev;
        return [notification, ...prev];
      });
    }
  }, []);

  /** Per-row mark as read — the row's own button, not the header's mark-all. */
  const handleMarkRead = useCallback((notification: NotificationItem) => {
    if (notification.read) return;
    setNotifications((prev) =>
      prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
    );
    setCountsSource((prev) =>
      prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
    );
    markAsReadAsync(notification._id);
  }, [markAsReadAsync]);

  /**
   * Clear one row. `/notification` exposes PATCH (read) and mark-all-read and
   * nothing else, so there is no server-side delete to call: the row is marked
   * read — which keeps the badge honest on every device — and its id is
   * remembered locally so a refetch cannot resurrect it here.
   */
  const handleClearNotification = useCallback((notification: NotificationItem) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(notification._id);
      return next;
    });
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id));
    setCountsSource((prev) => prev.filter((n) => n._id !== notification._id));
    if (!notification.read) markAsReadAsync(notification._id);
    addDismissedIds(walletAddress, [notification._id]).catch((e) => {
      log.error("persist cleared notification failed", e);
    });
  }, [markAsReadAsync, walletAddress]);

  // Day headings, as on web: everything unread under New, the rest by when it
  // happened.
  const feedGroupOf = useCallback((n: NotificationItem): 'new' | 'today' | 'week' | 'earlier' => {
    if (listedUnread(n)) return 'new';
    const at = new Date(n.updatedAt || n.createdAt).getTime();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (at >= startOfToday.getTime()) return 'today';
    if (Date.now() - at < 7 * 86_400_000) return 'week';
    return 'earlier';
  }, [listedUnread]);
  const feedGroupLabel = useCallback((group: 'new' | 'today' | 'week' | 'earlier') =>
    group === 'new' ? t('notifications.groupNew', { defaultValue: 'New' })
      : group === 'today' ? t('notifications.groupToday', { defaultValue: 'Today' })
      : group === 'week' ? t('notifications.groupThisWeek', { defaultValue: 'This week' })
      : t('notifications.groupEarlier', { defaultValue: 'Earlier' }), [t]);

  // Clear all, as on web: everything read, then every row on screen dismissed
  // for this account (the same store the per-row clear uses).
  const handleClearAll = useCallback(() => {
    const ids = notifications.map((n) => n._id);
    if (!ids.length) return;
    handleMarkAllRead();
    setDismissedIds((prev) => new Set([...prev, ...ids]));
    setNotifications([]);
    setCountsSource([]);
    addDismissedIds(walletAddress, ids).catch((e) => {
      log.error("persist clear all failed", e);
    });
  }, [notifications, handleMarkAllRead, walletAddress]);

  const renderItem = useCallback(
    ({ item, index }: { item: NotificationItem; index: number }) => (
      <NotificationRow
        groupLabel={
          index === 0 || (index > 0 && feedGroupOf(filteredNotifications[index - 1] ?? item) !== feedGroupOf(item))
            ? feedGroupLabel(feedGroupOf(item))
            : null
        }
        item={item}
        onPress={handleNotificationPress}
        onMarkRead={handleMarkRead}
        onClear={handleClearNotification}
        onOpenProfile={openUserProfile}
        onAcceptFollowRequest={handleAcceptFollowRequest}
        onRejectFollowRequest={handleRejectFollowRequest}
      />
    ),
    [
      handleNotificationPress,
      handleMarkRead,
      handleClearNotification,
      handleAcceptFollowRequest,
      handleRejectFollowRequest,
      openUserProfile,
      filteredNotifications,
      feedGroupOf,
      feedGroupLabel,
    ]
  );

  const keyExtractor = useCallback((item: NotificationItem) => item._id, []);

  // Skeleton for loading state
  const skeletonData = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ key: `sk-${i}` })),
    []
  );
  
  const renderSkeleton = useCallback(
    () => (
      // Same clean feed spacing as the real rows.
      <View className="flex-row items-start" style={{ paddingVertical: 12, paddingLeft: 18, paddingRight: 12 }}>
        {/* Avatar with badge overlay */}
        <View className="relative">
          <SkeletonBlock className="w-11 h-11 rounded-md " />
          {/* Type badge */}
          <SkeletonBlock
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full "
            style={{ borderWidth: 2, borderColor: '#010305' }}
          />
        </View>
        
        {/* Content */}
        <View className="flex-1 ml-3">
          {/* Main text lines */}
          <SkeletonBlock className="w-full h-4 rounded" />
          <SkeletonBlock className="w-4/5 h-4 rounded mt-1.5" />
          <SkeletonBlock className="w-2/3 h-4 rounded mt-1.5" />
          {/* Timestamp */}
          <SkeletonBlock className="w-16 h-3 rounded mt-2" />
        </View>
      </View>
    ),
    []
  );

  // Footer for load more
  const ListFooter = useMemo(() => (
    <>
      {loadingMore ? (
        <View className="py-6 items-center">
          <ActivityIndicator size="small" color="#F4F4F5" />
        </View>
      ) : null}
      {walletAddress && showFiltered ? <FilteredNotificationsSection renderRow={renderItem} /> : null}
    </>
  ), [loadingMore, renderItem, walletAddress, showFiltered]);

  // Minimal: the empty-state icon sits bare on black, no tile behind it.
  const emptyIconTile = isMinimal
    ? "w-16 h-16 items-center justify-center mb-4"
    : "w-16 h-16 rounded-2xl bg-theme-neutrals-800 items-center justify-center mb-4";
  const ListEmpty = useMemo(() => {
    if (loadError) {
      return (
        <View className="flex-1 items-center justify-center py-20">
          <View className={emptyIconTile}>
            <Icon name="BellOff" size={32} color="#A1A1AA" />
          </View>
          <Text className="text-theme-neutrals-400 text-base font-medium mb-1">
            {t("notifications.loadFailed")}
          </Text>
          <TouchableOpacity onPress={onRefresh} className="mt-3 px-5 py-2 rounded-xl bg-theme-neutrals-800">
            <Text className="text-theme-neutrals-100 text-sm font-medium">{t("common.tryAgain")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center py-20">
        <View className="w-16 h-16 rounded-2xl bg-theme-neutrals-800 items-center justify-center mb-4">
          <Icon name="BellOff" size={32} color="#A1A1AA" />
        </View>
        <Text className="text-theme-neutrals-400 text-base font-medium mb-1">
          {t('notifications.noNotificationsYet')}
        </Text>
        <Text className="text-theme-neutrals-500 text-sm text-center px-8">
          {selectedFilter === 'all'
            ? t('notifications.noNotificationsDesc')
            : t('notifications.noneForFilter', {
                filter: t(
                  TYPE_TABS.find((tab) => tab.key === selectedFilter)?.label || selectedFilter,
                ).toLowerCase(),
              })}
        </Text>
      </View>
    );
  }, [loadError, selectedFilter, onRefresh, t, emptyIconTile]);

  // Opened cold from a push there may be nothing under the drawer to return to.
  const closeDrawer = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate(ScreenNames.Root);
  }, [navigation]);

  // Header with mark all read button
  const hasUnread = filteredNotifications.some((n) => !n.read);
  const showLoading = loading;

  // A drawer over the screen it was opened from, as phone web's bell drawer:
  // a handle, pull down to close, no back or close button.
  return (
    <PageDrawer
      onClose={closeDrawer}
      grab={
        <ScreenHeader
          icon="notifications"
          canGoBack={false}
          title={t("notifications.title")}
          rightContent={tabCounts.all > 0 ? (
            <Text style={{ color: pageColors.foreground, fontSize: 17, fontWeight: '500', fontVariant: ['tabular-nums'] }}>
              {tabCounts.all}
            </Text>
          ) : undefined}
          tabs={
            <TypeTabs
              selected={selectedFilter}
              onSelect={handleFilterChange}
              counts={tabCounts}
              activityCounts={tabActivityCounts}
              actions={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setQuickSettingsOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('notifications.settings')}
                  className="items-center justify-center bg-theme-neutrals-800"
                  style={{ width: 34, height: 34, borderRadius: 10 }}
                  hitSlop={{ top: 5, bottom: 5, left: 3, right: 3 }}
                >
                  <Icon name="SlidersHorizontal" size={18} color={pageColors.foreground} />
                </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMarkAllRead}
              disabled={!hasUnread}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.markAllRead')}
              accessibilityState={{ disabled: !hasUnread }}
              className="items-center justify-center bg-theme-neutrals-800"
              style={{ width: 34, height: 34, borderRadius: 10, opacity: hasUnread ? 1 : 0.45 }}
              hitSlop={{ top: 5, bottom: 5, left: 3, right: 3 }}
            >
              <Icon name="CheckCheck" size={18} color={pageColors.foreground} />
            </TouchableOpacity>
              </View>
              }
            />
          }
        />
      }
    >
      
      {showLoading ? (
        <FlatList
          data={skeletonData}
          keyExtractor={(item) => item.key}
          renderItem={renderSkeleton}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          refreshControl={
            <DeHubRefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#F4F4F5"
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          // Rows are a small avatar and two lines, so they batch cheaply.
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={9}
          updateCellsBatchingPeriod={60}
          // No removeClippedSubviews: every row is a Reanimated view with its own
          // animated style, and Android detaching and re-attaching those mid-fling
          // is the jitter people saw. windowSize above still unmounts distant rows.
          // Omitting the prop is NOT off: RN defaults it to true on Android.
          removeClippedSubviews={false}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
          showsVerticalScrollIndicator={false}
        />
      )}
      <DeHubRefreshMark refreshing={refreshing} />
      <QuickSettingsSheet
        visible={quickSettingsOpen}
        onClose={() => setQuickSettingsOpen(false)}
        hasUnread={hasUnread}
        onMarkAllRead={handleMarkAllRead}
        onClearAll={handleClearAll}
        onOpenAllSettings={() => navigation.navigate(ScreenNames.NotificationSettings)}
      />
    </PageDrawer>
  );
};

export default NotificationScreen;
