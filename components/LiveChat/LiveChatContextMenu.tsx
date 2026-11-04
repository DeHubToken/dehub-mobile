import MessageSurface from "../DM/MessageSurface";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useAppTheme } from "../../context/ThemeContext";
import Icon, { type IconName } from "../ui/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { copyToClipboard } from "../../libs/clipboard.utils";
import type { LiveChatMessageData } from "../../services/livechat.service";
import EmojiSheet from "../Upload/EmojiSheet";

import type { TranslateToggle } from "../ui/TranslateButton";

export interface MessageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LiveChatContextMenuProps {
  visible: boolean;
  message: LiveChatMessageData | null;
  layout: MessageLayout | null;
  isMe: boolean;
  /** The viewer's address, for marking which reactions are already theirs. */
  viewerAddress?: string;
  isModerator: boolean;
  onClose: () => void;
  onReply?: (msg: LiveChatMessageData) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (msg: LiveChatMessageData) => void;
  onDelete?: (msg: LiveChatMessageData) => void;
  onPin?: (msg: LiveChatMessageData) => void;
  /** Whether this message's author is on the room's ban list, so a moderator is offered Unban instead. */
  isSenderBanned?: boolean;
  onBan?: (msg: LiveChatMessageData) => void;
  onUnban?: (msg: LiveChatMessageData) => void;
  /** Translate / Show original — set only when the line is in another language. */
  translate?: TranslateToggle;
  /** How far the screen should slide its list up so the held line clears the sheet (0 to settle back). */
  onLift?: (px: number) => void;
}

const REACTION_EMOJIS = ["🔥", "❤️", "😂", "👀", "💯", "🙌"];

/* ─── Hold sheet ─────────────────────────────────────────────
 * Holding a line keeps that line where it is (no copy of it is drawn), dims
 * the rest of the chat, lifts the list so the line sits just above a glass
 * sheet, and the sheet carries the reactions and actions. The old menu drew a
 * second card of the message over the real one, which on Android (no blur)
 * read as the message twice, with its reply quote repeated again.
 * Mirrors dehubweb ChatHoldSheet.
 * ──────────────────────────────────────────────────────────── */

const GAP = 12;
const SIDE = 8;

