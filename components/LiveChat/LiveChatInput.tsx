import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Icon from "../ui/Icon";
import { sendAIChat } from "../../services/ai.service";
import type { LiveChatMessageData } from "../../services/livechat.service";

const MAX_LENGTH = 500;
const WARN_THRESHOLD = 50;

interface LiveChatInputProps {
  onSend: (content: string, replyTo?: string) => void;
  replyingTo: LiveChatMessageData | null;
  onCancelReply: () => void;
  editingMessage: LiveChatMessageData | null;
  onCancelEdit: () => void;
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
  editingMessage,
  onCancelEdit,
  isBanned,
  canSend,
  onTyping,
  slowMode,
  slowModeSeconds = 5,
  onGifPress,
}) => {
  const [text, setText] = useState("");
  const [cooldown, setCooldown] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [editingMessage]);

  const remaining = MAX_LENGTH - text.length;
  const showCounter = remaining <= WARN_THRESHOLD;
  const isOverLimit = remaining < 0;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isBanned || !canSend || cooldown || isOverLimit) return;

    onSend(trimmed, replyingTo?._id);
    setText("");
    onCancelReply();
    if (editingMessage) onCancelEdit();

    if (slowMode && !editingMessage) {
      setCooldown(true);
      cooldownTimerRef.current = setTimeout(() => {
        setCooldown(false);
      }, (slowModeSeconds || 5) * 1000);
    }
  }, [text, isBanned, canSend, cooldown, isOverLimit, onSend, replyingTo, onCancelReply, slowMode, slowModeSeconds, editingMessage, onCancelEdit]);

  const handleEnhance = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || enhancing) return;
    setEnhancing(true);
    try {
      const res = await sendAIChat({
        messages: [
          {
            role: "user" as const,
            content: `Enhance this message to be more engaging, clear, and well-written while keeping the same meaning and tone. Return ONLY the enhanced message text, nothing else.\n\nMessage: ${trimmed}`,
          },
        ],
      });
      if (res?.response) setText(res.response.trim());
    } catch (e) {
      console.error("[LiveChatInput] enhance error", e);
    } finally {
      setEnhancing(false);
    }
  }, [text, enhancing]);

  const handleChangeText = useCallback(
    (val: string) => {
      setText(val);
      if (val.length > 0) onTyping(true);
    },
    [onTyping],
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
      {editingMessage && (
        <View className="flex-row items-center px-4 py-2 bg-white/5 border-l-2 border-amber-500 mx-3 mt-2 rounded-lg">
          <View className="flex-1 mr-2">
            <Text className="text-amber-400 text-[11px] font-medium">Editing message</Text>
            <Text className="text-white/40 text-xs" numberOfLines={1}>
              {editingMessage.content}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { onCancelEdit(); setText(""); }}
            hitSlop={8}
          >
            <Icon name="X" size={18} color="#A6A9AC" />
          </TouchableOpacity>
        </View>
      )}

      {replyingTo && !editingMessage && (
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
            <Icon name="X" size={18} color="#A6A9AC" />
          </TouchableOpacity>
        </View>
      )}

      <View className="flex-row items-end px-2 py-1.5 gap-0.5">
        {!hasContent && onGifPress && !disabled && (
          <TouchableOpacity
            onPress={onGifPress}
            className="p-2 items-center justify-center"
            hitSlop={4}
            activeOpacity={0.6}
            style={{ width: 38, height: 38 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#A6A9AC', letterSpacing: 0.5 }}>GIF</Text>
          </TouchableOpacity>
        )}

        <View className="flex-1 bg-theme-neutrals-800 rounded-xl px-3 py-1.5 max-h-[100px]">
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor="#666"
            multiline
            maxLength={MAX_LENGTH}
            editable={!disabled && !enhancing}
            className="text-white text-[14px] leading-5 p-2 m-0"
            style={{ maxHeight: 80 }}
          />
        </View>

        {showCounter && (
          <Text
            className={`text-[11px] font-medium px-1 self-center ${
              isOverLimit ? "text-red-400" : remaining <= 20 ? "text-amber-400" : "text-white/30"
            }`}
          >
            {remaining}
          </Text>
        )}

        <TouchableOpacity
          onPress={handleEnhance}
          className="p-2"
          hitSlop={4}
          activeOpacity={0.6}
          disabled={!text.trim() || enhancing}
        >
          {enhancing ? (
            <ActivityIndicator size={18} color="#A78BFA" />
          ) : (
            <Icon
              name="Sparkles"
              size={22}
              color={text.trim() ? "#A78BFA" : "#3A3A3C"}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSend}
          disabled={disabled || !text.trim() || cooldown || isOverLimit || enhancing}
          className="p-2"
        >
          <Icon
            name="Send"
            size={22}
            color={text.trim() && !disabled && !cooldown && !isOverLimit ? "#3B82F6" : "#333"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default memo(LiveChatInput);
