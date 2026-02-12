import React from "react";
import { View, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
}

const LeaderboardSearchBar: React.FC<Props> = ({ value, onChangeText }) => (
  <View className="mx-4 mt-3 mb-2 flex-row items-center bg-theme-neutrals-800 rounded-xl px-3 py-2.5">
    <Ionicons name="search" size={16} color="#6F7174" style={{ marginRight: 8 }} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="Search users..."
      placeholderTextColor="#6F7174"
      className="flex-1 text-white text-sm p-0"
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
    />
  </View>
);

export default React.memo(LeaderboardSearchBar);
