import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  FlatList,
  RefreshControl,
  ListRenderItem,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
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
}

const ListHeaderContent = React.memo<ListHeaderContentProps>(
  ({ sortCategory, onCategoryChange, searchQuery, onSearchChange }) => (
    <View>
      <LeaderboardCategoryPills active={sortCategory} onSelect={onCategoryChange} />
      <LeaderboardSearchBar value={searchQuery} onChangeText={onSearchChange} />
    </View>
  )
);

const LeaderboardScreen = () => {
  const { t } = useTranslation();
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
      />
    ),
    [selectedPill, handleCategoryChange, searchQuery]
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("nav.leaderboard")} />
      {loading && !refreshing ? (
        <View>
          {renderListHeader()}
          <LeaderboardSkeleton />
        </View>
      ) : (
        <>
          {renderListHeader()}
          {switching ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : (
            <FlatList
              data={filteredData}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              contentContainerStyle={{ paddingBottom: 24 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#fff"
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
        </>
      )}
    </View>
  );
};

export default LeaderboardScreen;
