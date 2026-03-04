import React, { memo, useCallback, useMemo } from "react";
import { View, Text, Image, TouchableOpacity, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
import type { LiveChatMessageData, LiveChatUser } from "../../services/livechat.service";

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
};

interface LiveChatMessageProps {
  message: LiveChatMessageData;
  myAddress: string;
  isModerator: boolean;
  showReactionPicker?: boolean;
  onReply?: (msg: LiveChatMessageData) => void;
  onReact?: (msg: LiveChatMessageData) => void;
  onSelectReaction?: (messageId: string, emoji: string) => void;
  onDelete?: (msg: LiveChatMessageData) => void;
  onAvatarPress?: (user: LiveChatUser) => void;
  onLongPress?: (msg: LiveChatMessageData) => void;
}

const REACTION_EMOJIS = ["🔥", "❤️", "😂", "👀", "💯", "🙌"];

const LiveChatMessage: React.FC<LiveChatMessageProps> = ({
  message,
  myAddress,
  isModerator,
  showReactionPicker,
  onReply,
  onReact,
  onSelectReaction,
  onDelete,
  onAvatarPress,
  onLongPress,
}) => {
  const sender = message.sender;
  const isMe = message.senderAddress?.toLowerCase() === myAddress;
  const isSystem = message.messageType === "system";
  const avatarUrl = getAvatarUrl(sender?.avatarUrl || "");
  const displayName = sender?.displayName || sender?.username || message.senderAddress?.slice(0, 8) || "Anon";
  const badgeBalance = resolveBadgeBalance(sender || {});
  const badgeImg = getBadgeUrl(badgeBalance);
  const isMod = sender?.isModerator;

  const handleReply = useCallback(() => onReply?.(message), [onReply, message]);
  const handleReact = useCallback(() => onReact?.(message), [onReact, message]);
  const handleDelete = useCallback(() => onDelete?.(message), [onDelete, message]);
  const handleAvatar = useCallback(
    () => sender && onAvatarPress?.(sender),
    [onAvatarPress, sender]
  );
  const handleLongPress = useCallback(() => onLongPress?.(message), [onLongPress, message]);

  // System messages
  if (isSystem) {
    return (
      <View className="items-center py-2 px-6">
        <View className="bg-white/5 rounded-full px-4 py-1.5">
          <Text className="text-white/50 text-xs text-center">{message.content}</Text>
        </View>
      </View>
    );
  }

  // Reactions display
  const reactionEntries = useMemo(() => {
    if (!message.reactions) return [];
    return Object.entries(message.reactions).filter(([, addrs]) => addrs.length > 0);
  }, [message.reactions]);

  return (
    <Pressable
      onLongPress={handleLongPress}
      className="flex-row px-3 py-1.5"
      style={{ opacity: message.isDeleted ? 0.4 : 1 }}
    >
      {/* Avatar */}
      <TouchableOpacity onPress={handleAvatar} activeOpacity={0.7}>
        <Avatar uri={avatarUrl} size={36} />
      </TouchableOpacity>

      {/* Content */}
      <View className="flex-1 ml-2.5">
        {/* Name + badge + time */}
        <View className="flex-row items-center gap-1.5 mb-0.5">
          <Text
            className={`font-bold text-[14px] ${isMe ? "text-blue-400" : "text-white"}`}
            numberOfLines={1}
          >
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
          <View className="bg-white/5 rounded-lg px-2.5 py-1.5 mb-1 border-l-2 border-blue-500/50">
            <Text className="text-blue-400/70 text-[11px] font-medium" numberOfLines={1}>
              {message.replyTo?.senderUsername ||
                message.replyTo?.sender?.displayName ||
                message.replyTo?.sender?.username ||
                message.replyToSenderAddress?.slice(0, 8) ||
                "user"}…
            </Text>
            <Text className="text-white/50 text-xs" numberOfLines={1}>
              {message.replyToContent || message.replyTo?.content}
            </Text>
          </View>
        )}

        {/* Message content */}
        {message.isDeleted ? (
          <Text className="text-white/30 text-sm italic">Message deleted</Text>
        ) : (
          <>
            {!!message.content && (
              <Text className="text-white/70 text-[13px] leading-5">{message.content}</Text>
            )}

            {/* GIF */}
            {message.gif && (
              <View className="mt-1 rounded-xl overflow-hidden" style={{ maxWidth: 240 }}>
                <Image
                  source={{ uri: message.gif.previewUrl || message.gif.url }}
                  style={{
                    width: Math.min(240, message.gif.width),
                    height: Math.min(180, (message.gif.height / message.gif.width) * Math.min(240, message.gif.width)),
                  }}
                  resizeMode="cover"
                />
              </View>
            )}

            {/* Media images */}
            {message.media && message.media.length > 0 && (
              <View className="mt-1 flex-row flex-wrap gap-1">
                {message.media.map((m, i) => (
                  <View key={i} className="rounded-xl overflow-hidden">
                    <Image
                      source={{ uri: m.url }}
                      style={{ width: 200, height: 150 }}
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
            <Ionicons name="pin" size={10} color="rgba(255,255,255,0.3)" />
            <Text className="text-white/30 text-[10px]">Pinned</Text>
          </View>
        )}

        {/* Reactions */}
        {reactionEntries.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-1">
            {reactionEntries.map(([emoji, addrs]) => (
              <TouchableOpacity
                key={emoji}
                onPress={() => onSelectReaction?.(message._id, emoji)}
                className={`flex-row items-center rounded-full px-2 py-0.5 ${
                  addrs.includes(myAddress) ? "bg-blue-500/20 border border-blue-500/30" : "bg-white/5"
                }`}
              >
                <Text className="text-sm">{emoji}</Text>
                <Text className="text-white/50 text-[10px] ml-1">{addrs.length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick actions */}
        {!message.isDeleted && (
          <View className="flex-row items-center gap-3 mt-1">
            <TouchableOpacity onPress={handleReply} hitSlop={8}>
              <Ionicons name="arrow-undo-outline" size={14} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReact} hitSlop={8}>
              <Ionicons name="happy-outline" size={14} color="rgba(255,255,255,0.25)" />
            </TouchableOpacity>
            {(isMe || isModerator) && (
              <TouchableOpacity onPress={handleDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={13} color="rgba(255,255,255,0.2)" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Inline reaction picker */}
        {showReactionPicker && (
          <View className="flex-row items-center gap-2 py-1.5 mt-1 px-2 bg-white/5 rounded-full self-start">
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                onPress={() => onSelectReaction?.(message._id, emoji)}
                className="px-1.5 py-0.5"
              >
                <Text className="text-lg">{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
};

export default memo(LiveChatMessage);
