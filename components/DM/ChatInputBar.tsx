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
import Icon from "../ui/Icon";
import { sendAIChat } from "../../services/ai.service";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { openCroppedImagePicker } from "../../libs/assets.util";
import { toastError } from "../../libs/toast";
import {
  ATTACHMENT_PICKER_TYPES,
  formatAttachmentSize,
  getAttachmentLabel,
  validateAttachment,
} from "../../libs/attachments";
import { runWithPermissions } from "../../libs/permissions.util";
import GifPicker from "./GifPicker";
import SmartReplyTray from "./SmartReplyTray";
import ReplyOrb from "./ReplyOrb";
import { useSmartReplies } from "../../hooks/useSmartReplies";
import type { SmartReplyTurn } from "../../services/ai.service";
import type { DmMessage, DmFee } from "../../services/dm/dm.types";
import { DM_TEXT_MAX_LENGTH } from "../../services/dm/dm.types";


export type ChatMediaAttachment = {
  type: "image" | "video" | "gif" | "file";
  uri: string;
  thumbnailUri?: string;
  mimeType?: string;
  /** Documents only — the picker's filename, needed for the upload and the bubble. */
  name?: string;
  /** Documents only — bytes, so the composer chip can show a size. */
  size?: number;
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
  /** Trigger poll creation sheet. */
  onPollPress?: () => void;
  /** Pre-fill the text input on mount (e.g. shared post URL). */
  initialText?: string;
  /**
   * Recent turns, oldest first. Supplying this turns on the reply orb; leave it
   * off and the composer is exactly what it was.
   */
  thread?: SmartReplyTurn[];
  /** Who the user is talking to — labels the other side for the drafter. */
  peerName?: string;
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
  onPollPress,
  initialText,
  thread,
  peerName,
}) => {
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<ChatMediaAttachment | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [showReplyTray, setShowReplyTray] = useState(false);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const smartReplies = useSmartReplies(thread ?? [], peerName);
  const replyOrbEnabled = !!thread && thread.length > 0;

  const handleOrbToggle = useCallback(() => {
    if (showReplyTray) {
      setShowReplyTray(false);
      return;
    }
    setShowReplyTray(true);
    // Only draft on the first open; the tray keeps whatever it already has,
    // so reopening is free. Its own orb is the redraft control.
    if (smartReplies.status === "idle") smartReplies.generate();
  }, [showReplyTray, smartReplies]);

  /**
   * Drop a suggestion into the composer rather than sending it. The user still
   * owns the send — a drafted line that fires on one tap is how the wrong
   * thing gets sent to the wrong person.
   */
  const handlePickSuggestion = useCallback((suggestion: string) => {
    setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${suggestion}` : suggestion));
    setShowReplyTray(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Pre-fill with shared text on mount
  useEffect(() => {
    if (initialText) {
      setText(initialText);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Whatever is in the tray was drafted against a thread that no longer ends
    // where it did, so it goes away with the send.
    setShowReplyTray(false);

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

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ATTACHMENT_PICKER_TYPES,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      const picked = {
        uri: asset.uri,
        name: asset.name || "file",
        // Android returns null for plenty of types; the server decides from the
        // extension anyway and re-labels the stored object itself.
        mimeType: asset.mimeType || "application/octet-stream",
        size: asset.size ?? 0,
      };

      const check = validateAttachment(picked);
      if (!check.ok) {
        toastError(check.error!);
        return;
      }

      setGifUrl(null);
      setMedia({
        type: "file",
        uri: picked.uri,
        mimeType: picked.mimeType,
        name: picked.name,
        size: picked.size,
      });
    } catch (e) {
      console.error("[ChatInputBar] file picker error", e);
      toastError("Couldn't attach that file.");
    }
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


  const handleEnhance = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || enhancing) return;
    setEnhancing(true);
    try {
      const res = await sendAIChat({
        messages: [
          {
            role: 'user',
            content: `Enhance this message to be more engaging, clear, and well-written while keeping the same meaning and tone. Return ONLY the enhanced message text, nothing else.\n\nMessage: ${trimmed}`,
          },
        ],
      });
      if (res.response) setText(res.response);
    } catch (e) {
      console.error('[ChatInputBar] enhance error', e);
    } finally {
      setEnhancing(false);
    }
  }, [text, enhancing]);

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
        {replyOrbEnabled && showReplyTray && (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <SmartReplyTray
              status={smartReplies.status}
              suggestions={smartReplies.suggestions}
              error={smartReplies.error}
              onGenerate={smartReplies.generate}
              onPick={handlePickSuggestion}
              onDismiss={() => setShowReplyTray(false)}
            />
          </Animated.View>
        )}

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
              <Icon name="X" size={18} color="#A6A9AC" />
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
            <Icon name="Pencil" size={14} color="#D4D4D8" />
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
              <Icon name="X" size={18} color="#A6A9AC" />
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
            <Icon name="Gem" size={12} color="#D4D4D8" />
            <Text className="text-[11px] text-amber-400 font-medium ml-1">
              Tip: {tipAmount} DHB
            </Text>
            <TouchableOpacity
              onPress={onClearTip}
              hitSlop={8}
              className="ml-2"
            >
              <Icon name="CircleX" size={14} color="#A6A9AC" />
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
            <Icon
              name={tipBelowFee ? "CircleAlert" : "Wallet"}
              size={11}
              color={tipBelowFee || insufficientBalance ? "#EF4444" : "#A6A9AC"}
            />
            <Text
              className={`text-[12px] font-medium ml-1 ${
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
              {media?.type === "file" ? (
                /* A document has no thumbnail to show, so the chip carries the
                   name and size instead of an 80×80 Image of nothing. */
                <View className="flex-row items-center bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-3 py-2 max-w-[260px]">
                  <View className="w-9 h-9 rounded-lg bg-theme-neutrals-700 items-center justify-center mr-2.5">
                    <Icon name="FileText" size={18} color="#fff" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-[13px] font-medium" numberOfLines={1}>
                      {media.name}
                    </Text>
                    <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">
                      {getAttachmentLabel(media.name || "")}
                      {media.size ? ` · ${formatAttachmentSize(media.size)}` : ""}
                    </Text>
                  </View>
                </View>
              ) : (
                <Image
                  source={{ uri: media?.thumbnailUri || media?.uri || gifUrl || "" }}
                  style={{ width: 80, height: 80, borderRadius: 12 }}
                  resizeMode="cover"
                  className="bg-theme-neutrals-700"
                />
              )}
              {media?.type === "video" && (
                <View className="absolute inset-0 items-center justify-center">
                  <Icon name="CirclePlay" size={28} color="#fff" />
                </View>
              )}
              {gifUrl && (
                <View className="absolute bottom-1 left-1 bg-black/60 rounded px-1">
                  <Text className="text-[11px] text-white font-bold">GIF</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={handleRemoveMedia}
                className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full w-5 h-5 items-center justify-center"
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Remove attachment"
              >
                <Icon name="X" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Text input — full width */}
        <View className="px-3 pt-2 pb-1">
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleTextChange}
            placeholder={placeholder}
            placeholderTextColor="#8B8D90"
            multiline
            maxLength={DM_TEXT_MAX_LENGTH}
            className="text-white text-[15px] leading-5 p-0 m-0"
            style={{ maxHeight: 100 }}
          />
        </View>

        {/* Toolbar row */}
        <View className="flex-row items-center justify-around px-4 py-2">
          {/* Gem (tip / diamond) */}
          {canAddTip && onTipPress ? (
            <TouchableOpacity
              onPress={onTipPress}
              className="p-2"
              hitSlop={4}
              activeOpacity={0.6}
              disabled={enhancing}
              accessibilityRole="button"
              accessibilityLabel="Add tip"
              accessibilityState={{ disabled: enhancing }}
            >
              <Icon name="Gem" size={22} color={enhancing ? '#3F3F46' : '#A6A9AC'} />
            </TouchableOpacity>
          ) : (
            <View className="p-2">
              <Icon name="Gem" size={22} color="#3F3F46" />
            </View>
          )}

          {/* GIF picker */}
          <TouchableOpacity
            onPress={() => setGifPickerVisible(true)}
            className="p-2"
            hitSlop={4}
            activeOpacity={0.6}
            disabled={enhancing}
            accessibilityRole="button"
            accessibilityLabel="Choose a GIF"
            accessibilityState={{ disabled: enhancing }}
          >
            <Text style={{ fontSize: 13, fontWeight: '800', color: enhancing ? '#3F3F46' : '#A6A9AC' }}>GIF</Text>
          </TouchableOpacity>

          {/* Image picker */}
          <TouchableOpacity
            onPress={handlePickImage}
            className="p-2"
            hitSlop={4}
            activeOpacity={0.6}
            disabled={enhancing}
            accessibilityRole="button"
            accessibilityLabel="Attach image"
            accessibilityState={{ disabled: enhancing }}
          >
            <Icon name="Image" size={22} color={enhancing ? '#3F3F46' : '#A6A9AC'} />
          </TouchableOpacity>

          {/* Video picker */}
          <TouchableOpacity
            onPress={handlePickVideo}
            className="p-2"
            hitSlop={4}
            activeOpacity={0.6}
            disabled={enhancing}
            accessibilityRole="button"
            accessibilityLabel="Attach video"
            accessibilityState={{ disabled: enhancing }}
          >
            <Icon name="Video" size={22} color={enhancing ? '#3F3F46' : '#A6A9AC'} />
          </TouchableOpacity>

          {/* File picker */}
          <TouchableOpacity
            onPress={handlePickFile}
            className="p-2"
            hitSlop={4}
            activeOpacity={0.6}
            disabled={enhancing}
            accessibilityRole="button"
            accessibilityLabel="Attach file"
            accessibilityState={{ disabled: enhancing }}
          >
            <Icon name="Paperclip" size={22} color={enhancing ? '#3F3F46' : '#A6A9AC'} />
          </TouchableOpacity>

          {/* Mic */}
          <TouchableOpacity
            onPress={onStartVoice}
            className="p-2"
            hitSlop={4}
            activeOpacity={0.6}
            disabled={enhancing}
            accessibilityRole="button"
            accessibilityLabel="Record voice note"
            accessibilityState={{ disabled: enhancing }}
          >
            <Icon name="Mic" size={22} color={enhancing ? '#3F3F46' : '#A6A9AC'} />
          </TouchableOpacity>

          {/* Poll */}
          {onPollPress && (
            <TouchableOpacity
              onPress={onPollPress}
              className="p-2"
              hitSlop={4}
              activeOpacity={0.6}
              disabled={enhancing}
              accessibilityRole="button"
              accessibilityLabel="Create poll"
              accessibilityState={{ disabled: enhancing }}
            >
              <Icon name="ChartColumn" size={22} color={enhancing ? "#3F3F46" : "#A6A9AC"} />
            </TouchableOpacity>
          )}

          {/* One AI slot, two jobs. The toolbar is already eight items wide on
              a 360dp screen, so the orb takes over the Sparkles position while
              the composer is empty — there is nothing to enhance then anyway,
              and "what do I say" is exactly the empty-composer problem. Type
              anything and it reverts to enhance. */}
          {!text.trim() && replyOrbEnabled && !enhancing ? (
            <TouchableOpacity
              onPress={handleOrbToggle}
              className="p-2"
              hitSlop={4}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Suggested replies"
              accessibilityState={{ expanded: showReplyTray }}
            >
              <ReplyOrb
                state={showReplyTray && smartReplies.status === "loading" ? "thinking" : "idle"}
                size={22}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleEnhance}
              className="p-2"
              hitSlop={4}
              activeOpacity={0.6}
              disabled={!text.trim() || enhancing}
              accessibilityRole="button"
              accessibilityLabel="Enhance message with AI"
              accessibilityState={{ disabled: !text.trim() || enhancing }}
            >
              {enhancing ? (
                <ActivityIndicator size={18} color="#F4F4F5" />
              ) : (
                <Icon
                  name="Sparkles"
                  size={22}
                  color={text.trim() ? '#F4F4F5' : '#3F3F46'}
                />
              )}
            </TouchableOpacity>
          )}

          {/* Send */}
          {showSendButton ? (
            showCostOnSend ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={sending || enhancing || insufficientBalance || tipBelowFee}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: sending || enhancing || insufficientBalance || tipBelowFee }}
                className={`flex-row items-center rounded-full px-3 py-2.5 ${
                  insufficientBalance || tipBelowFee
                    ? "bg-theme-neutrals-700"
                    : "bg-white/10 border border-white/20"
                }`}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Icon name="Send" size={14} color={insufficientBalance || tipBelowFee ? "#666" : "#fff"} />
                    <Text className={`text-[11px] font-semibold ml-1 ${insufficientBalance || tipBelowFee ? "text-theme-neutrals-500" : "text-white"}`}>
                      {totalCost} DHB
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSend}
                disabled={sending || enhancing}
                className="p-2"
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: sending || enhancing }}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#F4F4F5" />
                ) : (
                  <Icon name="Send" size={22} color="#F4F4F5" />
                )}
              </TouchableOpacity>
            )
          ) : (
            <TouchableOpacity
              className="p-2"
              activeOpacity={0.6}
              disabled
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: true }}
            >
              <Icon name="Send" size={22} color="#3F3F46" />
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

export default memo(ChatInputBarComponent);
