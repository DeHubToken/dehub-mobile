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
  Keyboard,
  Platform,
  ActivityIndicator,
} from "react-native";
import SmartImage from "../common/SmartImage";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { sendAIChat } from "../../services/ai.service";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { openCroppedImagePicker } from "../../libs/assets.util";
import { toastError, toastInfo } from "../../libs/toast";
import {
  ATTACHMENT_PICKER_TYPES,
  formatAttachmentSize,
  getAttachmentLabel,
  validateAttachment,
} from "../../libs/attachments";
import { runWithPermissions } from "../../libs/permissions.util";
import GifPicker from "./GifPicker";
import ChatAttachSheet, { type ChatAttachOption } from "./ChatAttachSheet";
import SmartReplyTray from "./SmartReplyTray";
import { useSmartReplies } from "../../hooks/useSmartReplies";
import { setAppPref, useAppPrefs } from "../../hooks/useAppPrefs";
import { useDraft } from "../../hooks/useDraft";
import type { SmartReplyTurn } from "../../services/ai.service";
import type { DmMessage, DmFee } from "../../services/dm/dm.types";
import { DM_TEXT_MAX_LENGTH } from "../../services/dm/dm.types";
import { haptic } from "../../libs/haptics";


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

/*
 * Composer metrics. Attach and send/mic are one CONTROL-square box each (with
 * a little hitSlop, a 48dp target), and the field pads to the same height so a
 * single line of text sits on the icons' centre line. The TextInput's own box
 * is zeroed, Android font padding included, or the text rides high in the row.
 */
