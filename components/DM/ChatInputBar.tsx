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
import { Ionicons, AntDesign } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { openCroppedImagePicker } from "../../libs/assets.util";
import { runWithPermissions } from "../../libs/permissions.util";
import GifPicker from "./GifPicker";
import type { DmMessage, DmFee } from "../../services/dm/dm.types";
import { DM_TEXT_MAX_LENGTH } from "../../services/dm/dm.types";


export type ChatMediaAttachment = {
  type: "image" | "video" | "gif";
  uri: string;
  thumbnailUri?: string;
  mimeType?: string;
};

interface ChatInputBarProps {
  onSendText: (text: string) => void;
  onSendMedia: (attachment: ChatMediaAttachment, caption?: string) => void;
  onSendGif: (url: string, caption?: string) => void;
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
  /** Current voluntary tip amount set by user (0 = no tip). */
  tipAmount?: number;
  /** Triggered when user taps the tip (💎) button to open the tip sheet. */
  onTipPress?: () => void;
  /** Clear the current voluntary tip. */
  onClearTip?: () => void;
  /** Current DHB balance of the user (for display & validation). */
  dhbBalance?: number | null;
}


const TYPING_IDLE_MS = 5000;

const ChatInputBarComponent: React.FC<ChatInputBarProps> = ({
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
  tipAmount = 0,
  onTipPress,
  onClearTip,
  dhbBalance,
}) => {
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<ChatMediaAttachment | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
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


  const handleSend = useCallback(() => {
    if (sending) return;

    // GIF with optional caption
    if (gifUrl) {
      const caption = text.trim() || undefined;
      onSendGif(gifUrl, caption);
      setGifUrl(null);
      setText("");
      return;
    }

    // Media with optional caption
    if (media) {
      const caption = text.trim() || undefined;
      onSendMedia(media, caption);
      setMedia(null);
      setText("");
      return;
    }

    // Text only (or tip-only with no content)
    const trimmed = text.trim();
    // Allow sending if there's text OR if a tip is attached (tip-only send)
    if (!trimmed && !tipAmount) return;
    onSendText(trimmed);
    setText("");
    emitTyping(false);
  }, [text, media, gifUrl, sending, onSendText, onSendMedia, onSendGif, emitTyping, tipAmount]);


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
          setGifUrl(null); // clear GIF if any
          setMedia({ type: "image", uri });
        }
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== "E_PICKER_CANCELLED") {
          console.error("[ChatInputBar] image picker error", e);
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
        setGifUrl(null);
        setMedia({
          type: "video",
          uri: asset.uri,
          thumbnailUri: thumb,
          mimeType: asset.mimeType,
        });
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== "E_PICKER_CANCELLED") {
          console.error("[ChatInputBar] video picker error", e);
        }
      }
    });
  }, []);

  const handleGifPicked = useCallback((url: string) => {
    setGifPickerVisible(false);
    setMedia(null); // clear media if any
    setGifUrl(url);
  }, []);

  const handleRemoveMedia = useCallback(() => {
    setMedia(null);
    setGifUrl(null);
  }, []);

  const handleCancelReply = useCallback(() => {
    onCancelReply?.();
  }, [onCancelReply]);

  const handleCancelEdit = useCallback(() => {
    onCancelEdit?.();
    setText("");
  }, [onCancelEdit]);


  const hasContent = text.trim().length > 0 || !!media || !!gifUrl;
  // Show send button when there's content OR a tip is attached (tip-only send)
  const showSendButton = hasContent || tipAmount > 0;
  const hasMediaOrGif = !!media || !!gifUrl;
  const placeholder = hasMediaOrGif ? "Add a caption…" : "Message…";

  // Fee / tip display logic
  const feeRequired = !!dmFee?.required && !dmFee?.hasFreeAccess;
  const hasFreeAccess = !!dmFee?.hasFreeAccess && (dmFee?.fee ?? 0) > 0;
  const effectiveFee = feeRequired ? (dmFee?.fee ?? 0) : 0;
  // When tip covers the fee (tip >= fee), total = tip only (single on-chain tx)
  // Otherwise total = fee (no tip) or just tip (no fee)
  const totalCost =
    tipAmount > 0 && feeRequired
      ? tipAmount // tip covers the fee — single payment
      : effectiveFee + tipAmount;
  const showCostOnSend = totalCost > 0;
  const canAddTip = true; // Tips allowed even with per-message fee (tip must cover the fee)
  // When fee required, tip must be >= fee to cover it
  const tipBelowFee = feeRequired && tipAmount > 0 && tipAmount < effectiveFee;
  const insufficientBalance =
    showCostOnSend && dhbBalance != null && dhbBalance < totalCost;


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

        {/* Voluntary tip badge */}
        {tipAmount > 0 && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            className="flex-row items-center mx-3 mt-2 px-3 py-1.5 bg-amber-500/10 rounded-lg self-start"
          >
            <Ionicons name="diamond" size={12} color="#F59E0B" />
            <Text className="text-[11px] text-amber-400 font-medium ml-1">
              Tip: {tipAmount} DHB
            </Text>
            <TouchableOpacity
              onPress={onClearTip}
              hitSlop={8}
              className="ml-2"
            >
              <Ionicons name="close-circle" size={14} color="#A6A9AC" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Balance / validation indicator — shown when a cost is involved */}
        {showCostOnSend && (tipBelowFee || dhbBalance != null) && (
          <Animated.View
            entering={FadeIn.duration(150)}
            className={`flex-row items-center mx-3 mt-1.5 px-3 py-1 rounded-lg self-start ${
              tipBelowFee || insufficientBalance ? "bg-red-500/10" : "bg-white/5"
            }`}
          >
            <Ionicons
              name={tipBelowFee ? "alert-circle" : "wallet-outline"}
              size={11}
              color={tipBelowFee || insufficientBalance ? "#EF4444" : "#A6A9AC"}
            />
            <Text
              className={`text-[10px] font-medium ml-1 ${
                tipBelowFee || insufficientBalance ? "text-red-400" : "text-theme-neutrals-400"
              }`}
            >
              {tipBelowFee
                ? `Tip must be at least ${effectiveFee} DHB (message fee)`
                : insufficientBalance
                ? `Insufficient balance · ${Number(dhbBalance).toLocaleString()} DHB`
                : `Balance: ${Number(dhbBalance!).toLocaleString()} DHB`}
            </Text>
          </Animated.View>
        )}

        {/* Selected media / GIF preview */}
        {(media || gifUrl) && (
          <Animated.View
            entering={FadeIn.duration(150)}
            className="px-3 pt-2"
          >
            <View className="relative self-start">
              <Image
                source={{ uri: media?.thumbnailUri || media?.uri || gifUrl || "" }}
                style={{ width: 80, height: 80, borderRadius: 12 }}
                resizeMode="cover"
                className="bg-theme-neutrals-700"
              />
              {media?.type === "video" && (
                <View className="absolute inset-0 items-center justify-center">
                  <Ionicons name="play-circle" size={28} color="#fff" />
                </View>
              )}
              {gifUrl && (
                <View className="absolute bottom-1 left-1 bg-black/60 rounded px-1">
                  <Text className="text-[9px] text-white font-bold">GIF</Text>
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
        <View className="flex-row items-end px-2 py-2 gap-0.5">
          {/* Action buttons — hidden when typing */}
          {!hasContent && (
            <>
              {/* Image button */}
              <TouchableOpacity
                onPress={handlePickImage}
                className="p-2"
                hitSlop={4}
                activeOpacity={0.6}
              >
                <Ionicons name="image-outline" size={22} color="#A6A9AC" />
              </TouchableOpacity>

              {/* Video button */}
              <TouchableOpacity
                onPress={handlePickVideo}
                className="p-2"
                hitSlop={4}
                activeOpacity={0.6}
              >
                <Ionicons name="videocam-outline" size={22} color="#A6A9AC" />
              </TouchableOpacity>

              {/* GIF button */}
              <TouchableOpacity
                onPress={() => setGifPickerVisible(true)}
                className="p-2"
                hitSlop={4}
                activeOpacity={0.6}
              >
                <AntDesign name="gif" size={24} color="#A6A9AC" />
              </TouchableOpacity>

            </>
          )}

          {/* Text input */}
          <View className="flex-1 bg-theme-neutrals-800 rounded-2xl px-3 py-2 min-h-[36px] max-h-[120px]">
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              placeholder={placeholder}
              placeholderTextColor="#666"
              multiline
              maxLength={DM_TEXT_MAX_LENGTH}
              className="text-white text-[15px] leading-5 p-0 m-0"
              style={{ maxHeight: 100 }}
            />
          </View>

          {/* Send / Mic / Send with cost */}
          {showSendButton ? (
            showCostOnSend ? (
              // Send button with cost label (per-message fee or tip attached)
              <TouchableOpacity
                onPress={handleSend}
                disabled={sending || insufficientBalance || tipBelowFee}
                activeOpacity={0.7}
                className={`flex-row items-center rounded-full px-3 py-2 ml-0.5 ${
                  insufficientBalance || tipBelowFee ? "bg-theme-neutrals-700" : "bg-blue-600"
                }`}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={14} color={insufficientBalance || tipBelowFee ? "#666" : "#fff"} />
                    <Text className={`text-[11px] font-semibold ml-1 ${insufficientBalance || tipBelowFee ? "text-theme-neutrals-500" : "text-white"}`}>
                      {totalCost} DHB
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              // Normal send icon
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
            )
          ) : (
            // Tip button (no content)
            <View className="flex-row items-center">
              {canAddTip && onTipPress && (
                <TouchableOpacity
                  onPress={onTipPress}
                  className="p-2"
                  hitSlop={4}
                  activeOpacity={0.6}
                >
                  <Ionicons name="diamond-outline" size={20} color="#A6A9AC" />
                </TouchableOpacity>
              )}
            </View>
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

export default memo(ChatInputBarComponent);
