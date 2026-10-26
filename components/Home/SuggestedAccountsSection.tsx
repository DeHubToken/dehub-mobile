/**
 * SuggestedAccountsSection – Horizontal carousel of suggested accounts.
 *
 * Fetches GET /suggested-accounts on mount, then renders only once data
 * arrives — no loading skeleton, no flash. Big-app pattern: invisible until ready.
 *
 * Follows behave the way they do on web: the card leaves the row the instant
 * the follow lands, and the rail pulls the next page in behind it — while
 * scrolling near the end, and whenever the remaining count drops low. The
 * previous version kept followed cards in place until every one of them was
 * followed and only then swapped the whole batch, so the row read as frozen
 * for most of the interaction.
 *
 * It never runs dry: the feed pages through everyone ranked by activity and
 * profile completeness, Explore by newest sign-up, empty profiles last, until
 * nobody is left.
 *
 * Built for following a run of people in a row: Follow says Following the
 * instant it is tapped, the card folds away a beat later and the next slides
 * into its place, while the request retries quietly behind it. Only a follow
 * that still fails comes back, with Retry on the notice.
 *
 * Placed as a ListHeaderComponent inside InfiniteVideoFeed on the HomeScreen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text, FlatList, TouchableOpacity, LayoutAnimation, Platform, UIManager, type ListRenderItem } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useHorizontalScrollGuard, useHorizontalSectionGuard } from "../../context/PagerGestureContext";
import { useTranslation } from "react-i18next";
import { getRankedSuggestions, getSuggestedAccounts, type SuggestedAccount } from "../../services/user.service";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import SuggestedAccountCard from "./SuggestedAccountCard";
import type { FollowState } from "../Search/SearchAccountChip";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE, MINIMAL_INSET } from "../../theme/minimal";
import { followUser } from "../../services/user.service";
import { isRateLimitError, notifyRateLimited } from "../../libs/error-feedback";
import { toastError } from "../../libs/toast";

/**
 * The feed list's side padding (InfiniteVideoFeed's contentContainerStyle).
 * In minimal the section steps out over it, the same first guess FeedCard's
 * DEFAULT_LIST_GUTTER makes, so its hairline meets the posts' at both edges.
 */
const MINIMAL_LIST_GUTTER = 8;
/** The hairline between posts on the system theme's home feed. */
const CINEMATIC_HAIRLINE = "rgba(255,255,255,0.12)";

/** Page size. Matches the web carousel so both rails page identically. */
const BATCH_SIZE = 10;

/** Pull the next page once the row is down to this many cards. */
const LOW_WATER_MARK = 5;

