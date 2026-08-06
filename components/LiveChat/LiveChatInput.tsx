import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Keyboard,
} from "react-native";
import Icon from "../ui/Icon";
import MentionSuggestions from "../common/MentionSuggestions";
import { useMentions } from "../../hooks/useMentions";
import { sendAIChat } from "../../services/ai.service";
import { ASSISTANT_USERNAME, mentionsAssistant } from "../../libs/assistant";
import type { LiveChatMessageData } from "../../services/livechat.service";
import { uploadLiveChatVoice } from "../../services/livechat.service";
import { toastError } from "../../libs/toast";
import { useVoiceRecorder, VoiceNoteRecordingOverlay } from "../Comments/VoiceNoteRecorder";
import type { VoiceNoteResult } from "../Comments/VoiceNoteRecorder";

const MAX_LENGTH = 500;
const WARN_THRESHOLD = 50;

interface LiveChatInputProps {
  onSend: (content: string, replyTo?: string, audioUrl?: string, audioDuration?: number) => void;
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
  const mentions = useMentions(text, setText);
  const [cooldown, setCooldown] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVoiceRecordingComplete = useCallback(
    async (result: VoiceNoteResult) => {
      try {
        setUploadingVoice(true);
        const fileName = result.uri.split("/").pop() || "voice_note.m4a";
        const mimeType = result.mimeType || (Platform.OS === "ios" ? "audio/m4a" : "audio/mp4");

        const uploadRes = await uploadLiveChatVoice(result.uri, mimeType, fileName);
        if (uploadRes?.url) {
          onSend(
            "",
            replyingTo?._id,
            uploadRes.url,
            uploadRes.duration || Math.round(result.durationMs / 1000)
          );
          onCancelReply();
        }
      } catch (e) {
        console.error("[LiveChatInput] failed to upload voice", e);
        toastError("Failed to upload voice message");
      } finally {
        setUploadingVoice(false);
      }
    },
    [onSend, replyingTo, onCancelReply]
  );

  const recorder = useVoiceRecorder({
    onRecordingComplete: handleVoiceRecordingComplete,
    onCancel: () => {},
  });

  const handleStartRecording = useCallback(() => {
    Keyboard.dismiss();
    recorder.startRecording();
  }, [recorder]);

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [editingMessage]);

  const remaining = MAX_LENGTH - text.length;
  const showCounter = remaining <= WARN_THRESHOLD;
  const isOverLimit = remaining < 0;

  /** Prefix the draft with the mention and put the cursor after it. */
  const handleAskAssistant = useCallback(() => {
    setText((prev) => (mentionsAssistant(prev) ? prev : `@${ASSISTANT_USERNAME} ${prev.trimStart()}`));
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isBanned || !canSend || cooldown || isOverLimit) return;

    onSend(trimmed, replyingTo?._id);
    setText("");
    mentions.reset();
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
      mentions.handleChangeText(val);
      if (val.length > 0) onTyping(true);
    },
    [mentions, onTyping],
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
      {editingMessage && !recorder.isRecording && !uploadingVoice && (
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

      {replyingTo && !editingMessage && !recorder.isRecording && !uploadingVoice && (
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

      <MentionSuggestions
        visible={mentions.showSuggestions}
        suggestions={mentions.suggestions}
        onSelect={mentions.selectMention}
        loading={mentions.loading}
      />

      {/* The bot only ever answers a direct mention, so the tag has to be
          discoverable — otherwise nobody knows it is there. */}
      {!disabled && !editingMessage && !recorder.isRecording && !uploadingVoice && (
        <View className="flex-row items-center px-3 pt-1.5">
          {mentionsAssistant(text) ? (
            <View className="flex-row items-center gap-1">
              <Icon name="Sparkles" size={11} color="#A6A9AC" />
              <Text className="text-white/50 text-[11px]">
                {ASSISTANT_USERNAME} will reply in chat
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleAskAssistant}
              hitSlop={6}
              activeOpacity={0.6}
              className="flex-row items-center gap-1"
              accessibilityRole="button"
              accessibilityLabel="Ask the assistant"
            >
              <Icon name="Sparkles" size={11} color="#8B8D90" />
              <Text className="text-white/35 text-[11px]">Tag @assistant for help</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {uploadingVoice ? (
        <View className="flex-row items-center justify-center py-4 bg-theme-neutrals-800 rounded-xl mx-2 my-1.5">
          <ActivityIndicator size="small" color="#F4F4F5" />
          <Text className="text-white/70 text-sm ml-2">Uploading voice message...</Text>
        </View>
      ) : recorder.isRecording ? (
        <VoiceNoteRecordingOverlay recorder={recorder} />
      ) : (
        <View className="flex-row items-end px-2 py-1.5 gap-0.5">
          {!hasContent && onGifPress && !disabled && (
            <TouchableOpacity
              onPress={onGifPress}
              className="p-2 items-center justify-center"
              hitSlop={4}
              activeOpacity={0.6}
              style={{ width: 38, height: 38 }}
              accessibilityRole="button"
              accessibilityLabel="Add a GIF"
            >
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#A6A9AC', letterSpacing: 0.5 }}>GIF</Text>
            </TouchableOpacity>
          )}

          <View className="flex-1 bg-theme-neutrals-800 rounded-xl px-3 py-1.5 max-h-[100px]">
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleChangeText}
              onSelectionChange={mentions.handleSelectionChange}
              placeholder={placeholder}
              placeholderTextColor="#8B8D90"
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
            accessibilityRole="button"
            accessibilityLabel="Enhance message"
            accessibilityState={{ disabled: !text.trim() || enhancing }}
          >
            {enhancing ? (
              <ActivityIndicator size={18} color="#F4F4F5" />
            ) : (
              <Icon
                name="Sparkles"
                size={22}
                color={text.trim() ? "#F4F4F5" : "#52525B"}
              />
            )}
          </TouchableOpacity>

          {text.trim() || editingMessage ? (
            <TouchableOpacity
              onPress={handleSend}
              disabled={disabled || !text.trim() || cooldown || isOverLimit || enhancing}
              className="p-2"
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{
                disabled: disabled || !text.trim() || cooldown || isOverLimit || enhancing,
              }}
            >
              <Icon
                name="Send"
                size={22}
                color={text.trim() && !disabled && !cooldown && !isOverLimit ? "#F4F4F5" : "#52525B"}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleStartRecording}
              disabled={disabled}
              className="p-2"
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Record voice message"
              accessibilityState={{ disabled }}
            >
              <Icon
                name="Mic"
                size={22}
                color={!disabled ? "#A6A9AC" : "#52525B"}
              />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export default memo(LiveChatInput);
