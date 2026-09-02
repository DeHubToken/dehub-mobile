import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  RefreshControl,
  ListRenderItem,
  ActivityIndicator,
} from "react-native";
import Animated from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import { CollapsibleHeader } from "../components/common/CollapsibleHeader";
import { useCollapsibleScreen } from "../hooks/useCollapsibleScreen";
import LeaderboardCategoryPills, {
  SortCategory,
  PillKey,
} from "../components/Leaderboard/LeaderboardCategoryPills";
import LeaderboardSearchBar from "../components/Leaderboard/LeaderboardSearchBar";
import LeaderboardRowItem, {
  LBRow,
} from "../components/Leaderboard/LeaderboardRow";
import LeaderboardSkeleton from "../components/Leaderboard/LeaderboardSkeleton";
import { getLeaderboard } from "../services/leaderboard.service";
import { getAvatarUrl } from "../libs/misc";
import { useUser } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { ScreenNames } from "../navigation/ScreenNames";

// Approximate fixed row height for getItemLayout optimization
const ROW_HEIGHT = 64;

interface ListHeaderContentProps {
  sortCategory: SortCategory;
  onCategoryChange: (cat: PillKey) => void;
  searchQuery: string;
  onSearchChange: (text: string) => void;
  onSearchFocus: () => void;
}

const ListHeaderContent = React.memo<ListHeaderContentProps>(
  ({ sortCategory, onCategoryChange, searchQuery, onSearchChange, onSearchFocus }) => (
    <View>
      <LeaderboardCategoryPills active={sortCategory} onSelect={onCategoryChange} />
      <LeaderboardSearchBar value={searchQuery} onChangeText={onSearchChange} onFocus={onSearchFocus} />
    </View>
  )
);

const LeaderboardScreen = () => {
  const { t } = useTranslation();
  const { headerProps, listProps, refreshOffset, headerHeight, showHeader } = useCollapsibleScreen();
  const navigation = useNavigation<any>();
  const authUser = useUser();
  const { showUserProfile } = useUserProfileSheet();

  const [data, setData] = useState<LBRow[]>([]);
  const [loading, setLoading] = useState(true); // only for initial load
  const [refreshing, setRefreshing] = useState(false);
  const [sortCategory, setSortCategory] = useState<SortCategory>("holdings");
  const [selectedPill, setSelectedPill] = useState<SortCategory>("holdings");
  const [searchQuery, setSearchQuery] = useState("");
  const [switching, setSwitching] = useState(false);
  const hasLoadedOnce = useRef(false);
  const pendingCategoryRef = useRef<SortCategory>("holdings");

  const loadData = useCallback(
    async (sort: SortCategory, isRefresh = false) => {
      // Only show skeleton on very first load
      if (!hasLoadedOnce.current && !isRefresh) setLoading(true);
      try {
        const res = await getLeaderboard({ sort });
        if (res.success && res.data?.result?.byWalletBalance) {
          const rows: LBRow[] = res.data.result.byWalletBalance.map(
            (u, index) => ({
              rank: index + 1,
              account: u.account,
              username: u.username || "",
              displayName: u.userDisplayName || u.username || "",
              avatarUrl: getAvatarUrl(u.avatarUrl),
              total: u.total ?? 0,
              sentTips: u.sentTips ?? 0,
              receivedTips: u.receivedTips ?? 0,
              followers: u.followers ?? 0,
              likes: u.likes ?? 0,
            })
          );
          // Update data and sort category together to prevent flash
          setData(rows);
          setSortCategory(sort);
          hasLoadedOnce.current = true;
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setSwitching(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    loadData("holdings");
  }, [loadData]);

  const handleCategoryChange = useCallback(
    (cat: PillKey) => {
      // "Assets" is a jump to the Top 100 market table, not a leaderboard
      // sort — same behaviour as web's LeaderboardPage.
      if (cat === "assets") {
        navigation.navigate(ScreenNames.Top100);
        return;
      }
      if (cat === pendingCategoryRef.current) return;
      pendingCategoryRef.current = cat;
      setSelectedPill(cat); // instant visual feedback on pills
      setSearchQuery("");
      setSwitching(true);
      loadData(cat);
    },
    [loadData, navigation]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(sortCategory, true);
  }, [loadData, sortCategory]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data
      .filter(
        (row) =>
          row.username.toLowerCase().includes(q) ||
          row.displayName.toLowerCase().includes(q) ||
          row.account.toLowerCase().includes(q)
      )
      .map((row, idx) => ({ ...row, rank: idx + 1 }));
  }, [data, searchQuery]);

  const handlePressRow = useCallback(
    (username: string) => {
      if (!username) return;
      showUserProfile(username);
    },
    [showUserProfile]
  );

  const keyExtractor = useCallback(
    (item: LBRow) => `${item.account}-${item.rank}`,
    []
  );

  const renderItem: ListRenderItem<LBRow> = useCallback(
    ({ item }) => (
      <LeaderboardRowItem
        item={item}
        sort={sortCategory}
        onPress={handlePressRow}
      />
    ),
    [sortCategory, handlePressRow]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const renderListHeader = useCallback(
    () => (
      <ListHeaderContent
        sortCategory={selectedPill}
        onCategoryChange={handleCategoryChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchFocus={showHeader}
      />
    ),
    [selectedPill, handleCategoryChange, searchQuery, showHeader]
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {loading && !refreshing ? (
        <View style={{ paddingTop: headerHeight }}>
          <LeaderboardSkeleton />
        </View>
      ) : switching ? (
        <View className="flex-1 items-center justify-center" style={{ paddingTop: headerHeight }}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <Animated.FlatList
          {...listProps()}
          data={filteredData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
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
          removeClippedSubviews
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
    </View>
  );
};

export default LeaderboardScreen;
