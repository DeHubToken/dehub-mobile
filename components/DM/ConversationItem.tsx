import React, { memo, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs/misc";
import { formatRelativeFromNow } from "../../libs/date.util";
import type { DmConversation, DmMessage, DmUser } from "../../services/dm/dm.types";
import { getOtherParticipant } from "../../services/dm/dm.types";
import { useUnreadCount } from "../../store/dm.store";

interface ConversationItemProps {
  conversation: DmConversation;
  myUserId?: string;
  myAddress?: string;
  onPress: (conversation: DmConversation, otherUser: DmUser | undefined) => void;
  onLongPress?: (conversation: DmConversation, otherUser: DmUser | undefined) => void;
  onAvatarPress?: (otherUser: DmUser | undefined) => void;
}

const ConversationItemComponent: React.FC<ConversationItemProps> = ({
  conversation,
  myUserId,
  myAddress,
  onPress,
  onLongPress,
  onAvatarPress,
}) => {
  const other = useMemo(
    () => getOtherParticipant(conversation, myUserId, myAddress),
    [conversation, myUserId, myAddress],
  );

  const unreadCount = useUnreadCount(conversation._id, myUserId);

  const displayName = other?.displayName || other?.username || "Unknown";
  const avatarUrl = getAvatarUrl(other?.avatarImageUrl);

  // Last message preview
  const { previewText, previewIcon } = useMemo(() => {
    const msgs = conversation.messages;
    if (!msgs?.length) return { previewText: "Start a conversation", previewIcon: null };
    // messages come newest-first from the store
    const last = msgs[0] as DmMessage;
    const isMine = last.author === "me";
    const prefix = isMine ? "You: " : "";

    if (last.msgType === "voice") {
      return {
        previewText: `${prefix}Voice note`,
        previewIcon: "mic" as const,
      };
    }
    // Standalone tip message (msgType === 'tip') — centred system pill
    if (last.msgType === "tip") {
      const amt = last.tipAmount
        ? `${Number(last.tipAmount).toLocaleString()} ${last.tipSymbol || "DHB"}`
        : "DHB";
      return {
        previewText: isMine ? `You tipped ${amt}` : `Tipped ${amt}`,
        previewIcon: "diamond" as const,
      };
    }
    // Tipped message (regular content with voluntary tip attached)
    if (last.tipAmount && last.tipAmount > 0) {
      const amt = `${Number(last.tipAmount).toLocaleString()} ${last.tipSymbol || "DHB"}`;
      const contentPreview = last.content?.replace(/\n/g, " ")?.trim();
      const msgLabel = last.msgType === "gif" ? "GIF" : last.msgType === "media" ? "Photo" : contentPreview || "Message";
      return {
        previewText: `${prefix}${msgLabel} · ${amt}`,
        previewIcon: "diamond" as const,
      };
    }
    // Per-message fee message (paymentStatus set but no tipAmount — fee-based)
    if (last.paymentStatus || last.paymentTxHash) {
      const contentPreview = last.content?.replace(/\n/g, " ")?.trim();
      const msgLabel = last.msgType === "gif" ? "GIF" : last.msgType === "media" ? "Photo" : contentPreview || "Message";
      return {
        previewText: `${prefix}${msgLabel} · Paid`,
        previewIcon: "diamond" as const,
      };
    }
    if (last.msgType === "gif") {
      return { previewText: `${prefix}GIF`, previewIcon: "gift" as const };
    }
    if (last.msgType === "media") {
      const hasVideo = last.mediaUrls?.some(
        (m) => typeof m === "object" && (m.type?.includes("video") || m.mimeType?.includes("video")),
      );
      return {
        previewText: `${prefix}${hasVideo ? "Video" : "Photo"}`,
        previewIcon: hasVideo ? ("videocam" as const) : ("image" as const),
      };
    }
    if (last.isForwarded) {
      return {
        previewText: `${prefix}Forwarded message`,
        previewIcon: "arrow-redo" as const,
      };
    }
    const text = last.content?.replace(/\n/g, " ") || "";
    return {
      previewText: `${prefix}${text}`,
      previewIcon: null,
    };
  }, [conversation.messages]);

  const timeStr = useMemo(() => {
    const last = conversation.messages?.[0];
    return formatRelativeFromNow(
      last?.createdAt || conversation.lastMessageAt || conversation.updatedAt,
    );
  }, [conversation]);

  const handlePress = useCallback(
    () => onPress(conversation, other),
    [conversation, other, onPress],
  );

  const handleLongPress = useCallback(
    () => onLongPress?.(conversation, other),
    [conversation, other, onLongPress],
  );

  const handleAvatarPress = useCallback(
    () => onAvatarPress?.(other),
    [other, onAvatarPress],
  );

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        activeOpacity={0.7}
        className="flex-row items-center px-4 py-3 gap-3"
      >
        {/* Avatar */}
        <TouchableOpacity
          onPress={handleAvatarPress}
          activeOpacity={0.8}
          className="relative"
        >
          <Avatar
            uri={
              avatarUrl && avatarUrl !== "default-avatar"
                ? avatarUrl
                : undefined
            }
            size={52}
          />
        </TouchableOpacity>

        {/* Name + preview */}
        <View className="flex-1 justify-center">
          <View className="flex-row items-center gap-1.5">
            <Text
              className={`text-[15px] font-semibold ${
                unreadCount > 0 ? "text-white" : "text-theme-neutrals-100"
              }`}
              numberOfLines={1}
            >
              {displayName}
            </Text>
          </View>
          <View className="flex-row items-center gap-1 mt-0.5">
            {previewIcon && (
              <Ionicons name={previewIcon} size={13} color={unreadCount > 0 ? "#FFFFFF" : "#A6A9AC"} />
            )}
            <Text
              className={`text-[13px] flex-1 ${
                unreadCount > 0
                  ? "text-white font-medium"
                  : "text-theme-neutrals-400"
              }`}
              numberOfLines={1}
            >
              {previewText}
            </Text>
          </View>
        </View>

        {/* Time + unread badge */}
        <View className="items-end gap-1">
          <Text
            className={`text-[11px] ${
              unreadCount > 0 ? "text-accent" : "text-theme-neutrals-500"
            }`}
          >
            {timeStr}
          </Text>
          {unreadCount > 0 && (
            <View className="bg-blue-600 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
              <Text className="text-[10px] text-white font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default memo(ConversationItemComponent);
