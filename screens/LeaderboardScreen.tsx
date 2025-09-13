import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, RefreshControl, ListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import LeaderboardSkeleton from '../components/Leaderboard/LeaderboardSkeleton';
import { getLeaderboard } from '../services/leaderboard.service';
import { formatCompactNumber } from '../libs/numbers.util';
import { getAvatarUrl } from '../libs/misc';
import { truncate } from '../libs/strings.util';
import { useAuth } from '../context/AuthContext';
import { useUserProfileSheet } from '../context/UserProfileSheetContext';
import { ScreenNames } from '../navigation/ScreenNames';

const defaultAvatar = require('../assets/default-avatar.png');

interface LBRow {
  rank: number;
  holder: string;
  total: number;
  sentTips?: number;
  receivedTips?: number;
  avatarUrl?: string;
}

// Approximate fixed row height for getItemLayout optimization
const ROW_HEIGHT = 44; // padding + text + border

interface RowProps {
  item: LBRow;
  onPress: (holder: string) => void;
}

const LeaderboardRow: React.FC<RowProps> = React.memo(({ item, onPress }) => {
  return (
    <TouchableOpacity
      onPress={() => onPress(item.holder)}
      activeOpacity={0.75}
      className="flex-row justify-between items-center p-2 border-b border-theme-neutrals-700"
    >
      <Text className="text-theme-neutrals-200 text-xs text-center w-8">{item.rank}</Text>
      <View className="flex-row items-center w-32">
        {item.avatarUrl && item.avatarUrl !== 'default-avatar' ? (
          <Image source={{ uri: item.avatarUrl }} className="w-6 h-6 rounded-full mr-2" />
        ) : (
          <Image source={defaultAvatar} className="w-6 h-6 rounded-full mr-2" />
        )}
        <Text className="text-theme-neutrals-200 text-xs" numberOfLines={1}>{truncate(item.holder, 10, '..')}</Text>
      </View>
      <Text className="text-theme-neutrals-200 text-xs text-center w-16">{formatCompactNumber(item.total)}</Text>
      <Text className="text-theme-neutrals-200 text-[10px] text-center w-16">{formatCompactNumber(item.sentTips || 0)}</Text>
      <Text className="text-theme-neutrals-200 text-[10px] text-center w-16">{formatCompactNumber(item.receivedTips || 0)}</Text>
    </TouchableOpacity>
  );
});

const LeaderboardScreen = () => {
  const navigation = useNavigation();
  const { user: authUser } = useAuth();
  const { showUserProfile } = useUserProfileSheet();

  const [baseData, setBaseData] = useState<LBRow[]>([]); // un-sorted raw data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWorkingSkeleton, setShowWorkingSkeleton] = useState(false); // shows while sorting
  const [sortConfig, setSortConfig] = useState<{ key: keyof LBRow | 'sentTips' | 'receivedTips'; direction: 'asc' | 'desc' }>({ key: 'total', direction: 'desc' });

  // Fetch data (only when explicitly requested)
  const loadData = useCallback(async (sortKey: string = 'total') => {
    setLoading(prev => prev && baseData.length === 0);
    try {
      const backendSort = sortKey === 'total' ? 'holdings' : sortKey;
      const res = await getLeaderboard({ sort: backendSort });
      if (res.success && res.data?.result?.byWalletBalance) {
        const rows: LBRow[] = res.data.result.byWalletBalance.map((u, index) => ({
          rank: index + 1,
          holder: u.username || u.userDisplayName || u.account,
          total: u.total,
          sentTips: (u as any).sentTips || (u as any).tipsGiven || 0,
          receivedTips: (u as any).receivedTips || (u as any).tipsReceived || 0,
          avatarUrl: getAvatarUrl((u as any).avatarUrl || (u as any).avatarImageUrl),
        }));
        setBaseData(rows);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [baseData.length]);

  useEffect(() => {
    loadData('total');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(sortConfig.key as string);
  }, [loadData, sortConfig.key]);

  // Derived & memoized sorted data; only recalculates when baseData or sortConfig changes
  const sortedData = useMemo(() => {
    if (!baseData.length) return baseData;
    const copy = [...baseData];
    const { key, direction } = sortConfig;
    copy.sort((a, b) => {
      const aVal = (a as any)[key] ?? 0;
      const bVal = (b as any)[key] ?? 0;
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    // Recompute rank based on displayed order without mutating base
    return copy.map((row, idx) => ({ ...row, rank: idx + 1 }));
  }, [baseData, sortConfig]);

  const sortData = useCallback((key: 'total' | 'sentTips' | 'receivedTips') => {
    setShowWorkingSkeleton(true);
    setSortConfig(prev => {
      const direction = prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc';
      return { key, direction };
    });
    // brief skeleton flash
    setTimeout(() => setShowWorkingSkeleton(false), 160);
  }, []);

  // Memoized action for row press
  const handlePressRow = useCallback((holder: string) => {
    if (!holder) return;
    const myUsername = authUser?.username;
    if (myUsername && holder === myUsername) {
      (navigation as any).navigate(ScreenNames.Profile);
      return;
    }
    showUserProfile(holder);
  }, [authUser?.username, navigation, showUserProfile]);

  const keyExtractor = useCallback((item: LBRow) => `${item.holder}-${item.rank}`, []);

  const renderItem: ListRenderItem<LBRow> = useCallback(({ item }) => (
    <LeaderboardRow item={item} onPress={handlePressRow} />
  ), [handlePressRow]);

  const getItemLayout = useCallback((_: any, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }), []);

  const dataToRender = loading ? [] : sortedData; // avoid initial extra work during skeleton

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Leaderboard" />
      <View className="flex-row justify-between items-center p-2 border-b border-theme-neutrals-700">
        <Text className="text-theme-neutrals-200 text-xs text-center w-8 font-bold">#</Text>
        <Text className="text-theme-neutrals-200 text-xs text-center w-32 font-bold">Holders</Text>
        <TouchableOpacity className="w-16" onPress={() => sortData('total')}>
          <View className="flex-row items-center justify-center">
            <Text className="text-theme-neutrals-200 text-[10px] font-bold">Holdings</Text>
            {sortConfig.key === 'total' ? (
              <Ionicons name={sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} color="white" />
            ) : (
              <Ionicons name="swap-vertical" size={12} color="white" />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity className="w-16" onPress={() => sortData('sentTips')}>
          <View className="flex-row items-center justify-center">
            <Text className="text-theme-neutrals-200 text-[10px] font-bold">Tips Given</Text>
            {sortConfig.key === 'sentTips' ? (
              <Ionicons name={sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} color="white" />
            ) : (
              <Ionicons name="swap-vertical" size={12} color="white" />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity className="w-16" onPress={() => sortData('receivedTips')}>
          <View className="flex-row items-center justify-center">
            <Text className="text-theme-neutrals-200 text-[10px] font-bold">Tips Recv</Text>
            {sortConfig.key === 'receivedTips' ? (
              <Ionicons name={sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} color="white" />
            ) : (
              <Ionicons name="swap-vertical" size={12} color="white" />
            )}
          </View>
        </TouchableOpacity>
      </View>
      {loading || refreshing || showWorkingSkeleton ? (
        <LeaderboardSkeleton />
      ) : (
        <FlatList
          data={dataToRender}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          initialNumToRender={20}
          windowSize={10}
          maxToRenderPerBatch={20}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          getItemLayout={getItemLayout}
        />
      )}
    </View>
  );
};

export default LeaderboardScreen;
