import { openMessageReport } from "../common/MessageReportHost";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import HoldSheet, { type HoldReactionChip, type HoldTile } from "../ui/HoldSheet";
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
  // Message whose full emoji picker is open. The menu closes first: iOS will
  // not stack a second modal on one that is still presenting.
  const [moreFor, setMoreFor] = useState<LiveChatMessageData | null>(null);
  const moreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (moreTimer.current) clearTimeout(moreTimer.current);
  }, []);

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

  const tiles: HoldTile[] = [];
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
    secondary: true,
    onPress: () => run(() => onPin(message), 100),
  });
  if (isModerator && !isMe && (isSenderBanned ? onUnban : onBan)) tiles.push({
    key: "ban",
    icon: isSenderBanned ? "ShieldCheck" : "Ban",
    label: isSenderBanned ? t("publicChat.unbanUser") : t("publicChat.banUser"),
    destructive: !isSenderBanned,
    secondary: true,
    onPress: () => run(() => (isSenderBanned ? onUnban : onBan)?.(message), 100),
  });
  if (canDelete && onDelete) tiles.push({ key: "delete", icon: "Trash2", label: t("common.delete"), destructive: true, secondary: true, onPress: () => run(() => onDelete(message), 100) });
  // Every viewer can report a message (App Review 1.2), not only moderators.
  if (!isMe && message.senderAddress) tiles.push({
    key: "report",
    icon: "Flag",
    label: t("postOptions.report"),
    destructive: true,
    secondary: true,
    onPress: () => {
      onClose();
      openMessageReport({
        userId: message.senderAddress,
        userName: message.sender?.displayName || message.sender?.username,
        where: "Live chat",
        messageId: message._id,
        text: message.content,
      });
    },
  });

  const reactions: HoldReactionChip[] | null = onReact
    ? REACTION_EMOJIS.map((emoji) => ({
        key: emoji,
        emoji,
        selected: !!myAddress && (message.reactions?.[emoji]?.some((a) => a?.toLowerCase() === myAddress) ?? false),
      }))
    : null;

  return (
    <>
      <HoldSheet
        visible
        layout={layout}
        onClose={onClose}
        reactions={reactions}
        onReaction={handleReaction}
        onMore={() => {
          const msg = message;
          onClose();
          if (moreTimer.current) clearTimeout(moreTimer.current);
          moreTimer.current = setTimeout(() => setMoreFor(msg), 350);
        }}
        tiles={tiles}
        onLift={onLift}
        frame
        inline
      />
      {moreSheet}
    </>
  );
};

export const LiveChatContextMenu = memo(LiveChatContextMenuComponent);
export default LiveChatContextMenu;
