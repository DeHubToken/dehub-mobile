import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from "../components/DeHubLoader";
import Animated from "react-native-reanimated";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import { CollapsibleHeader } from "../components/common/CollapsibleHeader";
import { useCollapsibleScreen } from "../hooks/useCollapsibleScreen";
import LeaderboardCategoryPills, {
  SortCategory,
  PillKey,
} from "../components/Leaderboard/LeaderboardCategoryPills";
import LeaderboardTimePills, { TimePeriod } from "../components/Leaderboard/LeaderboardTimePills";
import LeaderboardSearchBar from "../components/Leaderboard/LeaderboardSearchBar";
import LeaderboardRowItem, {
  LBRow,
} from "../components/Leaderboard/LeaderboardRow";
import LeaderboardSkeleton from "../components/Leaderboard/LeaderboardSkeleton";
import {
  getLeaderboard,
  refreshMyLeaderboardPosition,
  type LeaderboardUser,
} from "../services/leaderboard.service";
import { getAffiliateLeaderboard } from "../services/affiliate-leaderboard";
import { applyLeaderboardRules } from "../libs/leaderboard-rules";
import { getAvatarUrl } from "../libs/misc";
import { toastError, toastInfo, toastSuccess } from "../libs/toast";
import { theme } from "../theme";
import { useUser } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { ScreenNames } from "../navigation/ScreenNames";

// Fixed row height for getItemLayout: py-3.5 (14pt) either side of a 40pt avatar.
const ROW_HEIGHT = 68;
// Client-side cooldown on "Refresh my position"; the server holds a ten-minute one.
const REFRESH_ME_COOLDOWN_MS = 30_000;

type SortDirection = "desc" | "asc";

interface ListHeaderContentProps {
  sortCategory: SortCategory;
  onCategoryChange: (cat: PillKey) => void;
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  searchQuery: string;
  onSearchChange: (text: string) => void;
  onSearchFocus: () => void;
  sortDirection: SortDirection;
  onToggleDirection: () => void;
  onRefreshMe: () => void;
  refreshMeBusy: boolean;
  refreshMeCooldown: boolean;
  showRefreshMe: boolean;
}

