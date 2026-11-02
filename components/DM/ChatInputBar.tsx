import { useKeyboardSwap } from "../../hooks/useKeyboardSwap";
import { useTranslation as _useCopy } from 'react-i18next';
import { useDraftState } from '../../hooks/useDraftState';
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
  Pressable,
  ScrollView,
} from "react-native";
import SmartImage from "../common/SmartImage";
import Animated, { FadeIn, FadeOut, SlideInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { sendAIChat } from "../../services/ai.service";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { toastError, toastInfo } from "../../libs/toast";
import {
  formatAttachmentSize,
  getAttachmentLabel,
  validateAttachment,
} from "../../libs/attachments";
import { runWithPermissions } from "../../libs/permissions.util";
import { cleanVideoOptions, type DmVideoOptions } from "../../libs/dm-video-options";
import { type DmDestructChoice } from "../../libs/dm-destruct";
import DmVideoStudio from "./DmVideoStudio";


/** Per-kind caps, matching the backend's DM limits. */
const DM_ATTACH_LIMITS = { image: 10 * 1024 * 1024, video: 50 * 1024 * 1024, audio: 20 * 1024 * 1024 } as const;
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
  type: "image" | "video" | "audio" | "gif" | "file";
  uri: string;
  thumbnailUri?: string;
  mimeType?: string;
  /** Documents only — the picker's filename, needed for the upload and the bubble. */
  name?: string;
  /** Documents only — bytes, so the composer chip can show a size. */
  size?: number;
  /** Videos only — seconds, when the picker reports it. */
  duration?: number;
  /** Pay-to-unlock price (DHB) for a photo or video. */
  lockPrice?: number | null;
  /** Videos only — picked size, so the card and bubble keep the real shape. */
  width?: number;
  height?: number;
  /** Videos only — trim, cover, mirror, rotation and hide from the video sheet. */
  options?: DmVideoOptions;
  /** Self-destruct: gone after one view or a set time. */
  destruct?: DmDestructChoice | null;
};

