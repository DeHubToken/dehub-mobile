/**
 * ChatInput — Instagram / WhatsApp-style message input bar.
 *
 * Features:
 * - Text input with send button
 * - GIF picker, image/video picker, voice recording button
 * - Selected media preview with remove
 * - Typing indicator emission
 * - Reply-to / edit-mode indicator with dismiss
 * - DM fee reminder badge
 * - Character limit enforcement (5000)
 */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Keyboard,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { openCroppedImagePicker } from "../../libs/assets.util";
import { runWithPermissions } from "../../libs/permissions.util";
import GifPicker from "./GifPicker";
import type { DmMessage, DmFee } from "../../services/dm/dm.types";
import { DM_TEXT_MAX_LENGTH } from "../../services/dm/dm.types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ChatMediaAttachment = {
  type: "image" | "video" | "gif";
  uri: string;
  thumbnailUri?: string;
  mimeType?: string;
};

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendMedia: (attachment: ChatMediaAttachment) => void;
  onSendGif: (url: string) => void;
  onStartVoice: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  disabled?: boolean;
  disabledMessage?: string;
  dmFee?: DmFee | null;
  /** Message being replied to — shows preview strip. */
  replyTo?: DmMessage | null;
  onCancelReply?: () => void;
  /** Message being edited — prefills input. */
  editingMessage?: DmMessage | null;
  onCancelEdit?: () => void;
  sending?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

const TYPING_IDLE_MS = 5000;