/** How long a followed card shows "Following" before it folds away. */
const FOLLOWED_LINGER_MS = 320;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** The fold: the card shrinks out and the rest of the row slides over. */
const FOLD_ANIMATION = LayoutAnimation.create(
  260,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

interface SuggestedAccountsSectionProps {
  /** Explore lists it among its sections: its own spacing, no feed hairlines. */
  surface?: "feed" | "explore";
}

const SuggestedAccountsSection: React.FC<SuggestedAccountsSectionProps> = ({ surface = "feed" }) => {
  const user = useUser() as { address?: string } | null;
  const { t } = useTranslation();
  const { isMinimal, theme, skin } = useAppTheme();
  // Immersive lays the home feed out as a cinematic list (FeedCard).
  const cinematic = surface === "feed" && !isMinimal && theme === "immersive" && !skin;
  const minimalRow = surface === "feed" && isMinimal;
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  /** Addresses followed or dismissed this session — never shown again. */
  const [hiddenAddresses, setHiddenAddresses] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const lingerTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const timers = lingerTimers.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      let items: SuggestedAccount[];
      let more: boolean;
      try {
        const page = await getRankedSuggestions(
          surface === "explore" ? "newest" : "active",
          cursorRef.current,
          BATCH_SIZE,
        );
        items = page.items;
        more = !!page.nextCursor;
        cursorRef.current = page.nextCursor;
      } catch {
        // A server without the ranked list yet still gets the old ten picks.
        items = nextPage === 1 ? (await getSuggestedAccounts(BATCH_SIZE, 1)).items : [];
        more = false;
      }
      if (!mountedRef.current) return;
      pageRef.current = nextPage;
      setHasMore(more);
      if (items.length > 0) {
        // The endpoint randomises, so the same account can arrive twice.
        setAccounts((prev) => {
          const seen = new Set(prev.map((a) => a.address?.toLowerCase()));
          const fresh = items.filter(
            (a) => a.address && !seen.has(a.address.toLowerCase()),
          );
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    } finally {
      loadingRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [hasMore, surface]);

  // First page, once authenticated.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!user?.address || fetchedRef.current) return;
    fetchedRef.current = true;
    void loadNextPage();
  }, [user?.address, loadNextPage]);

  const visibleAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.address && !hiddenAddresses.has(a.address.toLowerCase()),
      ),
    [accounts, hiddenAddresses],
  );

  // Top the row back up as it empties, so a run of quick follows never leaves
  // it short — the same low-water refill the web carousel runs.
  useEffect(() => {
    if (!user?.address) return;
    if (visibleAccounts.length < LOW_WATER_MARK && hasMore && !loadingRef.current) {
      void loadNextPage();
    }
  }, [visibleAccounts.length, hasMore, loadingMore, loadNextPage, user?.address]);

  // Cards in a row don't stretch to each other, so the mutual-friends line is
  // kept on every card when any card has one.
  const anyMutuals = useMemo(
    () => visibleAccounts.some((a) => (a.mutualConnections?.length ?? 0) > 0),
    [visibleAccounts],
  );

  const hide = useCallback((address: string) => {
    LayoutAnimation.configureNext(FOLD_ANIMATION);
    setHiddenAddresses((prev) => {
      const next = new Set(prev);
      next.add(address.toLowerCase());
      return next;
    });
  }, []);

  const unhide = useCallback((address: string) => {
    setHiddenAddresses((prev) => {
      if (!prev.has(address.toLowerCase())) return prev;
      const next = new Set(prev);
      next.delete(address.toLowerCase());
      return next;
    });
  }, []);

  const handleDismissCard = useCallback(
    (address: string) => {
      hide(address);
    },
    [hide],
  );

  const handleDismissAll = useCallback(() => {
    setDismissed(true);
  }, []);

  const retryFollowRef = useRef<(address: string, name: string) => void>(() => {});

  const handleFollowChange = useCallback(
    (address: string, newState: FollowState, failed?: unknown) => {
      // A landed follow (or a sent request on a private account) retires the
      // suggestion immediately; a failure puts it back.
      // The card says Following for a moment first, so the tap visibly lands.
      const key = address.toLowerCase();
      const pending = lingerTimers.current.get(key);
      if (pending) clearTimeout(pending);
      lingerTimers.current.delete(key);
      if (newState.isFollowing || newState.isFollowRequestPending) {
        lingerTimers.current.set(key, setTimeout(() => {
          lingerTimers.current.delete(key);
          if (mountedRef.current) hide(address);
        }, FOLLOWED_LINGER_MS));
      } else {
        unhide(address);
        if (failed !== undefined) {
          const account = accounts.find((a) => a.address?.toLowerCase() === key);
          const name = account?.displayName || account?.username || "";
          if (isRateLimitError(failed)) notifyRateLimited();
          toastError(null, t("copy.71d4aa07bfe1", { defaultValue: "Couldn't follow this account" }), {
            description: name || undefined,
            actionLabel: t("common.retry", { defaultValue: "Retry" }),
            onActionPress: () => retryFollowRef.current(address, name),
          });
        }
      }
    },
    [hide, unhide, accounts, t],
  );

  // Retry from the notice: the card leaves again straight away and the call
  // goes out once more; a second failure brings it back the same way.
  retryFollowRef.current = (address: string) => {
    if (!user?.address) return;
    hide(address);
    followUser(user.address, address).catch((error) => {
      const msg = String((error as { message?: unknown } | null)?.message ?? error).toLowerCase();
      if (msg.includes("already")) return;
      handleFollowChange(address, { isFollowing: false, isFollowRequestPending: false }, error);
    });
  };

  // While this carousel is scrolling it blocks Home's page-turn gesture, so a
  // sideways drag here scrolls the carousel instead of switching feed tabs.
  // Must stay above the early return below so hook order is stable.
  const scrollGuard = useHorizontalScrollGuard();
  const sectionGuard = useHorizontalSectionGuard(scrollGuard);

  const renderItem: ListRenderItem<SuggestedAccount> = useCallback(
    ({ item, index }) => (
      <SuggestedAccountCard
        account={item}
        onFollowChange={handleFollowChange}
        onDismiss={handleDismissCard}
        isLast={index === visibleAccounts.length - 1}
        reasonRow={anyMutuals}
      />
    ),
    [handleFollowChange, handleDismissCard, visibleAccounts.length, anyMutuals],
  );

  const keyExtractor = useCallback((item: SuggestedAccount) => item.address, []);

  const handleEndReached = useCallback(() => {
    void loadNextPage();
  }, [loadNextPage]);

  // With nothing to show, the cinematic feed still needs the line the post
  // above left out for this row.
  if (dismissed || visibleAccounts.length === 0) {
    return cinematic ? <View style={styles.lineOnly} /> : null;
  }

  const list = (
    <FlatList
      data={visibleAccounts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.6}
      contentContainerStyle={{ paddingHorizontal: isMinimal ? MINIMAL_INSET : cinematic ? 14 : surface === "explore" ? 16 : 8 }}
    />
  );

  const section = (
    // Minimal: a feed row like the posts around it — no gap below, one
    // full-width hairline under it, and the header held at the 16pt text inset.
    // System (the cinematic feed): the same, with the posts' 12pt rhythm and
    // their hairline. The post above it drops its own, so there is one line.
    <View
      collapsable={false}
      className={minimalRow || cinematic ? undefined : "mb-3"}
      style={[{ borderTopWidth: 0 }, minimalRow ? {
        marginHorizontal: -MINIMAL_LIST_GUTTER,
        paddingTop: 14,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: MINIMAL_HAIRLINE,
      } : cinematic ? {
        marginHorizontal: -MINIMAL_LIST_GUTTER,
        paddingTop: 12,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: CINEMATIC_HAIRLINE,
      } : { paddingVertical: surface === "explore" ? 4 : 12 }]}
    >
      {/* Header row */}
      <View
        className="flex-row items-center justify-between mb-3"
        style={{ paddingHorizontal: isMinimal ? MINIMAL_INSET : cinematic ? 14 : surface === "explore" ? 16 : 8 }}
      >
        <Text className="text-white font-bold" style={{ fontSize: 16, letterSpacing: -0.2 }}>
          {t("copy.036cfd952896", { defaultValue: "Who to follow" })}
        </Text>
        <TouchableOpacity
          onPress={handleDismissAll}
          activeOpacity={0.7}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Icon name="X" size={18} color={skin?.material === 'glass' ? '#B8D5D8' : '#6F7174'} />
        </TouchableOpacity>
      </View>

      {/* Horizontal scroll */}
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{list}</GestureDetector> : list}
    </View>
  );

  return sectionGuard ? <GestureDetector gesture={sectionGuard}>{section}</GestureDetector> : section;
};

export default React.memo(SuggestedAccountsSection);

const styles = StyleSheet.create({
  lineOnly: {
    marginHorizontal: -MINIMAL_LIST_GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CINEMATIC_HAIRLINE,
  },
});
