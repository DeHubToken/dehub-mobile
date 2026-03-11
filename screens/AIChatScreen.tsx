import React from "react";
import { View, Text } from "react-native";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";

export default function AIChatScreen() {
  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="AI Chat" />
      <View className="flex-1 items-center justify-center px-6">
        <Icon name="Sparkles" size={48} color="#555" />
        <Text className="text-white text-lg font-semibold mt-4">AI Chat</Text>
        <Text className="text-theme-neutrals-400 text-sm text-center mt-2">
          Coming soon — chat with AI about your content and more.
        </Text>
      </View>
    </View>
  );
}
