import React from "react";
import { useTranslation } from "react-i18next";
import { View, Text } from "react-native";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";

export default function ExploreScreen() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("nav.explore")} />
      <View className="flex-1 items-center justify-center px-6">
        <Icon name="Search" size={48} color="#555" />
        <Text className="text-white text-lg font-semibold mt-4">Explore</Text>
        <Text className="text-theme-neutrals-400 text-sm text-center mt-2">
          Coming soon — discover trending content and creators.
        </Text>
      </View>
    </View>
  );
}