const ChatInputComponent: React.FC<ChatInputProps> = ({
  onSendText,
  onSendMedia,
  onSendGif,
  onStartVoice,
  onTypingChange,
  disabled = false,
  disabledMessage,
  dmFee,
  replyTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  sending = false,
}) => {
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<ChatMediaAttachment | null>(null);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill when editing
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || "");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editingMessage]);

  // ── Typing notification ─────────────────────────────────────────────────

  const emitTyping = useCallback(
    (isTyping: boolean) => {
      if (typingRef.current === isTyping) return;
      typingRef.current = isTyping;
      onTypingChange?.(isTyping);
    },
    [onTypingChange],
  );

  const handleTextChange = useCallback(
    (val: string) => {
      if (val.length > DM_TEXT_MAX_LENGTH) return;
      setText(val);
      emitTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => emitTyping(false), TYPING_IDLE_MS);
    },
    [emitTyping],
  );

  // Cleanup typing timer on unmount
  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingRef.current) emitTyping(false);
    },
    [emitTyping],
  );

  // ── Send ────────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    if (sending) return;
    if (media) {
      onSendMedia(media);
      setMedia(null);
      setText("");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    emitTyping(false);
  }, [text, media, sending, onSendText, onSendMedia, emitTyping]);

  // ── Media pickers ───────────────────────────────────────────────────────

  const handlePickImage = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      try {
        const uri = await openCroppedImagePicker({
          width: 1200,
          height: 900,
          forceJpg: true,
          quality: 0.85,
        });
        if (uri) {
          setMedia({ type: "image", uri });
          Keyboard.dismiss();
        }
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== "E_PICKER_CANCELLED") {
          console.error("[ChatInput] image picker error", e);
        }
      }
    });
  }, []);

  const handlePickVideo = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Videos,
          quality: 0.8,
          videoMaxDuration: 120,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        let thumb: string | undefined;
        try {
          const t = await VideoThumbnails.getThumbnailAsync(asset.uri, {
            time: 500,
          });
          thumb = t.uri;
        } catch {
          /* ignore */
        }
        setMedia({
          type: "video",
          uri: asset.uri,
          thumbnailUri: thumb,
          mimeType: asset.mimeType,
        });
        Keyboard.dismiss();
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== "E_PICKER_CANCELLED") {
          console.error("[ChatInput] video picker error", e);
        }
      }
    });
  }, []);

  const handleGifPicked = useCallback(
    (url: string) => {
      setGifPickerVisible(false);
      onSendGif(url);
    },
    [onSendGif],
  );

  const handleRemoveMedia = useCallback(() => setMedia(null), []);

  const handleCancelReply = useCallback(() => {
    onCancelReply?.();
  }, [onCancelReply]);

  const handleCancelEdit = useCallback(() => {
    onCancelEdit?.();
    setText("");
  }, [onCancelEdit]);

  // ── Derived state ───────────────────────────────────────────────────────

  const hasContent = text.trim().length > 0 || !!media;
  const showSend = hasContent;

  // ── Disabled state ────────────────────────────────────────────────────

  if (disabled) {
    return (
      <View className="px-4 py-3 bg-theme-neutrals-900 border-t border-theme-neutrals-800">
        <Text className="text-theme-neutrals-500 text-center text-sm">
          {disabledMessage || "Messaging is not available"}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View className="bg-theme-neutrals-900 border-t border-theme-neutrals-800/50">
        {/* Reply-to preview */}
        {replyTo && (
          <Animated.View
            entering={SlideInDown.duration(200)}
            exiting={FadeOut.duration(100)}
            className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/50 border-l-2 border-accent mx-3 mt-2 rounded-lg"
          >
            <View className="flex-1 mr-2">
              <Text className="text-[11px] text-accent font-medium">
                Replying to
              </Text>
              <Text
                className="text-[13px] text-theme-neutrals-400 mt-0.5"
                numberOfLines={1}
              >
                {replyTo.content || (replyTo.msgType === "voice" ? "🎤 Voice note" : "📷 Media")}
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancelReply} hitSlop={8}>
              <Ionicons name="close" size={18} color="#A6A9AC" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Edit-mode indicator */}
        {editingMessage && (
          <Animated.View
            entering={SlideInDown.duration(200)}
            exiting={FadeOut.duration(100)}
            className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/50 border-l-2 border-theme-yellow-500 mx-3 mt-2 rounded-lg"
          >
            <Ionicons name="pencil" size={14} color="#EAB308" />
            <View className="flex-1 ml-2">
              <Text className="text-[11px] text-theme-yellow-500 font-medium">
                Editing message
              </Text>
              <Text
                className="text-[13px] text-theme-neutrals-400 mt-0.5"
                numberOfLines={1}
              >
                {editingMessage.content}
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancelEdit} hitSlop={8}>
              <Ionicons name="close" size={18} color="#A6A9AC" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* DM fee badge */}
        {dmFee && dmFee.required && (
          <View className="flex-row items-center px-4 py-1.5 gap-1">
            <Ionicons name="diamond-outline" size={12} color="#3B82F6" />
            <Text className="text-[11px] text-accent">
              {dmFee.fee} DHB per message
            </Text>
          </View>
        )}
        {dmFee && dmFee.hasFreeAccess && dmFee.fee > 0 && (
          <View className="flex-row items-center px-4 py-1.5 gap-1">
            <Ionicons name="shield-checkmark" size={12} color="#22C55E" />
            <Text className="text-[11px] text-theme-green-500">
              Free access · normally {dmFee.fee} DHB
            </Text>
          </View>
        )}

        {/* Selected media preview */}
        {media && (
          <Animated.View
            entering={FadeIn.duration(150)}
            className="px-4 pt-2"
          >
            <View className="relative self-start">
              <Image
                source={{ uri: media.thumbnailUri || media.uri }}
                style={{ width: 80, height: 80, borderRadius: 12 }}
                resizeMode="cover"
                className="bg-theme-neutrals-700"
              />
              {media.type === "video" && (
                <View className="absolute inset-0 items-center justify-center">
                  <Ionicons name="play-circle" size={28} color="#fff" />
                </View>
              )}
              <TouchableOpacity
                onPress={handleRemoveMedia}
                className="absolute -top-1.5 -right-1.5 bg-theme-neutrals-700 rounded-full w-5 h-5 items-center justify-center"
                hitSlop={8}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Input row */}
        <View className="flex-row items-end px-3 py-2 gap-1.5">
          {/* Attach button (shows when no text) */}
          {!showSend && (
            <TouchableOpacity
              onPress={handlePickImage}
              onLongPress={handlePickVideo}
              className="p-2"
              hitSlop={4}
            >
              <Ionicons name="image-outline" size={22} color="#A6A9AC" />
            </TouchableOpacity>
          )}

          {/* GIF button */}
          {!showSend && (
            <TouchableOpacity
              onPress={() => setGifPickerVisible(true)}
              className="p-2"
              hitSlop={4}
            >
              <Text className="text-theme-neutrals-400 text-[13px] font-bold">
                GIF
              </Text>
            </TouchableOpacity>
          )}

          {/* Text input */}
          <View className="flex-1 bg-theme-neutrals-800 rounded-2xl px-3 py-2 min-h-[36px] max-h-[120px]">
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              placeholder="Message…"
              placeholderTextColor="#666"
              multiline
              maxLength={DM_TEXT_MAX_LENGTH}
              className="text-white text-[15px] leading-5 p-0 m-0"
              style={{ maxHeight: 100 }}
            />
          </View>

          {/* Voice button (when empty) / Send button (when content) */}
          {showSend ? (
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending}
              className="p-2"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Ionicons name="send" size={22} color="#3B82F6" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onStartVoice} className="p-2" hitSlop={4}>
              <Ionicons name="mic-outline" size={22} color="#A6A9AC" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* GIF Picker modal */}
      <GifPicker
        visible={gifPickerVisible}
        onPick={handleGifPicked}
        onClose={() => setGifPickerVisible(false)}
      />
    </>
  );
};

export default memo(ChatInputComponent);
