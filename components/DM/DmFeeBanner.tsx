/**
 * DmFeeBanner — Sticky banner at the top of chat showing per-message fee info.
 *
 * Displays:
 * - Required fee: blue accent with diamond icon + amount
 * - Free access: green badge showing exemption
 * - Hidden when no fee or fee is 0
 */
import { DhbCoin } from "../common/DhbCoin";
import React, { memo } from "react";
import { View, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { DmFee } from "../../services/dm/dm.types";

interface DmFeeBannerProps {
  dmFee: DmFee | null | undefined;
  peerDisplayName?: string;
}

const DmFeeBannerComponent: React.FC<DmFeeBannerProps> = ({
  dmFee,
  peerDisplayName,
}) => {
  const { t } = useTranslation();
  if (!dmFee || dmFee.fee <= 0) return null;

  const feeRequired = dmFee.required && !dmFee.hasFreeAccess;
  const hasFreeAccess = dmFee.hasFreeAccess;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      {feeRequired && (
        <View className="flex-row items-center justify-center px-4 py-2 bg-white/10 border-b border-theme-neutrals-800/50">
          <Ionicons name="diamond" size={14} color="#F4F4F5" />
          <Text className="text-[12px] text-theme-neutrals-100 font-medium ml-1.5">
            {dmFee.fee} <DhbCoin /> {t("dm.perMessage")}
          </Text>
          {peerDisplayName ? (
            <Text className="text-[11px] text-theme-neutrals-500 ml-1">
              {t("dm.feeSetBy", { name: peerDisplayName })}
            </Text>
          ) : null}
        </View>
      )}

      {hasFreeAccess && (
        <View className="flex-row items-center justify-center px-4 py-2 bg-white/10 border-b border-theme-neutrals-800/50">
          <Ionicons name="shield-checkmark" size={14} color="#F4F4F5" />
          <Text className="text-[12px] text-white/80 font-medium ml-1.5">
            {t("dm.freeAccess")}
          </Text>
          <Text className="text-[11px] text-theme-neutrals-500 ml-1">
            {t("dm.normally")} {dmFee.fee} <DhbCoin /> {t("dm.perMessage")}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

export default memo(DmFeeBannerComponent);
