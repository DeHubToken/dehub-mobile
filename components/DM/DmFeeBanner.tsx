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
import type { DmFee } from "../../services/dm/dm.types";

interface DmFeeBannerProps {
  dmFee: DmFee | null | undefined;
  peerDisplayName?: string;
}

const DmFeeBannerComponent: React.FC<DmFeeBannerProps> = ({
  dmFee,
  peerDisplayName,
}) => {
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
            {dmFee.fee} <DhbCoin /> per message
          </Text>
          {peerDisplayName ? (
            <Text className="text-[11px] text-theme-neutrals-500 ml-1">
              · set by {peerDisplayName}
            </Text>
          ) : null}
        </View>
      )}

      {hasFreeAccess && (
        <View className="flex-row items-center justify-center px-4 py-2 bg-green-600/10 border-b border-theme-neutrals-800/50">
          <Ionicons name="shield-checkmark" size={14} color="#22C55E" />
          <Text className="text-[12px] text-green-400 font-medium ml-1.5">
            Free access
          </Text>
          <Text className="text-[11px] text-theme-neutrals-500 ml-1">
            · normally {dmFee.fee} <DhbCoin /> per message
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

export default memo(DmFeeBannerComponent);
