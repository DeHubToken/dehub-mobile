import React from "react";
import { View, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
}

const LeaderboardSearchBar: React.FC<Props> = ({ value, onChangeText }) => (
  <View className="mx-4 mt-3 mb-2 flex-row items-center bg-theme-neutrals-800 rounded-xl px-3 py-2.5">
    <Ionicons name="search" size={16} color={theme.colors.neutrals[400]} style={{ marginRight: 8 }} />
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="Search users..."
      placeholderTextColor={theme.colors.neutrals[400]}
      className="flex-1 text-white text-sm p-0"
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
    />
  </View>
);

export default React.memo(LeaderboardSearchBar);
