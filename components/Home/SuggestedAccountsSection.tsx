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
 * Placed as a ListHeaderComponent inside InfiniteVideoFeed on the HomeScreen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, type ListRenderItem } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useTranslation } from "react-i18next";
import { getSuggestedAccounts, type SuggestedAccount } from "../../services/user.service";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import SuggestedAccountCard from "./SuggestedAccountCard";
import type { FollowState } from "../Search/SearchAccountChip";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE, MINIMAL_INSET } from "../../theme/minimal";

/**
 * The feed list's side padding (InfiniteVideoFeed's contentContainerStyle).
 * In minimal the section steps out over it, the same first guess FeedCard's
 * DEFAULT_LIST_GUTTER makes, so its hairline meets the posts' at both edges.
 */
const MINIMAL_LIST_GUTTER = 8;

/** Page size. Matches the web carousel so both rails page identically. */
const BATCH_SIZE = 10;

/** Stop after this many pages — the suggestion pool is not infinite. */
const MAX_PAGES = 10;

/** Pull the next page once the row is down to this many cards. */
const LOW_WATER_MARK = 3;

const SuggestedAccountsSection: React.FC = () => {
  const user = useUser() as { address?: string } | null;
  const { t } = useTranslation();
  const { isMinimal } = useAppTheme();
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  /** Addresses followed or dismissed this session — never shown again. */
  const [hiddenAddresses, setHiddenAddresses] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMore || pageRef.current >= MAX_PAGES) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const { items, hasMore: more } = await getSuggestedAccounts(BATCH_SIZE, nextPage);
      if (!mountedRef.current) return;
      pageRef.current = nextPage;
      setHasMore(more && nextPage < MAX_PAGES);
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
  }, [hasMore]);

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
  }, [visibleAccounts.length, hasMore, loadNextPage, user?.address]);

  const hide = useCallback((address: string) => {
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

  const handleFollowChange = useCallback(
    (address: string, newState: FollowState) => {
      // A landed follow (or a sent request on a private account) retires the
      // suggestion immediately; a failure puts it back.
      if (newState.isFollowing || newState.isFollowRequestPending) {
        hide(address);
      } else {
        unhide(address);
      }
    },
    [hide, unhide],
  );

  // While this carousel is scrolling it blocks Home's page-turn gesture, so a
  // sideways drag here scrolls the carousel instead of switching feed tabs.
  // Must stay above the early return below so hook order is stable.
  const scrollGuard = useHorizontalScrollGuard();

  const renderItem: ListRenderItem<SuggestedAccount> = useCallback(
    ({ item }) => (
      <SuggestedAccountCard
        account={item}
        onFollowChange={handleFollowChange}
        onDismiss={handleDismissCard}
      />
    ),
    [handleFollowChange, handleDismissCard],
  );

  const keyExtractor = useCallback((item: SuggestedAccount) => item.address, []);

  const handleEndReached = useCallback(() => {
    void loadNextPage();
  }, [loadNextPage]);

  if (dismissed) return null;
  if (visibleAccounts.length === 0) return null;

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
      contentContainerStyle={{ paddingHorizontal: isMinimal ? MINIMAL_INSET : 8 }}
    />
  );

  return (
    // Minimal: a feed row like the posts around it — no gap below, one
    // full-width hairline under it, and the header held at the 16pt text inset.
    <View
      className={isMinimal ? undefined : "mb-3"}
      style={isMinimal ? {
        marginHorizontal: -MINIMAL_LIST_GUTTER,
        paddingTop: 14,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: MINIMAL_HAIRLINE,
      } : undefined}
    >
      {/* Header row */}
      <View
        className="flex-row items-center justify-between px-2 mb-2.5"
        style={isMinimal ? { paddingHorizontal: MINIMAL_INSET } : undefined}
      >
        <Text className="text-white text-sm font-semibold">
          {t("profile.followSuggestions")}
        </Text>
        <TouchableOpacity
          onPress={handleDismissAll}
          activeOpacity={0.7}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Icon name="X" size={18} color="#6F7174" />
        </TouchableOpacity>
      </View>

      {/* Horizontal scroll */}
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{list}</GestureDetector> : list}
    </View>
  );
};

export default React.memo(SuggestedAccountsSection);