const ListHeaderContent = React.memo<ListHeaderContentProps>(
  ({
    sortCategory,
    onCategoryChange,
    period,
    onPeriodChange,
    searchQuery,
    onSearchChange,
    onSearchFocus,
    sortDirection,
    onToggleDirection,
    onRefreshMe,
    refreshMeBusy,
    refreshMeCooldown,
    showRefreshMe,
  }) => {
    const { t } = useTranslation();
    const refreshDisabled = refreshMeBusy || refreshMeCooldown;
    return (
      <View>
        <LeaderboardCategoryPills active={sortCategory} onSelect={onCategoryChange} />
        <LeaderboardTimePills active={period} onSelect={onPeriodChange} />
        <LeaderboardSearchBar value={searchQuery} onChangeText={onSearchChange} onFocus={onSearchFocus} />
        <View className="mx-4 mb-2 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={onToggleDirection}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="flex-row items-center"
            accessibilityRole="button"
          >
            <Ionicons
              name={sortDirection === "desc" ? "arrow-down" : "arrow-up"}
              size={14}
              color={theme.colors.neutrals[400]}
              style={{ marginRight: 4 }}
            />
            <Text className="text-theme-neutrals-400 text-xs">
              {sortDirection === "desc" ? t("leaderboard.highestFirst") : t("leaderboard.lowestFirst")}
            </Text>
          </TouchableOpacity>
          {showRefreshMe ? (
            <TouchableOpacity
              onPress={onRefreshMe}
              disabled={refreshDisabled}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8 }}
              className={`flex-row items-center px-3 py-1.5 rounded-lg border border-theme-neutrals-600 ${
                refreshDisabled ? "opacity-50" : ""
              }`}
              accessibilityRole="button"
            >
              {refreshMeBusy ? (
                <ActivityIndicator size="small" color={theme.colors.neutrals[400]} style={{ marginRight: 6 }} />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color={theme.colors.neutrals[400]}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text className="text-theme-neutrals-300 text-xs font-medium">
                {refreshMeCooldown ? t("leaderboard.cooldownActive") : t("leaderboard.refreshPosition")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }
);

const toRow = (u: LeaderboardUser & { directReferrals?: number; secondaryReferrals?: number; rank?: number }): LBRow => ({
  rank: u.rank ?? 0,
  account: u.account,
  username: u.username || "",
  displayName: u.userDisplayName || u.username || "",
  avatarUrl: getAvatarUrl(u.avatarUrl, 40),
  total: u.total === null ? null : u.total ?? 0,
  sentTips: u.sentTips ?? 0,
  receivedTips: u.receivedTips ?? 0,
  followers: u.followers ?? 0,
  likes: u.likes ?? 0,
  subscribers: u.subscribers ?? 0,
  directReferrals: u.directReferrals,
  secondaryReferrals: u.secondaryReferrals,
  delta: u.delta,
  badgeBalance: u.badgeBalance,
  badgeLock: u.badgeLock,
  hideBadgeAndBalance: u.hideBadgeAndBalance,
});

const LeaderboardScreen = () => {
  const { t } = useTranslation();
  const { headerProps, listProps, refreshOffset, headerHeight, showHeader } = useCollapsibleScreen();
  const navigation = useNavigation<any>();
  const authUser = useUser();
  const { showUserProfile } = useUserProfileSheet();

  const [data, setData] = useState<LBRow[]>([]);
  const [loading, setLoading] = useState(true); // only for initial load
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [sortCategory, setSortCategory] = useState<SortCategory>("holdings");
  const [selectedPill, setSelectedPill] = useState<SortCategory>("holdings");
  const [period, setPeriod] = useState<TimePeriod>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [switching, setSwitching] = useState(false);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [refreshMeBusy, setRefreshMeBusy] = useState(false);
  const [refreshMeCooldown, setRefreshMeCooldown] = useState(false);
  const hasLoadedOnce = useRef(false);
  const pendingCategoryRef = useRef<SortCategory>("holdings");
  const pendingPeriodRef = useRef<TimePeriod>("all");
  // Only the newest request may commit; a slow earlier one must not overwrite it.
  const requestSeq = useRef(0);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(
    async (sort: SortCategory, nextPeriod: TimePeriod, opts: { isRefresh?: boolean; force?: boolean } = {}) => {
      const { isRefresh = false, force = false } = opts;
      const seq = ++requestSeq.current;
      // Only show skeleton on very first load
      if (!hasLoadedOnce.current && !isRefresh) setLoading(true);
      try {
        let entries: Array<LeaderboardUser & { directReferrals?: number; secondaryReferrals?: number }>;
        if (sort === "affiliates") {
          entries = await getAffiliateLeaderboard(nextPeriod);
        } else {
          const res = await getLeaderboard({ sort, period: nextPeriod, force });
          if (!res.success || !res.data?.result?.byWalletBalance) {
            throw new Error(res.error || "leaderboard-unavailable");
          }
          entries = res.data.result.byWalletBalance;
        }
        if (seq !== requestSeq.current) return;
        const ranked = applyLeaderboardRules(entries, { sort, period: nextPeriod });
        // Update data and filters together to prevent flash
        setData(ranked.map(toRow));
        setSortCategory(sort);
        setPeriod(nextPeriod);
        setError(false);
        hasLoadedOnce.current = true;
      } catch (err) {
        if (seq !== requestSeq.current) return;
        console.warn("[Leaderboard] load failed:", err);
        setError(true);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setRefreshing(false);
          setSwitching(false);
        }
      }
    },
    []
  );

  // On a failed switch, the committed category/period is what the list shows.
  useEffect(() => {
    if (!error) return;
    pendingCategoryRef.current = sortCategory;
    pendingPeriodRef.current = period;
    setSelectedPill(sortCategory);
    setSelectedPeriod(period);
  }, [error, sortCategory, period]);

  // Initial load
  useEffect(() => {
    loadData("holdings", "all");
  }, [loadData]);

  // Coming back to the tab re-reads the board; the two-minute memory cache in
  // the service keeps a quick tab flick from hitting the network.
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce.current) return;
      loadData(pendingCategoryRef.current, pendingPeriodRef.current, { isRefresh: true });
    }, [loadData])
  );

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    },
    []
  );

  const handleCategoryChange = useCallback(
    (cat: PillKey) => {
      // "Assets" is a jump to the Top 100 market table, not a leaderboard
      // sort — same behaviour as web's LeaderboardPage.
      if (cat === "assets") {
        navigation.navigate(ScreenNames.Top100);
        return;
      }
      if (cat === pendingCategoryRef.current && !error) return;
      pendingCategoryRef.current = cat;
      setSelectedPill(cat); // instant visual feedback on pills
      setSearchQuery("");
      setError(false);
      setSwitching(true);
      loadData(cat, pendingPeriodRef.current);
    },
    [loadData, navigation, error]
  );

  const handlePeriodChange = useCallback(
    (next: TimePeriod) => {
      if (next === pendingPeriodRef.current && !error) return;
      pendingPeriodRef.current = next;
      setSelectedPeriod(next);
      setError(false);
      setSwitching(true);
      loadData(pendingCategoryRef.current, next);
    },
    [loadData, error]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(sortCategory, period, { isRefresh: true, force: true });
  }, [loadData, sortCategory, period]);

  const handleRetry = useCallback(() => {
    setError(false);
    setSwitching(true);
    loadData(pendingCategoryRef.current, pendingPeriodRef.current, { force: true });
  }, [loadData]);

  const toggleDirection = useCallback(() => {
    setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
  }, []);

  const handleRefreshMe = useCallback(async () => {
    if (refreshMeBusy || refreshMeCooldown) return;
    if (!authUser?.walletAddress && !authUser?.address) {
      toastError(null, t("leaderboard.noWalletAddress"));
      return;
    }
    setRefreshMeBusy(true);
    try {
      const result = await refreshMyLeaderboardPosition();
      if (!result.success) {
        toastError(null, result.error || t("leaderboard.refreshFailed"));
        return;
      }
      const balance = (result.balance ?? 0).toLocaleString();
      if (result.added) {
        toastSuccess(t("leaderboard.addedToLeaderboard", { balance }));
      } else {
        toastInfo(result.reason || t("leaderboard.balanceTooLow", { balance }));
      }
      setRefreshMeCooldown(true);
      cooldownTimer.current = setTimeout(() => setRefreshMeCooldown(false), REFRESH_ME_COOLDOWN_MS);
      loadData(sortCategory, period, { isRefresh: true, force: true });
    } catch (err) {
      console.warn("[Leaderboard] refresh position failed:", err);
      toastError(null, t("leaderboard.refreshFailed"));
    } finally {
      setRefreshMeBusy(false);
    }
  }, [refreshMeBusy, refreshMeCooldown, authUser, t, loadData, sortCategory, period]);

  // Search thins the list and the toggle reverses it; neither renumbers —
  // `rank` was assigned once against the whole board.
  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? data.filter(
          (row) =>
            row.username.toLowerCase().includes(q) ||
            row.displayName.toLowerCase().includes(q) ||
            row.account.toLowerCase().includes(q)
        )
      : data;
    return sortDirection === "desc" ? list : [...list].reverse();
  }, [data, searchQuery, sortDirection]);

  const handlePressRow = useCallback(
    (username: string) => {
      if (!username) return;
      showUserProfile(username);
    },
    [showUserProfile]
  );

  const keyExtractor = useCallback((item: LBRow) => item.account, []);

  const renderItem: ListRenderItem<LBRow> = useCallback(
    ({ item }) => (
      <LeaderboardRowItem
        item={item}
        sort={sortCategory}
        period={period}
        onPress={handlePressRow}
      />
    ),
    [sortCategory, period, handlePressRow]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const renderEmpty = useCallback(
    () => (
      <View className="items-center px-6 py-12">
        <Text className="text-theme-neutrals-400 text-sm text-center">
          {data.length === 0 && period !== "all"
            ? t("leaderboard.noDataForPeriod")
            : t("leaderboard.noUsersFound")}
        </Text>
      </View>
    ),
    [data.length, period, t]
  );

  const renderListHeader = useCallback(
    () => (
      <ListHeaderContent
        sortCategory={selectedPill}
        onCategoryChange={handleCategoryChange}
        period={selectedPeriod}
        onPeriodChange={handlePeriodChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchFocus={showHeader}
        sortDirection={sortDirection}
        onToggleDirection={toggleDirection}
        onRefreshMe={handleRefreshMe}
        refreshMeBusy={refreshMeBusy}
        refreshMeCooldown={refreshMeCooldown}
        showRefreshMe={Boolean(authUser) && selectedPill === "holdings"}
      />
    ),
    [
      selectedPill,
      handleCategoryChange,
      selectedPeriod,
      handlePeriodChange,
      searchQuery,
      showHeader,
      sortDirection,
      toggleDirection,
      handleRefreshMe,
      refreshMeBusy,
      refreshMeCooldown,
      authUser,
    ]
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {loading && !refreshing ? (
        <View style={{ paddingTop: headerHeight }}>
          <LeaderboardSkeleton />
        </View>
      ) : switching ? (
        <View className="flex-1 items-center justify-center" style={{ paddingTop: headerHeight }}>
          <DeHubLoader size={56} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6" style={{ paddingTop: headerHeight }}>
          <Text className="text-theme-neutrals-300 text-sm text-center mb-4">
            {t("leaderboard.failedToLoad")}
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            activeOpacity={0.7}
            className="px-5 py-2.5 rounded-lg bg-white"
            accessibilityRole="button"
          >
            <Text className="text-theme-neutrals-900 text-sm font-semibold">{t("leaderboard.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.FlatList
          {...listProps()}
          data={filteredData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <DeHubRefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
              progressViewOffset={refreshOffset}
            />
          }
          initialNumToRender={20}
          windowSize={10}
          maxToRenderPerBatch={20}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
          getItemLayout={getItemLayout}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
      {/* Search box and category pills ride with the title bar, the way the
          Explore header does — they are chrome, not list content. Rendered
          after the list so it draws over it on Android. */}
      <CollapsibleHeader {...headerProps}>
        <ScreenHeader title={t("nav.leaderboard")} />
        <View className="bg-theme-neutrals-900">{renderListHeader()}</View>
      </CollapsibleHeader>
      <DeHubRefreshMark refreshing={refreshing} topInset={refreshOffset} />
    </View>
  );
};

export default LeaderboardScreen;
