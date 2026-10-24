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
import Icon from "../ui/Icon";
import { PageEmpty, KitButton, ThemeIcon } from "../page/PageKit";
import { useAppTheme } from "../../context/ThemeContext";
import type { DmEncryptionStatus } from "../../libs/dm-e2ee/setup";

interface DmLockedStateProps {
  status: DmEncryptionStatus | null;
  busy?: boolean;
  peerName: string;
  onUnlock: () => void;
}

const DmLockedStateComponent: React.FC<DmLockedStateProps> = ({ status, busy, peerName, onUnlock }) => {
  const { t } = useTranslation();
  const { isLight } = useAppTheme();

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
      style={{ flex: 1, justifyContent: "center", paddingBottom: 40 }}
    >
      <PageEmpty
        icon={<ThemeIcon icon="messages" size={96} style={{ marginBottom: 18 }} />}
        title={t("messages.lockedTitle", { defaultValue: "Unlock to read your messages" })}
        body={body}
        action={busy ? (
          <View className="h-[42px] items-center justify-center flex-row">
            <ActivityIndicator size="small" color={isLight ? "#0B0B0D" : "#F4F4F5"} />
            <Text className="text-[12px] text-theme-neutrals-400 ml-2">
              {t("messages.encryptionTurningOn", { defaultValue: "Waiting for your wallet to turn on encryption…" })}
            </Text>
          </View>
        ) : (
          <KitButton
            label={status === "error"
              ? t("messages.lockedTryAgain", { defaultValue: "Try again" })
              : t("messages.lockedUnlock", { defaultValue: "Unlock wallet" })}
            onPress={onUnlock}
          />
        )}
      />
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
