/**
 * DmLockedState — the whole thread, as one screen, while this device can't
 * open it.
 *
 * Without a key every encrypted line used to render its own "can't be opened
 * on this device" row, so a locked wallet turned a chat into a column of the
 * same error. This stands in for the list (and the composer, since anything
 * typed now would go out in the clear) with one place to unlock from.
 */
import React, { memo } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import PrimaryButton from "../ui/PrimaryButton";
import { useAppTheme } from "../../context/ThemeContext";
import type { DmEncryptionStatus } from "../../libs/dm-e2ee/setup";

interface DmLockedStateProps {
  status: DmEncryptionStatus | null;
  busy?: boolean;
  peerName: string;
  peerAvatarUri?: string | null;
  onUnlock: () => void;
}

/** Badge fill per theme: the one accent where a theme has one, ink otherwise. */
function badgeColors(theme: string, isLight: boolean): { bg: string; fg: string } {
  if (isLight) return { bg: "#0B0B0D", fg: "#FFFFFF" };
  if (theme === "osaka") return { bg: "#FF6FB5", fg: "#0A0812" };
  if (theme === "hazy") return { bg: "#8B5CF6", fg: "#FFFFFF" };
  return { bg: "#FFFFFF", fg: "#09090B" };
}

const DmLockedStateComponent: React.FC<DmLockedStateProps> = ({ status, busy, peerName, peerAvatarUri, onUnlock }) => {
  const { t } = useTranslation();
  const { theme, isLight } = useAppTheme();
  const badge = badgeColors(theme, isLight);

  const body = status === "error"
    ? t("messages.encryptionSetupFailed", { defaultValue: "Encryption setup failed. Please try again." })
    : t("messages.lockedBody", {
        name: peerName,
        defaultValue: "Your chat with {{name}} is end-to-end encrypted. Unlock your wallet on this device to open it.",
      });

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center px-8 pb-10"
    >
      <View style={{ width: 78, height: 64, marginBottom: 14 }}>
        <View style={{ position: "absolute", left: 0, top: 0 }}>
          <Avatar uri={peerAvatarUri} size={56} name={peerName} />
        </View>
        <View
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: badge.bg,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: theme === "osaka" ? "#FF6FB5" : "#000",
            shadowOpacity: theme === "osaka" ? 0.6 : 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 6,
          }}
        >
          <Icon name="Lock" size={16} color={badge.fg} />
        </View>
      </View>
      <Text className="text-[18px] font-semibold text-theme-neutrals-100 text-center">
        {t("messages.lockedTitle", { defaultValue: "Unlock to read your messages" })}
      </Text>
      <Text className="text-[13px] text-theme-neutrals-400 text-center mt-2 leading-5" style={{ maxWidth: 300 }}>
        {body}
      </Text>
      <View className="mt-5" style={{ minWidth: 190 }}>
        {busy ? (
          <View className="h-10 items-center justify-center flex-row">
            <ActivityIndicator size="small" color={isLight ? "#0B0B0D" : "#F4F4F5"} />
            <Text className="text-[12px] text-theme-neutrals-400 ml-2">
              {t("messages.encryptionTurningOn", { defaultValue: "Waiting for your wallet to turn on encryption…" })}
            </Text>
          </View>
        ) : (
          <PrimaryButton
            title={status === "error"
              ? t("messages.lockedTryAgain", { defaultValue: "Try again" })
              : t("messages.lockedUnlock", { defaultValue: "Unlock wallet" })}
            onPress={onUnlock}
          />
        )}
      </View>
      <View className="mt-3 rounded-full border border-theme-neutrals-800 px-3 py-1">
        <Text className="text-[11px] text-theme-neutrals-500">
          {t("messages.lockedPrivate", { defaultValue: "Only you can read them" })}
        </Text>
      </View>
    </Animated.View>
  );
};

export default memo(DmLockedStateComponent);

/** One quiet line standing in for a run of lines encrypted for another device. */
export const DmUndecryptableRun = memo(function DmUndecryptableRun({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center px-4 my-3">
      <View className="flex-1 h-px bg-theme-neutrals-800" />
      <Icon name="Lock" size={11} color="#A6A9AC" />
      <Text className="text-[12px] text-theme-neutrals-400 mx-1.5">
        {t("messages.undecryptableRun", { count, defaultValue: "{{count}} messages can't be opened on this device" })}
      </Text>
      <View className="flex-1 h-px bg-theme-neutrals-800" />
    </View>
  );
});
