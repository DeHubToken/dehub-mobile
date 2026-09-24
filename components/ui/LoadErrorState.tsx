import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "./Icon";

interface LoadErrorStateProps {
  /** Already-translated line explaining what failed to load. */
  message: string;
  onRetry: () => void;
  icon?: IconName;
}

/**
 * Error state for a list whose fetch failed. Without it a failed load renders
 * the list's empty state, which tells the user they have nothing when the
 * truth is we could not ask. Same look as the notifications error state.
 */
export default function LoadErrorState({ message, onRetry, icon = "WifiOff" }: LoadErrorStateProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center py-20 px-8">
      <View className="w-16 h-16 rounded-2xl bg-theme-neutrals-800 items-center justify-center mb-4">
        <Icon name={icon} size={32} color="#A1A1AA" />
      </View>
      <Text className="text-theme-neutrals-400 text-base font-medium mb-1 text-center">{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        className="mt-3 px-5 py-2 rounded-xl bg-theme-neutrals-800"
      >
        <Text className="text-theme-neutrals-100 text-sm font-medium">{t("common.tryAgain")}</Text>
      </TouchableOpacity>
    </View>
  );
}
