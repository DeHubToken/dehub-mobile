import React, { memo, useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons, AntDesign } from "@expo/vector-icons";
import type { LiveChatMessageData } from "../../services/livechat.service";

const MAX_LENGTH = 500;
const WARN_THRESHOLD = 50;

interface LiveChatInputProps {
  onSend: (content: string, replyTo?: string) => void;
  replyingTo: LiveChatMessageData | null;
  onCancelReply: () => void;
  isBanned: boolean;
  canSend: boolean;
  onTyping: (isTyping: boolean) => void;
  slowMode?: boolean;
  slowModeSeconds?: number;
  onGifPress?: () => void;
}

const LiveChatInput: React.FC<LiveChatInputProps> = ({
  onSend,
  replyingTo,
  onCancelReply,
  isBanned,
  canSend,
  onTyping,
  slowMode,
  slowModeSeconds = 5,
  onGifPress,
}) => {
  const [text, setText] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remaining = MAX_LENGTH - text.length;
  const showCounter = remaining <= WARN_THRESHOLD;
  const isOverLimit = remaining < 0;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isBanned || !canSend || cooldown || isOverLimit) return;

    onSend(trimmed, replyingTo?._id);
    setText("");
    onCancelReply();

    if (slowMode) {
      setCooldown(true);
      cooldownTimerRef.current = setTimeout(() => {
        setCooldown(false);
      }, (slowModeSeconds || 5) * 1000);
    }
  }, [text, isBanned, canSend, cooldown, isOverLimit, onSend, replyingTo, onCancelReply, slowMode, slowModeSeconds]);

  const handleChangeText = useCallback(
    (val: string) => {
      setText(val);
      if (val.length > 0) onTyping(true);
    },
    [onTyping]
  );

  const disabled = isBanned || !canSend;
  const placeholder = isBanned
    ? "You are banned from this chat"
    : cooldown
    ? `Slow mode (${slowModeSeconds}s)...`
    : "Type a message...";

  const hasContent = text.length > 0;

  return (
    <View className="border-t border-white/5">
      {/* Reply preview bar */}
      {replyingTo && (
        <View className="flex-row items-center px-4 py-2 bg-white/5 border-l-2 border-blue-500 mx-3 mt-2 rounded-lg">
          <View className="flex-1 mr-2">
            <Text className="text-blue-400 text-[11px] font-medium">
              Replying to {replyingTo.sender?.displayName || replyingTo.sender?.username || "user"}
            </Text>
            <Text className="text-white/40 text-xs" numberOfLines={1}>
              {replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} hitSlop={8}>
            <Ionicons name="close" size={18} color="#A6A9AC" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input row */}
      <View className="flex-row items-end px-2 py-1.5 gap-0.5">
        {/* GIF button — only when not typing */}
        {!hasContent && onGifPress && !disabled && (
          <TouchableOpacity
            onPress={onGifPress}
            className="p-2"
            hitSlop={4}
            activeOpacity={0.6}
          >
            <AntDesign name="gif" size={24} color="#A6A9AC" />
          </TouchableOpacity>
        )}

        {/* Text input */}
        <View className="flex-1 bg-theme-neutrals-800 rounded-xl px-3 py-1.5 max-h-[100px]">
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor="#666"
            multiline
            maxLength={MAX_LENGTH}
            editable={!disabled}
            className="text-white text-[14px] leading-5 p-2 m-0"
            style={{ maxHeight: 80 }}
          />
        </View>

        {/* Character counter */}
        {showCounter && (
          <Text
            className={`text-[11px] font-medium px-1 self-center ${
              isOverLimit ? "text-red-400" : remaining <= 20 ? "text-amber-400" : "text-white/30"
            }`}
          >
            {remaining}
          </Text>
        )}

        {/* Send button — always visible */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={disabled || !text.trim() || cooldown || isOverLimit}
          className="p-2"
        >
          <Ionicons
            name="send"
            size={24}
            color={text.trim() && !disabled && !cooldown && !isOverLimit ? "#3B82F6" : "#333"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default memo(LiveChatInput);
