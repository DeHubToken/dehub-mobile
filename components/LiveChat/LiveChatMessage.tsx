import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, Image, TouchableOpacity, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import Icon from "../ui/Icon";
import TranslateButton from "../ui/TranslateButton";
import { useTranslation } from "../../hooks/useTranslation";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
import { openInApp } from "../../libs/links.utils";
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

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>)"']+/gi;

const renderLinkedText = (text: string) => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "gi");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <Text
        key={match.index}
        style={{ color: "#60A5FA" }}
        onPress={() => openInApp(url)}
      >
        {url}
      </Text>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
};

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

  // Highlight animation using reanimated
  const highlightOpacity = useSharedValue(0);

  useEffect(() => {
    if (highlighted) {
      highlightOpacity.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0.4, { duration: 350 }),
        withTiming(1, { duration: 350 }),
        withTiming(0.4, { duration: 350 }),
        withTiming(1, { duration: 350 }),
        withDelay(600, withTiming(0, { duration: 500 })),
      );
    } else {
      highlightOpacity.value = 0;
    }
  }, [highlighted, highlightOpacity]);

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
  }));

  const handleAvatar = useCallback(
    () => sender && onAvatarPress?.(sender),
    [onAvatarPress, sender]
  );
  const handleLongPress = useCallback(() => {
    containerRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.(message, { x, y, width, height });
    });
  }, [onLongPress, message]);

  const translationTexts = useMemo(() => ({ content: message.content || '' }), [message.content]);
  const { isTranslated, translatedTexts, isLoading: translating, handleTranslate, handleShowOriginal, shouldShow: showTranslate } =
    useTranslation(translationTexts, (message as any).detectedLanguage);

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
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(59, 130, 246, 0.12)",
            borderRadius: 10,
          },
          highlightStyle,
        ]}
        pointerEvents="none"
      />

      <TouchableOpacity onPress={handleAvatar} activeOpacity={0.7}>
        <Avatar uri={avatarUrl} size={36} name={displayName} />
      </TouchableOpacity>

      <View className="flex-1 ml-2.5">
        <View className="flex-row items-center gap-1.5 mb-0.5 flex-wrap">
          <Text
            className={`font-bold text-[14px] ${isMe ? "text-blue-400" : "text-white"}`}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {message.isPinned && (
            <View className="flex-row items-center bg-amber-500/15 rounded px-1.5 py-0.5 gap-0.5">
              <Icon name="Pin" size={9} color="#F59E0B" />
              <Text className="text-amber-400 text-[9px] font-bold">Pinned</Text>
            </View>
          )}
          {isMod && (
            <View className="bg-emerald-500/15 rounded px-1.5 py-0.5">
              <Text className="text-emerald-400 text-[9px] font-bold">MOD</Text>
            </View>
          )}
          {!!badgeImg && (
            <Image source={badgeImg} style={{ width: 14, height: 14 }} resizeMode="contain" />
          )}
          <Text className="text-white/30 text-[10px] ml-auto">
            {formatTime(message.createdAt)}
          </Text>
        </View>

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

        {message.isDeleted ? (
          <Text className="text-white/30 text-sm italic">Message deleted</Text>
        ) : (
          <>
            {!!message.content && (
              <Text className="text-white/70 text-[13px] leading-5">
                {renderLinkedText(isTranslated ? (translatedTexts.content || message.content) : message.content)}
              </Text>
            )}

            {showTranslate && !!message.content && (
              <TranslateButton
                isTranslated={isTranslated}
                isLoading={translating}
                detectedLanguage={(message as any).detectedLanguage}
                onTranslate={handleTranslate}
                onShowOriginal={handleShowOriginal}
              />
            )}

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