interface Tile {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  prime?: boolean;
  destructive?: boolean;
}

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const LiveChatContextMenuComponent: React.FC<LiveChatContextMenuProps> = ({
  visible,
  message,
  layout,
  isMe,
  viewerAddress,
  isModerator,
  onClose,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin,
  isSenderBanned,
  onBan,
  onUnban,
  translate,
  onLift,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  // Colours are written for dark, like the rest of the app: under System
  // Light the JSX tone pass turns them into their daylight versions.
  const { skin, accent, isLight } = useAppTheme();
  const ink = [244, 244, 245];
  const inkColor = rgba(ink, 1);
  const chipFill = rgba(ink, 0.1);
  // Reply is the one filled tile: the theme colour on canvas themes, plain
  // white on System and ink on System Light, as on web. That tile opts out of
  // the theme passes (dark-surface), so its daylight colours are written here.
  const primeFill = skin ? rgba(accent, 1) : isLight ? "#0b0b0d" : "#ffffff";
  const primeInk = skin
    ? (accent[0] * 0.299 + accent[1] * 0.587 + accent[2] * 0.114 > 150 ? "#000000" : "#ffffff")
    : isLight ? "#ffffff" : "#000000";

  const [sheetH, setSheetH] = useState(0);
  // Message whose full emoji picker is open. The menu closes first: iOS will
  // not stack a second modal on one that is still presenting.
  const [moreFor, setMoreFor] = useState<LiveChatMessageData | null>(null);
  const moreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (moreTimer.current) clearTimeout(moreTimer.current);
  }, []);

  // How far the chat slides up so the held line clears the sheet, never past
  // the header.
  const lift = useMemo(() => {
    if (!visible || !layout || !sheetH) return 0;
    const sheetTop = SCREEN_HEIGHT - insets.bottom - SIDE - sheetH;
    const overlap = layout.y + layout.height - (sheetTop - GAP);
    if (overlap <= 0) return 0;
    const headroom = layout.y - (insets.top + 56);
    return Math.max(0, Math.min(overlap, headroom));
  }, [visible, layout, sheetH, SCREEN_HEIGHT, insets.bottom, insets.top]);

  useEffect(() => {
    onLift?.(visible ? lift : 0);
  }, [visible, lift, onLift]);
  useEffect(() => {
    if (!visible) setSheetH(0);
  }, [visible]);

  const run = useCallback((fn?: () => void, delay = 150) => {
    onClose();
    if (fn) setTimeout(fn, delay);
  }, [onClose]);

  const handleReaction = useCallback(
    (emoji: string) => {
      if (!message) return;
      onReact?.(message._id, emoji);
      onClose();
    },
    [message, onReact, onClose],
  );

  const viewer = viewerAddress?.toLowerCase();
  const moreSheet = (
    <EmojiSheet
      visible={!!moreFor}
      onClose={() => setMoreFor(null)}
      selected={
        moreFor && viewer
          ? Object.entries(moreFor.reactions ?? {})
              .filter(([, addresses]) => addresses?.some((a) => a.toLowerCase() === viewer))
              .map(([emoji]) => emoji)
          : undefined
      }
      onSelect={(emoji) => {
        if (moreFor) onReact?.(moreFor._id, emoji);
      }}
    />
  );

  if (!visible || !message) return moreSheet;

  const hasContent = !!message.content?.trim();
  // The API only rewrites a text body — a caption on a photo, GIF or voice
  // note is refused, so offering Edit there is a button that can only fail.
  const canEdit = isMe && message.messageType === "text" && hasContent;
  const canDelete = isMe || isModerator;
  // The viewer's own address, not the author's.
  const myAddress = viewer;

  const tiles: Tile[] = [];
  if (onReply) tiles.push({ key: "reply", icon: "Reply", label: t("liveChat.reply"), prime: true, onPress: () => run(() => onReply(message)) });
  if (hasContent) tiles.push({ key: "copy", icon: "Copy", label: t("common.copy"), onPress: () => { copyToClipboard(message.content); onClose(); } });
  if (translate) tiles.push({
    key: "translate",
    icon: translate.isTranslated ? "RotateCcw" : "Languages",
    label: translate.isTranslated ? t("common.showOriginal") : t("common.translate"),
    onPress: () => { onClose(); translate.toggle(); },
  });
  if (canEdit && onEdit) tiles.push({ key: "edit", icon: "Pencil", label: t("common.edit"), onPress: () => run(() => onEdit(message)) });
  if (isModerator && onPin) tiles.push({
    key: "pin",
    icon: message.isPinned ? "PinOff" : "Pin",
    label: message.isPinned ? t("liveChat.unpinMessage") : t("liveChat.pinMessage"),
    onPress: () => run(() => onPin(message), 100),
  });
  if (isModerator && !isMe && (isSenderBanned ? onUnban : onBan)) tiles.push({
    key: "ban",
    icon: isSenderBanned ? "ShieldCheck" : "Ban",
    label: isSenderBanned ? t("publicChat.unbanUser") : t("publicChat.banUser"),
    destructive: !isSenderBanned,
    onPress: () => run(() => (isSenderBanned ? onUnban : onBan)?.(message), 100),
  });
  if (canDelete && onDelete) tiles.push({ key: "delete", icon: "Trash2", label: t("common.delete"), destructive: true, onPress: () => run(() => onDelete(message), 100) });

  const cols = Math.min(Math.max(tiles.length, 1), 4);
  const dim = "rgba(0,0,0,0.55)";
  const rowTop = layout ? layout.y - lift : 0;
  const rowH = layout?.height ?? 0;

  return (
    <>
      <Modal transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
        {/* Dim everything but the held line: one wash above it, one below. */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")}>
          {layout ? (
            <>
              <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}
                style={{ position: "absolute", left: 0, right: 0, top: 0, height: Math.max(0, rowTop), backgroundColor: dim }} />
              <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}
                style={{ position: "absolute", left: 0, right: 0, top: rowTop + rowH, bottom: 0, backgroundColor: dim }} />
            </>
          ) : (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flex: 1, backgroundColor: dim }} />
          )}
        </Pressable>

        {/* Soft glow on the real line, where it sits. Nothing is redrawn. */}
        {layout && (
          <Animated.View
            pointerEvents="none"
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: rowTop,
              height: rowH,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: rgba(ink, 0.18),
              backgroundColor: rgba(ink, 0.06),
            }}
          />
        )}

        {/* The sheet */}
        <Animated.View
          entering={SlideInDown.duration(240)}
          exiting={SlideOutDown.duration(180)}
          onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
          style={{ position: "absolute", left: SIDE, right: SIDE, bottom: insets.bottom + SIDE }}
        >
          <Pressable>
            <View style={{ borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: rgba(ink, 0.12), paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16 }}>
              <MessageSurface radius={28} />
              <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: rgba(ink, 0.3), marginBottom: 12 }} />

              {onReact && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: rgba(ink, 0.1) }}>
                  {REACTION_EMOJIS.map((emoji) => {
                    const alreadyReacted = !!myAddress && (message.reactions?.[emoji]?.some((a) => a?.toLowerCase() === myAddress) ?? false);
                    return (
                      <TouchableOpacity
                        key={emoji}
                        onPress={() => handleReaction(emoji)}
                        activeOpacity={0.6}
                        accessibilityRole="button"
                        accessibilityState={{ selected: alreadyReacted }}
                        style={{
                          width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
                          backgroundColor: alreadyReacted ? "rgba(56,189,248,0.25)" : chipFill,
                          borderWidth: alreadyReacted ? 1.5 : 0, borderColor: "rgba(56,189,248,0.6)",
                        }}
                      >
                        <Text style={{ fontSize: 24 }}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => {
                      const msg = message;
                      onClose();
                      if (moreTimer.current) clearTimeout(moreTimer.current);
                      moreTimer.current = setTimeout(() => setMoreFor(msg), 350);
                    }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={t("emojiPicker.moreReactions")}
                    style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: chipFill }}
                  >
                    <Icon name="Plus" size={20} color={inkColor} />
                  </TouchableOpacity>
                </View>
              )}

              {tiles.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, paddingTop: onReact ? 10 : 0 }}>
                  {tiles.map((tile) => {
                    const fg = tile.prime ? primeInk : tile.destructive ? "#f87171" : inkColor;
                    return (
                      <View key={tile.key} style={{ width: `${100 / cols}%`, padding: 4 }}>
                        <TouchableOpacity
                          // The filled Reply tile keeps its own fill and label
                          // (the theme pass would repaint a white fill as a
                          // neutral control).
                          className={tile.prime ? "dark-surface" : undefined}
                          onPress={tile.onPress}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={tile.label}
                          style={{
                            borderRadius: 16, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4,
                            alignItems: "center", gap: 6,
                            backgroundColor: tile.prime ? primeFill : chipFill,
                          }}
                        >
                          <Icon name={tile.icon} size={20} color={fg} />
                          <Text numberOfLines={1} style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{tile.label}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </Modal>
      {moreSheet}
    </>
  );
};

export const LiveChatContextMenu = memo(LiveChatContextMenuComponent);
export default LiveChatContextMenu;