interface ChatInputBarProps {
  onSendText: (text: string) => Promise<boolean>;
  onSendMedia: (attachment: ChatMediaAttachment, caption?: string) => Promise<boolean>;
  /** Offer "Lock photo" (pay to unlock) on a picked photo or video. 1:1 DMs only. */
  allowLock?: boolean;
  onSendGif: (url: string, caption?: string) => Promise<boolean>;
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
const CONTROL_BOX = { width: 32, height: CONTROL } as const;
const INPUT_BOX = { minHeight: 52, paddingTop: 4, maxHeight: 128 } as const;
const INPUT_TEXT = {
  margin: 0,
  padding: 0,
  minHeight: LINE,
  maxHeight: 124,
  includeFontPadding: false,
  textAlignVertical: "top",
} as const;

const ChatInputBarComponent: React.FC<ChatInputBarProps> = ({
  onSendText,
  onSendMedia,
  allowLock = false,
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
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const keyboardSwap = useKeyboardSwap(inputRef);
  const [ordinaryText, setOrdinaryText] = useDraft(draftKey);
  const [editText, setEditText] = useDraftState(editingMessage && draftKey ? `${draftKey}:edit:${editingMessage._id}` : null, editingMessage?.content || "");
  const text = editingMessage ? editText : ordinaryText;
  const setText = editingMessage ? setEditText : setOrdinaryText;
  const [media, setMedia] = useState<ChatMediaAttachment | null>(null);
  // Photos and videos picked for the edit screen; it is open while any are here.
  const [studio, setStudio] = useState<ChatMediaAttachment[]>([]);
  const [studioActive, setStudioActive] = useState(0);
  // The edit screen opens on a pick; Confirm brings the picks back here as a
  // row above the box. X drops only what was picked since it opened.
  const [studioOpen, setStudioOpen] = useState(false);
  const studioOpenRef = useRef(false);
  studioOpenRef.current = studioOpen;
  const studioBase = useRef(0);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // The paperclip: one button, then "photo or video" (gallery) or "file or
  // audio" (anything else on the phone).
  const [clipOpen, setClipOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
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
  }, [setText]);

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
  }, [setText]);

  // Pre-fill when editing
  useEffect(() => {
    if (editingMessage) {
      setEditText.initialize(editingMessage.content || "");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editingMessage, setEditText]);


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
    [emitTyping, setText],
  );

  // Cleanup typing timer on unmount
  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingRef.current) emitTyping(false);
    },
    [emitTyping],
  );


  const sendInFlight = useRef(false);
  const handleSend = useCallback(async () => {
    if (sending || sendInFlight.current) return;
    sendInFlight.current = true;
    try {
    haptic.tap();

    // Whatever is in the tray was drafted against a thread that no longer ends
    // where it did, so it goes down with the send and comes back up on the next
    // tail — as follow-ups, since the user now holds the last word.
    setTrayDismissed(true);

    // GIF with optional caption
    if (gifUrl) {
      const caption = text.trim() || undefined;
      if (!(await onSendGif(gifUrl, caption))) return;
      setGifUrl(null);
      setText.complete(text, "");
      return;
    }

    // Everything in the edit screen: back to the chat at once, then one
    // message per photo/video in order, the caption riding on the first.
    // Whatever fails comes back into the edit screen.
    if (studio.length) {
      const queue = [...studio];
      const caption = text.trim() || undefined;
      setStudioOpen(false);
      setStudio([]);
      setStudioActive(0);
      setText.complete(text, "");
      for (let i = 0; i < queue.length; i++) {
        const m = queue[i];
        const out = m.type === "video" ? { ...m, options: cleanVideoOptions(m.options, m.duration) } : m;
        if (!(await onSendMedia(out, i === 0 ? caption : undefined))) {
          setStudio(queue.slice(i));
          if (i === 0 && caption) setText(caption);
          return;
        }
      }
      return;
    }

    // Audio or a document, with optional caption
    if (media) {
      const caption = text.trim() || undefined;
      const out = media.type === "video" ? { ...media, options: cleanVideoOptions(media.options, media.duration) } : media;
      if (!(await onSendMedia(out, caption))) return;
      setMedia(null);
      setText.complete(text, "");
      return;
    }

    // Text only (or tip-only with no content)
    const trimmed = text.trim();
    // Allow sending if there's text OR if a tip is attached (tip-only send)
    if (!trimmed && !tipAmount) return;
    if (!editingMessage) {
      setOrdinaryText('');
      inputRef.current?.clear();
    }
    let sent = false;
    try { sent = await onSendText(trimmed); } catch { sent = false; }
    if (!sent) {
      if (!editingMessage) setOrdinaryText(current => current.trim() ? current : text);
      return;
    }
    if (editingMessage) setEditText.complete(text, "");
    emitTyping(false);
    } finally { sendInFlight.current = false; }
  }, [text, media, studio, gifUrl, sending, onSendText, onSendMedia, onSendGif, emitTyping, tipAmount, setText, editingMessage, setEditText, setOrdinaryText]);


  /** Picked photos/videos join the edit screen, which opens on the newest. */
  const addToStudio = useCallback((items: ChatMediaAttachment[]) => {
    if (!items.length) return;
    Keyboard.dismiss();
    setGifUrl(null);
    setMedia(null);
    setStudio((prev) => {
      if (!studioOpenRef.current) { studioBase.current = prev.length; studioOpenRef.current = true; }
      setStudioActive(prev.length);
      return [...prev, ...items];
    });
    setStudioOpen(true);
  }, []);
  const openStudioAt = useCallback((i: number) => {
    Keyboard.dismiss();
    studioBase.current = studio.length;
    setStudioActive(i);
    setStudioOpen(true);
  }, [studio.length]);
  const cancelStudio = useCallback(() => {
    setStudioOpen(false);
    setStudio((prev) => prev.slice(0, studioBase.current));
    setStudioActive(0);
  }, []);
  const patchStudio = useCallback((patch: Partial<ChatMediaAttachment>) => {
    setStudio((prev) => prev.map((m, i) => (i === studioActive ? { ...m, ...patch } : m)));
  }, [studioActive]);
  const removeStudioAt = useCallback((at: number) => {
    setStudio((prev) => {
      const next = prev.filter((_, i) => i !== at);
      if (at < studioBase.current) studioBase.current -= 1;
      if (!next.length) setStudioOpen(false);
      setStudioActive((a) => Math.max(0, Math.min(a > at ? a - 1 : a, next.length - 1)));
      return next;
    });
  }, []);
  const removeStudioItem = useCallback(() => removeStudioAt(studioActive), [removeStudioAt, studioActive]);

  /** Photos AND videos from the gallery in one picker. */
  const handlePickGallery = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsMultipleSelection: true,
          selectionLimit: 10,
          quality: 0.85,
          videoMaxDuration: 600,
          // iPhone photos come back as JPEG rather than HEIC.
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
        if (result.canceled || !result.assets?.length) return;
        const picked: ChatMediaAttachment[] = [];
        for (const asset of result.assets) {
          if (asset.type === "video" || (asset.mimeType || "").startsWith("video/")) {
            if (asset.fileSize && asset.fileSize > DM_ATTACH_LIMITS.video) {
              toastError(t("dm.attachTooLarge", { defaultValue: "That file is over the {{size}} MB limit.", size: DM_ATTACH_LIMITS.video / 1024 / 1024 }));
              continue;
            }
            let thumb: string | undefined;
            try {
              thumb = (await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 })).uri;
            } catch {
              /* ignore */
            }
            picked.push({
              type: "video",
              uri: asset.uri,
              thumbnailUri: thumb,
              mimeType: asset.mimeType,
              // expo-image-picker reports milliseconds.
              duration: asset.duration ? asset.duration / 1000 : undefined,
              width: asset.width || undefined,
              height: asset.height || undefined,
              size: asset.fileSize || undefined,
            });
            continue;
          }
          if (asset.fileSize && asset.fileSize > DM_ATTACH_LIMITS.image) {
            toastError(t("dm.attachTooLarge", { defaultValue: "That file is over the {{size}} MB limit.", size: DM_ATTACH_LIMITS.image / 1024 / 1024 }));
            continue;
          }
          picked.push({ type: "image", uri: asset.uri, mimeType: asset.mimeType || "image/jpeg", width: asset.width || undefined, height: asset.height || undefined, size: asset.fileSize || undefined });
        }
        addToStudio(picked);
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== "E_PICKER_CANCELLED") console.error("[ChatInputBar] gallery picker error", e);
      }
    });
  }, [addToStudio]);

  /** Any file on the phone: audio, video, a photo or a document. */
  const handlePickAnyFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || "";
      const top = mime.split("/")[0];
      const size = asset.size ?? 0;
      if (top === "image" || top === "video" || top === "audio") {
        const cap = DM_ATTACH_LIMITS[top];
        if (size > cap) {
          toastError(t("dm.attachTooLarge", { defaultValue: "That file is over the {{size}} MB limit.", size: cap / 1024 / 1024 }));
          return;
        }
        let thumb: string | undefined;
        if (top === "video") {
          try {
            thumb = (await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 })).uri;
          } catch {
            /* ignore */
          }
        }
        if (top === "audio") {
          setGifUrl(null);
          setStudio([]);
          setMedia({ type: top, uri: asset.uri, mimeType: mime, name: asset.name || undefined, size });
          return;
        }
        addToStudio([{ type: top, uri: asset.uri, mimeType: mime, name: asset.name || undefined, size, thumbnailUri: thumb }]);
        return;
      }
      const picked = { uri: asset.uri, name: asset.name || "file", mimeType: mime || "application/octet-stream", size };
      const check = validateAttachment(picked);
      if (!check.ok) {
        toastError(check.error!);
        return;
      }
      setGifUrl(null);
      setStudio([]);
      setMedia({ type: "file", uri: picked.uri, mimeType: picked.mimeType, name: picked.name, size: picked.size });
    } catch (e) {
      console.error("[ChatInputBar] file picker error", e);
      toastError(t("dm.attachFailed"));
    }
  }, [addToStudio]);

  const gifPress = useMemo(() => keyboardSwap.pressProps(() => keyboardSwap.swapTo(() => setGifPickerVisible(true))), [keyboardSwap]);

  const handleGifPicked = useCallback((url: string) => {
    setGifPickerVisible(false);
    setMedia(null); // clear media if any
    setGifUrl(url);
    keyboardSwap.restore();
  }, [keyboardSwap]);

  const handleRemoveMedia = useCallback(() => {
    setMedia(null);
    setGifUrl(null);
  }, []);

  const handleCancelReply = useCallback(() => {
    onCancelReply?.();
  }, [onCancelReply]);

  const handleCancelEdit = useCallback(() => {
    setEditText.clear();
    onCancelEdit?.();
  }, [onCancelEdit, setEditText]);


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
  }, [text, enhancing, setText]);

  const hasContent = text.trim().length > 0 || !!media || !!gifUrl || studio.length > 0;
  // Show send button when there's content OR a tip is attached (tip-only send)
  const showSendButton = hasContent || tipAmount > 0;
  // The tray is up in every thread whose last word belongs to the other side —
  // the only moment a suggested reply means anything. Whether the drafter found
  // something to say is still a question the tray ANSWERS, with the orb there to
  // press; that check must never gate the mount. Anything the user has already
  // started (text, an attachment, an edit) takes the space back.
  const showTray =
    hasThread && awaitingReply && smartRepliesEnabled && !trayDismissed && !hasContent && !editingMessage && !composerFocused;
  const hasMediaOrGif = !!media || !!gifUrl || studio.length > 0;
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
    { key: "gallery", icon: "Image", label: t("dm.attachPhotoOrVideo", { defaultValue: "Photo or video" }), onPress: fromSheet(handlePickGallery) },
    { key: "any", icon: "Paperclip", label: t("dm.attachFileOrAudio", { defaultValue: "File or audio" }), onPress: fromSheet(handlePickAnyFile) },
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
      <View className="border-t border-white/25">
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
            <Text className="text-[11px] text-amber-400 font-medium ml-1">{_copy("copy.b74733d38668", { defaultValue: "Tip: " })}{tipAmount} <DhbCoin />
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

        {/* Photos and videos open straight into the edit screen. */}
        {studio.length > 0 && (() => {
          const cur = studio[Math.min(studioActive, studio.length - 1)];
          return (
            <DmVideoStudio
              visible={studioOpen}
              onClose={cancelStudio}
              onConfirm={() => { setStudioOpen(false); setTimeout(() => inputRef.current?.focus(), 350); }}
              uri={cur.uri}
              kind={cur.type === "video" ? "video" : "image"}
              strip={studio.map((m, i) => ({ key: `${i}:${m.uri}`, uri: m.thumbnailUri || m.uri, kind: m.type === "video" ? "video" : "image", locked: m.lockPrice != null }))}
              active={studioActive}
              onSelect={setStudioActive}
              onAddMore={() => { void handlePickGallery(); }}
              onRemove={removeStudioItem}
              duration={cur.duration}
              width={cur.width}
              height={cur.height}
              size={cur.size}
              options={cur.options ?? {}}
              onOptionsChange={(o: DmVideoOptions) => patchStudio({ options: o })}
              destruct={cur.destruct ?? null}
              onDestructChange={(c: DmDestructChoice | null) => patchStudio({ destruct: c })}
              onCoverFrame={(uri) => patchStudio({ thumbnailUri: uri })}
              lockPrice={allowLock ? cur.lockPrice ?? null : null}
              onLockPriceChange={allowLock ? (price) => patchStudio({ lockPrice: price }) : undefined}
            />
          );
        })()}
        {studio.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingTop: 12 }}>
            {studio.map((m, i) => {
              const veiled = m.lockPrice != null || m.options?.hidden === "reveal";
              return (
                <View key={`${i}:${m.uri}`}>
                  <Pressable onPress={() => openStudioAt(i)} accessibilityRole="button"
                    accessibilityLabel={_copy("dmVideo.editItem", { defaultValue: "Edit item {{value1}}", value1: i + 1 })}
                    style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden" }} className="bg-theme-neutrals-800">
                    <SmartImage source={{ uri: m.thumbnailUri || m.uri }} recyclingKey={m.thumbnailUri || m.uri} blurRadius={veiled ? 12 : undefined} contentFit="cover" style={{ width: 64, height: 64 }} />
                    <View pointerEvents="none" style={{ position: "absolute", left: 4, bottom: 4, flexDirection: "row", gap: 3 }}>
                      {m.type === "video" && <Icon name="Play" size={11} color="#fff" fill="#fff" />}
                      {m.lockPrice != null && <Icon name="Lock" size={11} color="#fff" />}
                      {m.options?.hidden === "reveal" && <Icon name="EyeOff" size={11} color="#fff" />}
                      {m.destruct ? <Icon name="Timer" size={11} color="#fff" /> : null}
                    </View>
                  </Pressable>
                  <TouchableOpacity onPress={() => removeStudioAt(i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("dm.removeAttachment")}
                    style={{ position: "absolute", right: -6, top: -6, width: 20, height: 20, borderRadius: 6, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="X" size={11} color="#09090B" />
                  </TouchableOpacity>
                </View>
              );
            })}
            <Pressable onPress={() => { void handlePickGallery(); }} accessibilityRole="button"
              accessibilityLabel={_copy("dmVideo.addMore", { defaultValue: "Add photos or videos" })}
              style={{ width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }} className="border-theme-neutrals-600">
              <Icon name="Plus" size={20} color="#A1A1AA" />
            </Pressable>
          </ScrollView>
        )}

        {/* Selected media / GIF preview */}
        {(media || gifUrl) && (
          <Animated.View
            entering={FadeIn.duration(150)}
            className="px-3 pt-2"
          >
            <View className="relative self-start">
              {media?.type === "file" || media?.type === "audio" ? (
                /* A document has no thumbnail to show, so the chip carries the
                   name and size instead of an 80×80 Image of nothing. */
                <View className="flex-row items-center bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-3 py-2 max-w-[260px]">
                  <View className="w-9 h-9 rounded-lg bg-theme-neutrals-700 items-center justify-center mr-2.5">
                    <Icon name={media.type === "audio" ? "Music" : "FileText"} size={18} color="#fff" />
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

          <View className="mx-3 mt-3" style={INPUT_BOX}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              placeholder={placeholder}
              placeholderTextColor="#8B8D90"
              multiline
              maxLength={DM_TEXT_MAX_LENGTH}
              className="text-white text-[15px] leading-5"
              style={INPUT_TEXT}
            />
          </View>

        <View className="flex-row items-center justify-between px-2 pb-2 pt-1">
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

          {canAddTip && onTipPress ? <TouchableOpacity onPress={onTipPress} disabled={enhancing} style={CONTROL_BOX} className="items-center justify-center" accessibilityRole="button" accessibilityLabel={t("dm.addTip")}><Icon name="Gem" size={20} color="#A1A1AA" /></TouchableOpacity> : null}
          <TouchableOpacity {...gifPress} disabled={enhancing} style={CONTROL_BOX} className="items-center justify-center" accessibilityRole="button" accessibilityLabel={t("dm.chooseGif")}><Icon name="Smile" size={20} color="#A1A1AA" /></TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic.tap(); Keyboard.dismiss(); setClipOpen(true); }} disabled={enhancing} style={CONTROL_BOX} className="items-center justify-center" accessibilityRole="button" accessibilityLabel={t("dm.attachAnything", { defaultValue: "Attach a photo, video, audio or file" })}><Icon name="Paperclip" size={20} color="#A1A1AA" /></TouchableOpacity>
          <TouchableOpacity onPress={onStartVoice} disabled={enhancing || sending} style={CONTROL_BOX} className="items-center justify-center" accessibilityRole="button" accessibilityLabel={t("comments.recordVoice")}><Icon name="Mic" size={20} color="#A1A1AA" /></TouchableOpacity>
          <TouchableOpacity onPress={handleEnhance} disabled={enhancing || !text.trim()} style={CONTROL_BOX} className="items-center justify-center" accessibilityRole="button" accessibilityLabel={t("dm.enhanceWithAi")}><Icon name="Sparkles" size={20} color={text.trim() ? "#A1A1AA" : "#52525B"} /></TouchableOpacity>
          {/* Send stays in its own slot, including fee and tip-only sends. */}
          {(
            showCostOnSend ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={!showSendButton || sending || enhancing || insufficientBalance || tipBelowFee}
                activeOpacity={0.7}
                hitSlop={2}
                accessibilityRole="button"
                accessibilityLabel={t("dm.sendMessage")}
                accessibilityState={{ disabled: !showSendButton || sending || enhancing || insufficientBalance || tipBelowFee }}
                style={{ height: CONTROL, maxWidth: 80, flexShrink: 1 }}
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
                    <Text className={`text-[11px] font-semibold ml-1 flex-shrink ${insufficientBalance || tipBelowFee ? "text-theme-neutrals-500" : "text-white"}`}>
                      {totalCost} <DhbCoin />
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSend}
                disabled={!showSendButton || sending || enhancing}
                className="items-center justify-center"
                style={CONTROL_BOX}
                hitSlop={2}
                accessibilityRole="button"
                accessibilityLabel={t("dm.sendMessage")}
                accessibilityState={{ disabled: !showSendButton || sending || enhancing }}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#F4F4F5" />
                ) : (
                  <Icon name="Send" size={20} color={showSendButton ? "#A1A1AA" : "#52525B"} />
                )}
              </TouchableOpacity>
            )
          )}
        </View>
        {/* Up whenever the other side spoke last and the composer is empty,
            beneath the tools row, and stands down while the keyboard owns
            focus. Whether
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

      </View>

      {/* GIF Picker modal */}
      <GifPicker
        visible={gifPickerVisible}
        onPick={handleGifPicked}
        onClose={() => {
          setGifPickerVisible(false);
          keyboardSwap.restore();
        }}
      />

      <ChatAttachSheet
        visible={clipOpen}
        onClose={() => setClipOpen(false)}
        options={[
          { key: "gallery", icon: "Image", label: t("dm.attachPhotoOrVideo", { defaultValue: "Photo or video" }), onPress: () => { setClipOpen(false); void handlePickGallery(); } },
          { key: "any", icon: "Paperclip", label: t("dm.attachFileOrAudio", { defaultValue: "File or audio" }), onPress: () => { setClipOpen(false); void handlePickAnyFile(); } },
        ]}
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
