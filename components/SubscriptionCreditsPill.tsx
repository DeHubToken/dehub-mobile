import React, { useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DhbCoin } from "./common/DhbCoin";
import { useAuthState, useUser } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { getSubscriptionCredits } from "../services/subscription.service";
import SubscriptionCreditsTopUpSheet from "./SubscriptionCreditsTopUpSheet";

const usd = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * Subscription-token balance in dollars with a bar of how much has been
 * spent, and a way to add more. A pill beside the bell; tapping it shows the
 * full card. Shown to every signed-in user: an empty balance is exactly when
 * the add button matters.
 */
const SubscriptionCreditsPill: React.FC = () => {
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["subscription-credits"],
    queryFn: () => getSubscriptionCredits(user?.address),
    enabled: isSignedIn && DIGITAL_PURCHASES_ENABLED,
    staleTime: 30_000,
    retry: false,
  });

  if (!data) return null;
  const total = Math.max(0, data.totalAddedUsd ?? 0);
  const spent = total > 0 ? Math.min(total, data.totalSpentUsd ?? Math.max(0, total - data.usd)) : 0;
  const percentUsed = total > 0 ? Math.round((spent / total) * 100) : 0;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${t("subscriptions.subscriptionTokens")}: ${usd(data.usd)}`}
        className="flex-row items-center rounded-full bg-white/10 border border-white/10 pl-1 pr-2.5 py-1 mr-3"
      >
        <DhbCoin size={18} />
        <Text className="text-xs font-semibold text-white ml-1.5">{usd(data.usd)}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <Pressable
            onPress={() => {}}
            style={{ position: "absolute", right: 16, top: insets.top + 48, width: 256 }}
            className="rounded-2xl bg-zinc-950 border border-white/10 p-3"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-2">
                <DhbCoin size={20} />
                <Text className="text-xs text-zinc-400 ml-2" numberOfLines={1}>
                  {t("subscriptions.subscriptionTokens")}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-white">{usd(data.usd)}</Text>
            </View>
            <View
              className="mt-2.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden"
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: percentUsed }}
            >
              <View className="h-full rounded-full bg-white" style={{ width: `${percentUsed}%` }} />
            </View>
            <View className="mt-1.5 flex-row items-center justify-between">
              {total > 0 ? (
                <>
                  <Text className="text-[11px] text-zinc-500">
                    {t("subscriptions.percentUsed", { percent: percentUsed })}
                  </Text>
                  <Text className="text-[11px] text-zinc-500">
                    {t("subscriptions.spentOfTotal", { spent: usd(spent), total: usd(total) })}
                  </Text>
                </>
              ) : (
                <Text className="text-[11px] text-zinc-500">{t("subscriptions.topUpEmptyHint")}</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                setOpen(false);
                setTopUpOpen(true);
              }}
              activeOpacity={0.8}
              className="mt-3 rounded-xl bg-white py-2 items-center"
            >
              <Text className="text-xs font-semibold text-black">{t("subscriptions.topUp")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setOpen(false);
                navigation.navigate(ScreenNames.CommandCentre);
              }}
              activeOpacity={0.7}
              className="mt-2 rounded-xl bg-white/10 border border-white/10 py-2 items-center"
            >
              <Text className="text-xs font-semibold text-white">{t("subscriptions.viewInWallet")}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {topUpOpen && (
        <SubscriptionCreditsTopUpSheet
          visible={topUpOpen}
          onClose={() => setTopUpOpen(false)}
          dhbPriceUsd={data.dhbPriceUsd}
        />
      )}
    </>
  );
};

export default SubscriptionCreditsPill;
