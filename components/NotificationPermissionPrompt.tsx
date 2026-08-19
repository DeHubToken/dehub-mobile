import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "./ui/GlassModal";
import { theme } from "../theme";

interface NotificationPermissionPromptProps {
  visible: boolean;
  /** Dismiss without touching the OS permission API. */
  onDecline: () => void;
  /** User opted in — the caller then raises the real system dialog. */
  onAllow: () => void;
}

/**
 * Branded pre-prompt ("soft ask") shown before the OS notification dialog.
 *
 * The system dialog itself cannot be restyled or repositioned by an app, so
 * this stands in front of it: it explains the value in DeHub's own chrome and
 * only lets the OS prompt appear once the user has said yes. On iOS that also
 * preserves `canAskAgain` — a decline here never burns the one system prompt
 * the platform allows.
 */
const NotificationPermissionPrompt: React.FC<NotificationPermissionPromptProps> = ({
  visible,
  onDecline,
  onAllow,
}) => {
  return (
    <GlassModal
      visible={visible}
      onClose={onDecline}
      presentation="center"
      blurIntensity={80}
    >
      <View className="rounded-xl p-6 mx-6">
        {/* Icon */}
        <View className="items-center mb-4">
          <View className="bg-theme-accent/10 rounded-full p-4">
            <Ionicons
              name="notifications-outline"
              size={48}
              color={theme.colors.accent}
            />
          </View>
        </View>

        {/* Title */}
        <Text className="text-white text-2xl font-bold text-center mb-2">
          Stay in the loop
        </Text>

        <Text className="text-theme-neutrals-400 text-sm text-center mb-5">
          Turn on notifications to keep up with DeHub
        </Text>

        {/* What they get */}
        <View className="bg-theme-neutrals-800 rounded-xl p-4 mb-6 gap-3">
          <PromptRow icon="cash-outline" label="Tips and earnings land in your wallet" />
          <PromptRow icon="chatbubble-outline" label="Replies, mentions and direct messages" />
          <PromptRow icon="radio-outline" label="Creators you follow going live" />
        </View>

        <Text className="text-theme-neutrals-300 text-sm text-center mb-6">
          You choose exactly which of these reach you in Settings, any time.
        </Text>

        {/* Buttons */}
        <View className="gap-3">
          <TouchableOpacity
            onPress={onAllow}
            className="bg-theme-accent rounded-xl py-3 px-6 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-theme-accent-foreground text-base font-semibold">
              Turn on notifications
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onDecline}
            className="py-3 px-6 items-center"
            activeOpacity={0.7}
          >
            <Text className="text-theme-neutrals-400 text-base">Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

const PromptRow: React.FC<{
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}> = ({ icon, label }) => (
  <View className="flex-row items-center gap-3">
    <Ionicons name={icon} size={18} color={theme.colors.accentSecondary} />
    <Text className="text-theme-neutrals-100 text-sm flex-1 leading-5">{label}</Text>
  </View>
);

export default NotificationPermissionPrompt;
