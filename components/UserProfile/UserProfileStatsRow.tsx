import React from "react";
import { View, Text } from "react-native";
import { formatCompactNumber } from "../../libs/numbers.util";

export interface StatItem { key: string; label: string; value: number }

export interface UserProfileStatsRowProps { stats: StatItem[] }

const UserProfileStatsRow: React.FC<UserProfileStatsRowProps> = ({ stats }) => {
  if (!stats?.length) return null;
  return (
    <View className="flex-row justify-around my-4">
      {stats.map((s) => (
        <View key={s.key} className="items-center">
          <Text className="text-white text-sm font-bold">{formatCompactNumber(s.value)}</Text>
          <Text className="text-gray-400 text-[10px]">{s.label}</Text>
        </View>
      ))}
    </View>
  );
};

export default UserProfileStatsRow;
