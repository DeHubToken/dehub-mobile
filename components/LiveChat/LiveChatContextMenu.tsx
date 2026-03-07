import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  Dimensions,
  Image,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
import { copyToClipboard } from "../../libs/clipboard.utils";
import type { LiveChatMessageData, LiveChatUser } from "../../services/livechat.service";

export interface MessageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LiveChatContextMenuProps {
  visible: boolean;
  message: LiveChatMessageData | null;
  layout: MessageLayout | null;
  isMe: boolean;
  isModerator: boolean;
  onClose: () => void;
  onReply?: (msg: LiveChatMessageData) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (msg: LiveChatMessageData) => void;
  onDelete?: (msg: LiveChatMessageData) => void;
  onPin?: (msg: LiveChatMessageData) => void;
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const REACTION_EMOJIS = ["🔥", "❤️", "😂", "👀", "💯", "🙌"];

/* ─── ActionRow ────────────────────────────────────────────── */

interface ActionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

const ActionRow: React.FC<ActionRowProps> = ({ icon, label, onPress, destructive }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    className="flex-row items-center px-4 py-3"
  >
    <View className="w-8 items-center">
      <Ionicons name={icon} size={20} color={destructive ? "#EF4444" : "#F9FBFF"} />
    </View>
    <Text
      className={`ml-3 text-[15px] ${destructive ? "text-red-400" : "text-theme-neutrals-100"}`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

/* ─── Floating Message ─────────────────────────────────────── */

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
};

const FloatingLiveChatMessage: React.FC<{ message: LiveChatMessageData }> = ({ message }) => {
  const sender = message.sender;
  const avatarUrl = getAvatarUrl(sender?.avatarUrl || "");
  const displayName =
    sender?.displayName || sender?.username || message.senderAddress?.slice(0, 8) || "Anon";
  const badgeBalance = resolveBadgeBalance(sender || {});
  const badgeImg = getBadgeUrl(badgeBalance);
  const isMod = sender?.isModerator;

  return (
    <View className="max-w-[85%] bg-theme-neutrals-900 rounded-2xl p-3 shadow-lg">
      {/* Sender header */}
      <View className="flex-row items-center gap-2 mb-1.5">
        <Avatar uri={avatarUrl} size={28} />
        <Text className="text-white font-bold text-[13px] flex-shrink" numberOfLines={1}>
          {displayName}
        </Text>
        {isMod && (
          <View className="bg-amber-500/20 rounded px-1 py-0.5">
            <Text className="text-amber-400 text-[9px] font-bold">MOD</Text>
          </View>
        )}
        {!!badgeImg && (
          <Image source={badgeImg} style={{ width: 14, height: 14 }} resizeMode="contain" />
        )}
        <Text className="text-white/30 text-[10px] ml-auto">
          {formatTime(message.createdAt)}
        </Text>
      </View>

      {/* Reply preview */}
      {(message.replyToContent || message.replyTo?.content) && (
        <View className="bg-white/5 rounded-lg px-2.5 py-1.5 mb-1.5 border-l-2 border-blue-500/50">
          <Text className="text-blue-400/70 text-[11px] font-medium" numberOfLines={1}>
            {message.replyTo?.senderUsername ||
              message.replyTo?.sender?.displayName ||
              message.replyTo?.sender?.username ||
              message.replyToSenderAddress?.slice(0, 8) ||
              "user"}
          </Text>
          <Text className="text-white/50 text-xs" numberOfLines={1}>
            {message.replyToContent || message.replyTo?.content}
          </Text>
        </View>
      )}

      {/* Content */}
      {message.isDeleted ? (
        <Text className="text-white/30 text-sm italic">Message deleted</Text>
      ) : (
        <>
          {!!message.content && (
            <Text className="text-white/70 text-[13px] leading-5">{message.content}</Text>
          )}

          {/* GIF */}
          {message.gif && (
            <View className="mt-1 rounded-xl overflow-hidden" style={{ maxWidth: 200 }}>
              <Image
                source={{ uri: message.gif.previewUrl || message.gif.url }}
                style={{
                  width: Math.min(200, message.gif.width),
                  height: Math.min(
                    150,
                    (message.gif.height / message.gif.width) * Math.min(200, message.gif.width),
                  ),
                }}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Media */}
          {message.media && message.media.length > 0 && (
            <View className="mt-1 flex-row flex-wrap gap-1">
              {message.media.map((m, i) => (
                <View key={i} className="rounded-xl overflow-hidden">
                  <Image
                    source={{ uri: m.url }}
                    style={{ width: 160, height: 120 }}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Pinned indicator */}
      {message.isPinned && (
        <View className="flex-row items-center gap-1 mt-1">
          <MaterialCommunityIcons name="pin" size={11} color="rgba(255,255,255,0.3)" style={{ transform: [{ rotate: '45deg' }] }} />
          <Text className="text-white/30 text-[10px]">Pinned</Text>
        </View>
      )}
    </View>
  );
};

/* ─── Context Menu ─────────────────────────────────────────── */

const ACTIONS_CARD_HEIGHT = 320;
const PADDING = 16;
const REACTION_ROW_HEIGHT = 52;

const LiveChatContextMenuComponent: React.FC<LiveChatContextMenuProps> = ({
  visible,
  message,
  layout,
  isMe,
  isModerator,
  onClose,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin,
}) => {
  const insets = useSafeAreaInsets();

  const handleReply = useCallback(() => {
    if (!message) return;
    onClose();
    setTimeout(() => onReply?.(message), 150);
  }, [onClose, onReply, message]);

  const handleCopy = useCallback(() => {
    if (message?.content) copyToClipboard(message.content);
    onClose();
  }, [message, onClose]);

  const handleEdit = useCallback(() => {
    if (!message) return;
    onClose();
    setTimeout(() => onEdit?.(message), 150);
  }, [onClose, onEdit, message]);

  const handleDelete = useCallback(() => {
    if (!message) return;
    onClose();
    setTimeout(() => onDelete?.(message), 100);
  }, [onClose, onDelete, message]);

  const handlePin = useCallback(() => {
    if (!message) return;
    onClose();
    setTimeout(() => onPin?.(message), 100);
  }, [onClose, onPin, message]);

  const handleReaction = useCallback(
    (emoji: string) => {
      if (!message) return;
      onReact?.(message._id, emoji);
      onClose();
    },
    [message, onReact, onClose],
  );

  // Count active actions to estimate card height
  const actionCount = useMemo(() => {
    if (!message) return 0;
    let count = 0;
    if (onReply) count++; // Reply
    if (message.content?.trim()) count++; // Copy
    if (isMe && message.messageType !== "system") count++; // Edit
    if (isMe || isModerator) count++; // Delete
    if (isModerator) count++; // Pin/Unpin
    return count;
  }, [message, isMe, isModerator, onReply]);

  const estimatedActionsHeight = useMemo(
    () => REACTION_ROW_HEIGHT + actionCount * 48 + 16,
    [actionCount],
  );

  const { messageTop, actionsTop } = useMemo(() => {
    if (!layout)
      return { messageTop: SCREEN_HEIGHT * 0.25, actionsTop: SCREEN_HEIGHT * 0.5 };

    const safeTop = insets.top + 16;
    const safeBottom = SCREEN_HEIGHT - insets.bottom - 16;
    const FLOAT_EXTRA = 70; // sender header + padding
    const msgH = Math.min(layout.height + FLOAT_EXTRA, SCREEN_HEIGHT * 0.35);
    const actionsH = estimatedActionsHeight;
    const gap = 10;

    let mTop = layout.y - 40;
    if (mTop < safeTop) mTop = safeTop;

    // Try placing actions below the message
    let aTop = mTop + msgH + gap;
    if (aTop + actionsH > safeBottom) {
      // Try above
      aTop = mTop - gap - actionsH;
      if (aTop < safeTop) {
        // Clamp — push message up
        mTop = safeBottom - msgH - gap - actionsH;
        if (mTop < safeTop) mTop = safeTop;
        aTop = mTop + msgH + gap;
      }
    }

    return { messageTop: mTop, actionsTop: aTop };
  }, [layout, insets, estimatedActionsHeight]);

  if (!visible || !message) return null;

  const hasContent = !!message.content?.trim();
  const canEdit = isMe && message.messageType !== "system" && hasContent;
  const canDelete = isMe || isModerator;
  const myAddress = message.senderAddress?.toLowerCase();

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Blurred backdrop */}
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={{ flex: 1 }}
        >
          <BlurView
            intensity={Platform.OS === "ios" ? 40 : 30}
            tint="dark"
            style={{ flex: 1 }}
            {...(Platform.OS === "android"
              ? { experimentalBlurMethod: "dimezisBlurView" }
              : {})}
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

      {/* Floating message */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(120)}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: messageTop,
          left: PADDING,
          right: PADDING,
        }}
      >
        <Pressable onPress={onClose}>
          <FloatingLiveChatMessage message={message} />
        </Pressable>
      </Animated.View>

      {/* Actions card with reactions row */}
      <Animated.View
        entering={FadeIn.duration(180).delay(60)}
        exiting={FadeOut.duration(120)}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: actionsTop,
          left: PADDING,
          right: PADDING,
        }}
      >
        <Pressable>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden">
            {/* Reaction emoji row */}
            <View className="flex-row items-center justify-around px-3 py-2.5 border-b border-white/5">
              {REACTION_EMOJIS.map((emoji) => {
                const alreadyReacted =
                  message.reactions?.[emoji]?.includes(myAddress || "") ?? false;
                return (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => handleReaction(emoji)}
                    className={`w-10 h-10 items-center justify-center rounded-full ${
                      alreadyReacted ? "bg-blue-500/20" : ""
                    }`}
                    activeOpacity={0.6}
                  >
                    <Text className="text-2xl">{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Action rows */}
            <View className="py-1">
              {onReply && (
                <ActionRow icon="arrow-undo-outline" label="Reply" onPress={handleReply} />
              )}

              {hasContent && (
                <ActionRow icon="copy-outline" label="Copy" onPress={handleCopy} />
              )}

              {canEdit && onEdit && (
                <ActionRow icon="pencil-outline" label="Edit" onPress={handleEdit} />
              )}

              {isModerator && onPin && (
                <TouchableOpacity
                  onPress={handlePin}
                  activeOpacity={0.6}
                  className="flex-row items-center px-4 py-3"
                >
                  <View className="w-8 items-center">
                    <MaterialCommunityIcons
                      name={message.isPinned ? "pin-off" : "pin"}
                      size={20}
                      color="#F9FBFF"
                      style={{ transform: [{ rotate: '45deg' }] }}
                    />
                  </View>
                  <Text className="ml-3 text-[15px] text-theme-neutrals-100">
                    {message.isPinned ? "Unpin" : "Pin"}
                  </Text>
                </TouchableOpacity>
              )}

              {canDelete && onDelete && (
                <ActionRow icon="trash-outline" label="Delete" onPress={handleDelete} destructive />
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

export const LiveChatContextMenu = memo(LiveChatContextMenuComponent);
export default LiveChatContextMenu;
