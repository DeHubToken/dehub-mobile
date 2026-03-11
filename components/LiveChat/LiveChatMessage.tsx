import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, TouchableOpacity, Pressable, Animated } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
import type { LiveChatMessageData, LiveChatUser } from "../../services/livechat.service";
import type { MessageLayout } from "./LiveChatContextMenu";

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
  onSelectReaction?: (messageId: string, emoji: string) => void;
  onAvatarPress?: (user: LiveChatUser) => void;
  onLongPress?: (msg: LiveChatMessageData, layout: MessageLayout) => void;
  onReplyPress?: (messageId: string) => void;
  highlighted?: boolean;
}

const REACTION_EMOJIS = ["🔥", "❤️", "😂", "👀", "💯", "🙌"];

const LiveChatMessage: React.FC<LiveChatMessageProps> = ({
  message,
  myAddress,
  isModerator,
  onSelectReaction,
  onAvatarPress,
  onLongPress,
  onReplyPress,
  highlighted = false,
}) => {
  const sender = message.sender;
  const isMe = message.senderAddress?.toLowerCase() === myAddress;
  const isSystem = message.messageType === "system";
  const avatarUrl = getAvatarUrl(sender?.avatarUrl || "");
  const displayName = sender?.displayName || sender?.username || message.senderAddress?.slice(0, 8) || "Anon";
  const badgeBalance = resolveBadgeBalance(sender || {});
  const badgeImg = getBadgeUrl(badgeBalance);
  const isMod = sender?.isModerator;

  const containerRef = useRef<View>(null);

  // Highlight animation (pulse then fade, same as comment highlights)
  const [showHighlight, setShowHighlight] = useState(highlighted);
  const highlightOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (highlighted) {
      setShowHighlight(true);
      highlightOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(highlightOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(highlightOpacity, { toValue: 0.4, duration: 350, useNativeDriver: true }),
        Animated.timing(highlightOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(highlightOpacity, { toValue: 0.4, duration: 350, useNativeDriver: true }),
        Animated.timing(highlightOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(highlightOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => setShowHighlight(false));
    } else {
      setShowHighlight(false);
      highlightOpacity.setValue(0);
    }
  }, [highlighted, highlightOpacity]);

  const handleAvatar = useCallback(
    () => sender && onAvatarPress?.(sender),
    [onAvatarPress, sender]
  );
  const handleLongPress = useCallback(() => {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.(message, { x, y, width, height });
    });
  }, [onLongPress, message]);

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
      ref={containerRef}
      onLongPress={handleLongPress}
      className="flex-row px-3 py-1.5"
      style={{ opacity: message.isDeleted ? 0.4 : 1 }}
    >
      {/* Highlight overlay */}
      {showHighlight && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(59, 130, 246, 0.12)",
            borderRadius: 10,
            opacity: highlightOpacity,
          }}
          pointerEvents="none"
        />
      )}

      {/* Avatar */}
      <TouchableOpacity onPress={handleAvatar} activeOpacity={0.7}>
        <Avatar uri={avatarUrl} size={36} name={displayName} />
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
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => {
              const replyId = message.replyTo?._id || message.replyTo?.id;
              if (replyId && onReplyPress) onReplyPress(replyId);
            }}
            className="bg-white/5 rounded-lg px-2.5 py-1.5 mb-1 border-l-2 border-blue-500/50"
          >
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
          </TouchableOpacity>
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
            <MaterialCommunityIcons name="pin" size={11} color="rgba(255,255,255,0.3)" style={{ transform: [{ rotate: '45deg' }] }} />
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
      </View>
    </Pressable>
  );
};

export default memo(LiveChatMessage);
