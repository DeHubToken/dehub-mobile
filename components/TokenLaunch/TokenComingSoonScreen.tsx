import React from "react";
import { ScrollView, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../ScreenHeader";
import TokenLaunchNotify from "./TokenLaunchNotify";

/**
 * What the DEX and DEX pool screens show while the new token is not trading:
 * "Token launching soon" with Notify me, nothing else.
 */
export default function TokenComingSoonScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  return (
    <View className="flex-1 bg-theme-neutrals-900" testID="token-coming-soon-screen">
      <ScreenHeader title={t("wallet.buy")} onBackPress={() => navigation.goBack()} icon="buy" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <TokenLaunchNotify />
      </ScrollView>
    </View>
  );
}
