/**
 * DmEncryptionBanner — says so when this device has no encryption key.
 *
 * Without a key the chat still works, quietly and worse: everything typed goes
 * out in the clear, and anything the other side encrypted renders as "can't be
 * opened on this device". Both of those used to be the only symptoms, which is
 * why the fault went unread for days — the failure looked like the peer's.
 *
 * Hidden in the normal case ("ready", or still resolving). One tap re-runs
 * setup, which is where the unlock sheet comes from.
 */
import React, { memo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { DmEncryptionStatus } from "../../libs/dm-e2ee/setup";

interface DmEncryptionBannerProps {
  status: DmEncryptionStatus | null;
  busy?: boolean;
  onRetry: () => void;
}

const DmEncryptionBannerComponent: React.FC<DmEncryptionBannerProps> = ({
  status,
  busy,
  onRetry,
}) => {
  const { t } = useTranslation();
  if (!status || status === "ready") return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className="flex-row items-center px-4 py-2 bg-white/10 border-b border-theme-neutrals-800/50"
    >
      <Ionicons name="lock-open-outline" size={14} color="#F4F4F5" />
      <Text className="flex-1 text-[12px] text-theme-neutrals-100 ml-1.5">
        {t("messages.encryptionOff")}
      </Text>
      <TouchableOpacity onPress={onRetry} disabled={busy} className="pl-3 py-1">
        {busy ? (
          <ActivityIndicator size="small" color="#F4F4F5" />
        ) : (
          <Text className="text-[12px] text-white font-semibold">
            {t("messages.encryptionTurnOn")}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default memo(DmEncryptionBannerComponent);
