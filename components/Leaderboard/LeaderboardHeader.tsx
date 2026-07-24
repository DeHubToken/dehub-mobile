import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const LeaderboardHeader: React.FC = () => (
  <View className="flex-row items-center px-5 pt-4 pb-2">
    <View className="w-12 h-12 rounded-full bg-theme-neutrals-800 items-center justify-center mr-3">
      <Ionicons name="trophy" size={24} color="#FEC84B" />
    </View>
    <View>
      <Text className="text-white text-xl font-bold">DHB Leaderboard</Text>
      <Text className="text-theme-neutrals-400 text-xs mt-0.5">
        Top token holders and tippers
      </Text>
    </View>
  </View>
);

export default React.memo(LeaderboardHeader);
