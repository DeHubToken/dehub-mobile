import React, { useRef, useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DhbCoin } from "./common/DhbCoin";
import { SCREEN_HEADER_HEIGHT } from "./ScreenHeader";
import { ScreenNames } from "../navigation/ScreenNames";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { useSubscriptionCredits } from "../hooks/useSubscriptionCredits";
import SubscriptionCreditsTopUpSheet from "./SubscriptionCreditsTopUpSheet";

const usd = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * Subscription-token balance in dollars, the balance AI generation is paid
 * from. A pill in the creator header; tapping it shows how much has been
 * spent and a way to add more. Shown to every signed-in user: an empty
 * balance is exactly when the add button matters. Hidden on the App Store
 * build, which sells nothing.
 */
const SubscriptionCreditsPill: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const anchorRef = useRef<View>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const { data } = useSubscriptionCredits(DIGITAL_PURCHASES_ENABLED);

  if (!DIGITAL_PURCHASES_ENABLED || !data) return null;
  const total = Math.max(0, data.totalAddedUsd ?? 0);
  const spent = total > 0 ? Math.min(total, data.totalSpentUsd ?? Math.max(0, total - data.usd)) : 0;
  const percentUsed = total > 0 ? Math.round((spent / total) * 100) : 0;

  // The card hangs under the pill wherever the header puts it.
  const openCard = () => {
    const fallback = insets.top + SCREEN_HEADER_HEIGHT;
    if (!anchorRef.current) return setCardTop(fallback);
    anchorRef.current.measureInWindow((_x, y, _w, h) => setCardTop(h ? y + h + 8 : fallback));
  };
  const closeCard = () => setCardTop(null);

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <TouchableOpacity
          onPress={openCard}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${t("credits.subscriptionTokens")}: ${usd(data.usd)}`}
          className="flex-row items-center rounded-full bg-white/10 border border-white/10 pl-1 pr-2.5 py-1"
        >
          <DhbCoin size={18} />
          <Text className="text-xs font-semibold text-white ml-1.5">{usd(data.usd)}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={cardTop !== null} transparent statusBarTranslucent animationType="fade" onRequestClose={closeCard}>
        <Pressable
          style={{ flex: 1 }}
          onPress={closeCard}
          accessibilityRole="button"
          accessibilityLabel={t("credits.close")}
        >
          <Pressable
            onPress={() => {}}
            style={{ position: "absolute", right: 16, top: cardTop ?? 0, width: 256 }}
            className="rounded-2xl bg-zinc-950 border border-white/10 p-3"
          >
            {/* The balance opens the wallet, where the tokens are listed. */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                closeCard();
                navigation.navigate(ScreenNames.CommandCentre);
              }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 mr-2">
                  <DhbCoin size={20} />
                  <Text className="text-xs text-zinc-400 ml-2" numberOfLines={1}>
                    {t("credits.subscriptionTokens")}
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
                      {t("credits.percentUsed", { percent: percentUsed })}
                    </Text>
                    <Text className="text-[11px] text-zinc-500">
                      {t("credits.spentOfTotal", { spent: usd(spent), total: usd(total) })}
                    </Text>
                  </>
                ) : (
                  <Text className="text-[11px] text-zinc-500">{t("credits.topUpEmptyHint")}</Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                closeCard();
                setTopUpOpen(true);
              }}
              activeOpacity={0.8}
              className="mt-3 rounded-xl bg-white py-2 items-center"
            >
              <Text className="text-xs font-semibold text-black">{t("credits.topUp")}</Text>
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
