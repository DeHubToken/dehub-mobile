import React, { useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { formatCompactNumber } from "../../libs/numbers.util";

export interface StatItem { key: string; label: string; value: number }

export interface UserProfileStatsRowProps {
  stats: StatItem[];
  onStatPress?: (key: string) => void;
}

const UserProfileStatsRow: React.FC<UserProfileStatsRowProps> = ({ stats, onStatPress }) => {
  if (!stats?.length) return null;
  
  return (
    <View className="flex-row justify-around my-4">
      {stats.map((s) => {
        const isClickable = onStatPress && (s.key === "followers" || s.key === "following");
        
        if (isClickable) {
          return (
            <Pressable
              key={s.key}
              className="items-center px-3 py-2"
              onPress={() => onStatPress(s.key)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text className="text-white text-sm font-bold">{formatCompactNumber(s.value)}</Text>
              <Text className="text-gray-400 text-[10px]">{s.label}</Text>
            </Pressable>
          );
        }
        
        return (
          <View key={s.key} className="items-center px-3 py-2">
            <Text className="text-white text-sm font-bold">{formatCompactNumber(s.value)}</Text>
            <Text className="text-gray-400 text-[10px]">{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
};

export default UserProfileStatsRow;
