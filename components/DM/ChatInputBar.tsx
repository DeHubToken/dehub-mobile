import { DhbCoin } from "../common/DhbCoin";
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
import { useSmartReplies } from "../../hooks/useSmartReplies";
import { useDraft } from "../../hooks/useDraft";
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
  /**
   * Scope this composer's text is saved under, so a half-typed message survives
   * backing out of the thread or the app being killed. MUST be stable for the
   * life of the conversation — pass the peer, never the conversation id, which
   * does not exist yet the first time you message someone (see libs/draft-cache).
   * Omit it and the composer behaves as before.
   */
  draftKey?: string | null;
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
  draftKey,
}) => {
  const inputRef = useRef<TextInput>(null);
  /*
   * Editing an existing message borrows the same box. Persisting then would
   * save someone else's words over the user's draft, and cancelling would wipe
   * it — so editing simply detaches from the store, and the parked draft comes
   * back the moment edit mode ends.
   */
  const [text, setText] = useDraft(editingMessage ? null : draftKey);
  const [media, setMedia] = useState<ChatMediaAttachment | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [trayDismissed, setTrayDismissed] = useState(false);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const smartReplies = useSmartReplies(thread ?? [], peerName);
  const hasThread = !!thread && thread.length > 0;


  // Thread tail a draft has already been spent on. One model call per message,
  // whichever side sent it: re-rendering and re-showing the tray must never
  // re-spend it. A new message changes the key, which re-arms it.
  const draftedFor = useRef<string | null>(null);

  // Read through a ref so the effect below can depend on the one thing that
  // should actually retrigger it — the newest message — instead of re-running
  // on every keystroke and every render of the hook.
  const latest = useRef({ smartReplies, text, hasThread });
  latest.current = { smartReplies, text, hasThread };

  /**
   * The tray is up with a socket and two empty slots, so waiting for a tap
   * into the composer before drafting would leave it showing nothing in the
   * one moment it is being looked at. Spend the call when the thread tail
   * changes instead — held back only when the user has already started typing,
   * because then they know what to say.
   *
   * The drafter handles both directions: an incoming tail gets replies, the
   * user's own last word gets follow-ups. Mirrors dehubweb's ChatInput.
   */
  useEffect(() => {
    if (!hasThread) return;
    const { smartReplies: sr, text: draft } = latest.current;
    if (draft.trim()) return;
    if (draftedFor.current === sr.tailKey) return;
    draftedFor.current = sr.tailKey;
    // 'error' as well as 'idle': the hook only rewinds itself to idle when a
    // SUCCESSFUL draft goes stale, so a single failure would otherwise leave
    // the tray showing that failure for every message after it.
    if (sr.status === "idle" || sr.status === "error") sr.generate();
  }, [hasThread, smartReplies.tailKey]);

  // A new message re-arms a dismissed tray. Dismissing is "not for this
  // message", not "never again" — there is no orb anywhere else to press, so a
  // permanent dismissal is a feature switched off by accident and never found.
  useEffect(() => {
    setTrayDismissed(false);
  }, [smartReplies.tailKey]);

  const handleDismissTray = useCallback(() => setTrayDismissed(true), []);

  /**
   * Drop a suggestion into the composer rather than sending it. The user still
   * owns the send — a drafted line that fires on one tap is how the wrong
   * thing gets sent to the wrong person.
   */
  const handlePickSuggestion = useCallback((suggestion: string) => {
    setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${suggestion}` : suggestion));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Pre-fill with shared text on mount — but only into an empty box, so a
  // draft left in this thread days ago is not overwritten by a share.
  useEffect(() => {
    if (!initialText) return;
    let adopted = false;
    setText((prev) => {
      if (prev) return prev;
      adopted = true;
      return initialText;
    });
    if (adopted) requestAnimationFrame(() => inputRef.current?.focus());
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
    // where it did, so it goes down with the send and comes back up on the next
    // tail — as follow-ups, since the user now holds the last word.
    setTrayDismissed(true);

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
  // The tray is up in EVERY open thread with an empty composer — a thread with
  // nothing to draft from still gets its quiet one-liner, because an empty band
  // and a broken feature are indistinguishable at a glance. Anything the user
  // has already started (text, an attachment, an edit) takes the space back.
  const showTray = hasThread && !trayDismissed && !hasContent && !editingMessage;
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
        {/* Up in every open thread with an empty composer, keyboard or no
            keyboard — it sits above the input, so nothing covers it. Whether
            there is anything to draft is a question the tray ANSWERS, with the
            orb still there to press, not one that decides whether it exists:
            gating the mount on that check is what made the feature vanish for
            the rest of every conversation. Stands down once there is typed
            text, and on send. */}
        {showTray && (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <SmartReplyTray
              status={smartReplies.status}
              suggestions={smartReplies.suggestions}
              error={smartReplies.error}
              onGenerate={() => smartReplies.generate()}
              onPick={handlePickSuggestion}
              onDismiss={handleDismissTray}
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
            className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/50 border-l-2 border-white/20 mx-3 mt-2 rounded-lg"
          >
            <Icon name="Pencil" size={14} color="#D4D4D8" />
            <View className="flex-1 ml-2">
              <Text className="text-[11px] text-white/80 font-medium">
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
              Tip: {tipAmount} <DhbCoin />
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
              tipBelowFee || insufficientBalance ? "bg-white/10" : "bg-white/5"
            }`}
          >
            <Icon
              name={tipBelowFee ? "CircleAlert" : "Wallet"}
              size={11}
              color={tipBelowFee || insufficientBalance ? "#F4F4F5" : "#A6A9AC"}
            />
            <Text
              className={`text-[12px] font-medium ml-1 ${
                tipBelowFee || insufficientBalance ? "text-white/80" : "text-theme-neutrals-400"
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
                className="absolute -top-1.5 -right-1.5 bg-white rounded-full w-5 h-5 items-center justify-center"
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Remove attachment"
              >
                <Icon name="X" size={12} color="#09090B" />
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

          {/* Sparkles — AI enhance. The orb no longer shares this slot: the
              tray raises itself when the composer takes focus, so the only orb
              is the one at the bottom of that tray. */}
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
                      {totalCost} <DhbCoin />
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
