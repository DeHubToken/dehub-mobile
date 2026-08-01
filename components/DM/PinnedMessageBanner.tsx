import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import Icon from "../ui/Icon";
import type { DmMessage } from "../../services/dm/dm.types";

interface PinnedMessageBannerProps {
  pinnedMessage: DmMessage;
  onPress: () => void;
  onUnpin: () => void;
}

const PinnedMessageBanner: React.FC<PinnedMessageBannerProps> = ({
  pinnedMessage,
  onPress,
  onUnpin,
}) => {
  const preview =
    pinnedMessage.content?.trim() ||
    (pinnedMessage.msgType === "media"
      ? "📷 Media"
      : pinnedMessage.msgType === "gif"
        ? "🎞️ GIF"
        : pinnedMessage.msgType === "voice"
          ? "🎤 Voice note"
          : "📎 Message");

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        className="flex-row items-center px-3 py-2 bg-blue-500/10 border-b border-blue-500/20"
      >
        <Icon name="Pin" size={14} color="#D4D4D8" />
        <View className="flex-1 ml-2 min-w-0">
          <Text className="text-blue-400 text-[9px] font-semibold uppercase tracking-wider">
            Pinned Message
          </Text>
          <Text className="text-blue-100/70 text-xs mt-0.5" numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onUnpin}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="ml-2 p-1"
        >
          <Icon name="X" size={14} color="rgba(96,165,250,0.5)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default React.memo(PinnedMessageBanner);
