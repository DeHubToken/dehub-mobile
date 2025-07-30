import React, { useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';

const defaultAvatar = require('../assets/icon.png');

const initialLeaderboardData = Array.from({ length: 50 }, (_, index) => ({
  rank: index + 1,
  holder: `0x${Math.random().toString(16).substr(2, 8)}...`,
  holdings: parseFloat((Math.random() * 300).toFixed(2)),
  tipsGiven: Math.floor(Math.random() * 100),
  tipsReceived: Math.floor(Math.random() * 100),
  avatar: index % 4 === 0 ? require('../assets/icon.png') : undefined,
}));

const LeaderboardScreen = () => {
  const navigation = useNavigation();
  const [leaderboardData, setLeaderboardData] = useState(initialLeaderboardData);
  const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });

  const sortData = (key) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    const sortedData = [...leaderboardData].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setSortConfig({ key, direction });
    setLeaderboardData(sortedData);
  };

  const renderItem = ({ item }) => (
    <View className="flex-row justify-between items-center p-2 border-b border-theme-neutrals-700">
      <Text className="text-theme-neutrals-200 text-xs text-center w-8">{item.rank}</Text>
      <View className="flex-row items-center w-32">
        <Image source={item.avatar || defaultAvatar} className="w-6 h-6 rounded-full mr-2" />
        <Text className="text-theme-neutrals-200 text-xs truncate">{item.holder}</Text>
      </View>
      <Text className="text-theme-neutrals-200 text-xs text-center w-16">{item.holdings} M</Text>
      <Text className="text-theme-neutrals-200 text-xs text-center w-16">{item.tipsGiven}</Text>
      <Text className="text-theme-neutrals-200 text-xs text-center w-16">{item.tipsReceived}</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Leaderboard" />
      <View className="flex-row justify-between items-center p-2 border-b border-theme-neutrals-700">
        <Text className="text-theme-neutrals-200 text-xs text-center w-8 font-bold">#</Text>
        <Text className="text-theme-neutrals-200 text-xs text-center w-32 font-bold">Holders</Text>
        <TouchableOpacity className="w-16" onPress={() => sortData('holdings')}>
          <View className="flex-row items-center justify-center">
            <Text className="text-theme-neutrals-200 text-xs font-bold">Holdings</Text>
            {sortConfig.key === 'holdings' ? (
              <Ionicons
                name={sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={12}
                color="white"
                className="ml-1"
              />
            ) : (
              <Ionicons name="swap-vertical" size={12} color="white" className="ml-1" />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity className="w-16" onPress={() => sortData('tipsGiven')}>
          <View className="flex-row items-center justify-center">
            <Text className="text-theme-neutrals-200 text-xs font-bold">Tips Given</Text>
            {sortConfig.key === 'tipsGiven' ? (
              <Ionicons
                name={sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={12}
                color="white"
                className="ml-1"
              />
            ) : (
              <Ionicons name="swap-vertical" size={12} color="white" className="ml-1" />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity className="w-16" onPress={() => sortData('tipsReceived')}>
          <View className="flex-row items-center justify-center">
            <Text className="text-theme-neutrals-200 text-xs font-bold">Tips Received</Text>
            {sortConfig.key === 'tipsReceived' ? (
              <Ionicons
                name={sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={12}
                color="white"
                className="ml-1"
              />
            ) : (
              <Ionicons name="swap-vertical" size={12} color="white" className="ml-1" />
            )}
          </View>
        </TouchableOpacity>
      </View>
      <FlatList
        data={leaderboardData}
        keyExtractor={(item) => item.rank.toString()}
        renderItem={renderItem}
      />
    </View>
  );
};

export default LeaderboardScreen;
