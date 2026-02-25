/**
 * ConversationContextMenu — floating context menu for long-pressing a conversation row.
 *
 * Shows the conversation preview (avatar + name + last message) at top,
 * then action rows: Block, Exclude from Tip, Delete conversation, etc.
 */
import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  Dimensions,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs/misc";
import { formatRelativeFromNow } from "../../libs/date.util";
import type { DmConversation, DmMessage, DmUser } from "../../services/dm/dm.types";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConversationContextMenuProps {
  visible: boolean;
  conversation: DmConversation | null;
  otherUser: DmUser | undefined;
  onClose: () => void;
  onOpenChat: () => void;
  onBlock: () => void;
  onDelete: () => void;
  /** Toggle free access for this user (creator only). */
  onToggleFreeAccess?: () => void;
  /** Whether this user currently has free DM access. */
  peerHasFreeAccess?: boolean;
  /** Whether the current user is a creator with per-message fee. */
  isCreator?: boolean;
}

// ─── Action Row ─────────────────────────────────────────────────────────────

interface ActionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

const ActionRow: React.FC<ActionRowProps> = ({
  icon,
  label,
  onPress,
  destructive,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    className="flex-row items-center px-4 py-3"
  >
    <View className="w-8 items-center">
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? "#EF4444" : "#F9FBFF"}
      />
    </View>
    <Text
      className={`ml-3 text-[15px] ${
        destructive ? "text-red-400" : "text-theme-neutrals-100"
      }`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

// ─── Component ──────────────────────────────────────────────────────────────

const ConversationContextMenuComponent: React.FC<ConversationContextMenuProps> = ({
  visible,
  conversation,
  otherUser,
  onClose,
  onOpenChat,
  onBlock,
  onDelete,
  onToggleFreeAccess,
  peerHasFreeAccess,
  isCreator,
}) => {
  const insets = useSafeAreaInsets();

  const displayName = otherUser?.displayName || otherUser?.username || "Unknown";
  const username = otherUser?.username;
  const avatarUrl = getAvatarUrl(otherUser?.avatarImageUrl);

  // Latest message preview
  const { previewText, timeStr } = useMemo(() => {
    if (!conversation) return { previewText: "", timeStr: "" };
    const msgs = conversation.messages;
    const last = msgs?.[0] as DmMessage | undefined;
    if (!last) return { previewText: "No messages yet", timeStr: "" };
    const isMine = last.author === "me";
    const prefix = isMine ? "You: " : "";
    let text = "";
    if (last.msgType === "voice") text = `${prefix}Voice note`;
    else if (last.msgType === "gif") text = `${prefix}GIF`;
    else if (last.msgType === "media") text = `${prefix}Photo`;
    else text = `${prefix}${last.content?.replace(/\n/g, " ") || ""}`;
    const ts = formatRelativeFromNow(last.createdAt || conversation.lastMessageAt);
    return { previewText: text, timeStr: ts };
  }, [conversation]);

  const handleOpen = useCallback(() => {
    onClose();
    setTimeout(() => onOpenChat(), 100);
  }, [onClose, onOpenChat]);

  const handleBlock = useCallback(() => {
    onClose();
    setTimeout(() => onBlock(), 100);
  }, [onClose, onBlock]);

  const handleDelete = useCallback(() => {
    onClose();
    setTimeout(() => onDelete(), 100);
  }, [onClose, onDelete]);

  const handleToggleFreeAccess = useCallback(() => {
    onClose();
    setTimeout(() => onToggleFreeAccess?.(), 100);
  }, [onClose, onToggleFreeAccess]);

  if (!visible || !conversation) return null;

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Blurred backdrop */}
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
          <BlurView
            intensity={Platform.OS === "ios" ? 40 : 30}
            tint="dark"
            style={{ flex: 1 }}
            {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
          />
        </Animated.View>
      </Pressable>

      {/* Center card */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        <Pressable>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden w-full" style={{ minWidth: 280, maxWidth: 340 }}>
            {/* Preview header */}
            <TouchableOpacity
              onPress={handleOpen}
              activeOpacity={0.7}
              className="flex-row items-center px-4 pt-4 pb-3"
            >
              <Avatar
                uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
                size={48}
              />
              <View className="flex-1 ml-3">
                <Text className="text-white text-[16px] font-semibold" numberOfLines={1}>
                  {displayName}
                </Text>
                {username && username !== displayName && (
                  <Text className="text-theme-neutrals-400 text-[12px] mt-0.5" numberOfLines={1}>
                    @{username}
                  </Text>
                )}
              </View>
              {timeStr ? (
                <Text className="text-theme-neutrals-500 text-[11px]">{timeStr}</Text>
              ) : null}
            </TouchableOpacity>

            {/* Message preview */}
            {previewText ? (
              <View className="px-4 pb-3">
                <View className="bg-theme-neutrals-700/50 rounded-xl px-3 py-2">
                  <Text className="text-theme-neutrals-300 text-[13px]" numberOfLines={2}>
                    {previewText}
                  </Text>
                </View>
              </View>
            ) : null}

            <View className="h-[1px] bg-theme-neutrals-700/60" />

            {/* Actions */}
            <ActionRow icon="chatbubble-outline" label="Open chat" onPress={handleOpen} />
            {isCreator && onToggleFreeAccess && (
              <ActionRow
                icon={peerHasFreeAccess ? "remove-circle-outline" : "shield-checkmark-outline"}
                label={peerHasFreeAccess ? "Remove free access" : "Grant free access"}
                onPress={handleToggleFreeAccess}
              />
            )}
            <ActionRow icon="ban-outline" label="Block user" onPress={handleBlock} destructive />
            <ActionRow icon="trash-outline" label="Delete conversation" onPress={handleDelete} destructive />
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

export default memo(ConversationContextMenuComponent);