const CONTROL = 44;
const LINE = 20;
const FIELD_PAD = (CONTROL - LINE) / 2;
const CONTROL_BOX = { width: CONTROL, height: CONTROL } as const;
const INPUT_BOX = { paddingHorizontal: 4, paddingVertical: FIELD_PAD, maxHeight: 120 } as const;
const INPUT_TEXT = {
  margin: 0,
  padding: 0,
  minHeight: LINE,
  maxHeight: 120 - FIELD_PAD * 2,
  includeFontPadding: false,
  textAlignVertical: "top",
} as const;

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
  const { t } = useTranslation();
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
  const [attachOpen, setAttachOpen] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  // Down for THIS message only - the send handler drops the tray whose
  // drafts the send just invalidated. Switching the feature off is a
  // separate thing, and lives in the smartReplies preference.
  const [trayDismissed, setTrayDismissed] = useState(false);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const smartRepliesEnabled = useAppPrefs().smartReplies;
  const smartReplies = useSmartReplies(thread ?? [], peerName);
  const hasThread = !!thread && thread.length > 0;

  // A suggested reply answers an INCOMING message. When the user holds the last
  // word there is nothing to reply to, so the tray stands down rather than
  // drafting follow-ups to oneself — and no model call is spent on it either.
  const awaitingReply = hasThread && thread![thread!.length - 1]?.from === "them";


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
   * Only an incoming tail is drafted against: once the user has replied, the
   * tray is gone until the other side speaks again. Mirrors dehubweb's
   * ChatInput.
   */
  useEffect(() => {
    // Switched off is switched off: no tray, and no model call behind it.
    if (!hasThread || !awaitingReply || !smartRepliesEnabled) return;
    const { smartReplies: sr, text: draft } = latest.current;
    if (draft.trim()) return;
    if (draftedFor.current === sr.tailKey) return;
    draftedFor.current = sr.tailKey;
    // 'error' as well as 'idle': the hook only rewinds itself to idle when a
    // SUCCESSFUL draft goes stale, so a single failure would otherwise leave
    // the tray showing that failure for every message after it.
    if (sr.status === "idle" || sr.status === "error") sr.generate();
  }, [hasThread, awaitingReply, smartRepliesEnabled, smartReplies.tailKey]);

  // A new message re-arms the per-message stand-down. It does NOT reopen a
  // tray the user switched off — that is what the preference is for.
  useEffect(() => {
    setTrayDismissed(false);
  }, [smartReplies.tailKey]);

  // The x switches the feature off, in every thread, until it is switched
  // back on. There is no orb anywhere else to press once it is down, so the
  // toast has to say where the switch lives — otherwise this is a control
  // that makes a feature disappear with no way back.
  const handleDismissTray = useCallback(() => {
    setAppPref("smartReplies", false);
    toastInfo(t("messages.smartRepliesOff", "Suggested replies turned off"), {
      description: t(
        "messages.smartRepliesOffWhere",
        "Turn them back on in Settings → Messages.",
      ),
      actionLabel: t("messages.smartRepliesUndo", "Undo"),
      onActionPress: () => setAppPref("smartReplies", true),
    });
  }, [t]);

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
    haptic.tap();

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
      toastError(t("dm.attachFailed"));
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
  // The tray is up in every thread whose last word belongs to the other side —
  // the only moment a suggested reply means anything. Whether the drafter found
  // something to say is still a question the tray ANSWERS, with the orb there to
  // press; that check must never gate the mount. Anything the user has already
  // started (text, an attachment, an edit) takes the space back.
  const showTray =
    hasThread && awaitingReply && smartRepliesEnabled && !trayDismissed && !hasContent && !editingMessage;
  const hasMediaOrGif = !!media || !!gifUrl;
  const placeholder = hasMediaOrGif ? t("dm.addCaption") : t("dm.messagePlaceholder");

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

  // The keyboard goes down first so the sheet opens over the thread rather
  // than stacked on top of the keys.
  const handleOpenAttach = () => {
    haptic.tap();
    Keyboard.dismiss();
    setAttachOpen(true);
  };

  // Each option closes the sheet and then runs exactly what its old toolbar
  // button ran. Closing first matters: the pickers and the GIF, tip and poll
  // sheets are windows of their own and must not open underneath this one.
  const fromSheet = (run: () => unknown) => () => {
    setAttachOpen(false);
    run();
  };
  const attachOptions: ChatAttachOption[] = [
    // Tipping is voluntary and never needed to send, and a tip already set is
    // shown (with its clear button) in the badge above the field — so the gem
    // gives up its permanent slot in the row.
    ...(canAddTip && onTipPress
      ? [{ key: "tip", icon: "Gem" as const, label: t("dm.addTip"), onPress: fromSheet(onTipPress) }]
      : []),
    { key: "gif", icon: "Clapperboard", label: t("dm.chooseGif"), onPress: fromSheet(() => setGifPickerVisible(true)) },
    { key: "image", icon: "Image", label: t("dm.attachImage"), onPress: fromSheet(handlePickImage) },
    { key: "video", icon: "Video", label: t("dm.attachVideo"), onPress: fromSheet(handlePickVideo) },
    { key: "file", icon: "Paperclip", label: t("dm.attachFile"), onPress: fromSheet(handlePickFile) },
    ...(onPollPress
      ? [{ key: "poll", icon: "ChartColumn" as const, label: t("postOptions.createPoll"), onPress: fromSheet(onPollPress) }]
      : []),
    // Works on what is already typed, so it stays greyed out until there is some.
    {
      key: "enhance",
      icon: "Sparkles",
      label: t("dm.enhanceWithAi"),
      onPress: fromSheet(handleEnhance),
      disabled: !text.trim(),
    },
  ];


  if (disabled) {
    return (
      <View className="px-4 py-3 bg-theme-neutrals-900 border-t border-theme-neutrals-800">
        <Text className="text-theme-neutrals-500 text-center text-sm">
          {disabledMessage || t("dm.messagingUnavailable")}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View className="bg-theme-neutrals-900 border-t border-theme-neutrals-600">
        {/* Up whenever the other side spoke last and the composer is empty,
            keyboard or no keyboard — it sits above the input, so nothing
            covers it. Whether
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
              dismissLabel={t("messages.turnOffSmartReplies", "Turn off suggested replies")}
            />
          </Animated.View>
        )}

        {/* Reply-to preview */}
        {replyTo && (
          <Animated.View
            entering={SlideInDown.duration(200)}
            exiting={FadeOut.duration(100)}
            className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/50 mx-3 mt-2 rounded-lg"
          >
            <View className="flex-1 mr-2">
              <Text className="text-[11px] text-accent font-medium">
                {t("dm.replyingTo")}
              </Text>
              <Text
                className="text-[13px] text-theme-neutrals-400 mt-0.5"
                numberOfLines={1}
              >
                {replyTo.content || (replyTo.msgType === "voice" ? t("dm.voiceNoteEmoji") : t("dm.mediaEmoji"))}
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
                {t("dm.editingMessage")}
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
                ? t("dm.tipBelowFee", { amount: effectiveFee })
                : insufficientBalance
                ? t("dm.insufficientTokenBalance", { amount: Number(dhbBalance).toLocaleString() })
                : t("dm.tokenBalance", { amount: Number(dhbBalance!).toLocaleString() })}
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
                // expo-image takes no className, so the backdrop lives on a wrapper.
                <View className="bg-theme-neutrals-700" style={{ width: 80, height: 80, borderRadius: 12 }}>
                  <SmartImage
                    source={{ uri: media?.thumbnailUri || media?.uri || gifUrl || "" }}
                    style={{ width: 80, height: 80, borderRadius: 12 }}
                    contentFit="cover"
                  />
                </View>
              )}
              {media?.type === "video" && (
                <View className="absolute inset-0 items-center justify-center">
                  <Icon name="CirclePlay" size={28} color="#fff" />
                </View>
              )}
              {gifUrl && (
                <View className="absolute bottom-1 left-1 dark-surface bg-black/60 rounded px-1">
                  <Text className="text-[11px] text-white font-bold">GIF</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={handleRemoveMedia}
                className="absolute -top-1.5 -right-1.5 bg-white rounded-full w-5 h-5 items-center justify-center"
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("dm.removeAttachment")}
              >
                <Icon name="X" size={12} color="#09090B" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Composer row: attach, the field, send/mic. Everything else is in
            the attach sheet — see ChatAttachSheet for why. */}
        <View className="flex-row items-end px-2 pt-2 pb-2">
          {/* Attach. While an AI rewrite is running every other control is
              locked, so the spinner the sparkles used to show lives here. */}
          <TouchableOpacity
            onPress={handleOpenAttach}
            className="items-center justify-center"
            style={CONTROL_BOX}
            hitSlop={2}
            activeOpacity={0.6}
            disabled={enhancing}
            accessibilityRole="button"
            accessibilityLabel={t("liveChat.attachTitle")}
            accessibilityState={{ disabled: enhancing }}
          >
            {enhancing ? (
              <ActivityIndicator size={18} color="#F4F4F5" />
            ) : (
              <Icon name="Plus" size={24} color="#A6A9AC" />
            )}
          </TouchableOpacity>

          <View className="flex-1 mx-1" style={INPUT_BOX}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              placeholder={placeholder}
              placeholderTextColor="#8B8D90"
              multiline
              maxLength={DM_TEXT_MAX_LENGTH}
              className="text-white text-[15px] leading-5"
              style={INPUT_TEXT}
            />
          </View>

          {/* Send when there is something to send (or a tip on its own),
              otherwise the mic — the two never need the slot at once. */}
          {showSendButton ? (
            showCostOnSend ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={sending || enhancing || insufficientBalance || tipBelowFee}
                activeOpacity={0.7}
                hitSlop={2}
                accessibilityRole="button"
                accessibilityLabel={t("dm.sendMessage")}
                accessibilityState={{ disabled: sending || enhancing || insufficientBalance || tipBelowFee }}
                style={{ height: CONTROL }}
                className={`flex-row items-center justify-center rounded-xl px-3 ${
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
                className="items-center justify-center"
                style={CONTROL_BOX}
                hitSlop={2}
                accessibilityRole="button"
                accessibilityLabel={t("dm.sendMessage")}
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
              onPress={onStartVoice}
              className="items-center justify-center"
              style={CONTROL_BOX}
              hitSlop={2}
              activeOpacity={0.6}
              disabled={enhancing}
              accessibilityRole="button"
              accessibilityLabel={t("comments.recordVoice")}
              accessibilityState={{ disabled: enhancing }}
            >
              <Icon name="Mic" size={22} color={enhancing ? "#3F3F46" : "#A6A9AC"} />
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

      <ChatAttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        options={attachOptions}
      />
    </>
  );
};

export default memo(ChatInputBarComponent);
