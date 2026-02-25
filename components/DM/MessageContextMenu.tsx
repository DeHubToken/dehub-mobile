/**
 * MessageContextMenu — WhatsApp / Instagram-style floating message context menu.
 *
 * Long-press a message → blur backdrop → floating message bubble at its
 * original position → action card appears below/above.
 *
 * Shows sender avatar + name + full formatted date for screenshot-worthy display.
 * Aligned to original message position (left for others, right for own).
 */
import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  Dimensions,
  Image,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../common/Avatar";
import PaymentBadge from "./PaymentBadge";
import { getAvatarUrl, buildCdnPath } from "../../libs/misc";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { formatChatTimeSmart } from "../../libs/date.util";
import type { DmMessage, DmUser } from "../../services/dm/dm.types";
import { getSenderUser } from "../../services/dm/dm.types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MessageLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MessageContextMenuProps {
  visible: boolean;
  message: DmMessage | null;
  layout: MessageLayout | null;
  isMine: boolean;
  /** Peer user info for displaying avatar & name on the float */
  peerUser?: { displayName?: string; username?: string; avatarImageUrl?: string };
  /** Current user info for own messages */
  myUser?: { displayName?: string; username?: string; avatarImageUrl?: string };
  onClose: () => void;
  onReply?: () => void;
  onEdit?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

const resolveMediaUrl = (path: string): string => {
  if (
    path.startsWith("file://") ||
    path.startsWith("/") ||
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }
  return buildCdnPath(path) ?? path;
};

// ─── Action Row ─────────────────────────────────────────────────────────────

interface ActionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

const ActionRow: React.FC<ActionRowProps> = ({
  icon,
  label,
  onPress,
  destructive,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    className="flex-row items-center px-4 py-3"
  >
    <View className="w-8 items-center">
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? "#EF4444" : "#F9FBFF"}
      />
    </View>
    <Text
      className={`ml-3 text-[15px] ${
        destructive ? "text-red-400" : "text-theme-neutrals-100"
      }`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

// ─── Floating Message Preview ───────────────────────────────────────────────

const FLOAT_MAX_IMAGE_W = Math.round(SCREEN_WIDTH * 0.75 - 24);

const FloatingMessage: React.FC<{
  message: DmMessage;
  isMine: boolean;
  senderInfo?: { displayName?: string; username?: string; avatarImageUrl?: string };
}> = ({ message, isMine, senderInfo }) => {
  const hasMedia =
    (message.mediaUrls && message.mediaUrls.length > 0) ||
    message.msgType === "gif";
  const isVoice = message.msgType === "voice";
  const hasText = !!message.content?.trim() && message.msgType !== "gif";
  const fullDate = formatChatTimeSmart(message.createdAt, 0);
  const isStandaloneTip = message.msgType === "tip";

  const avatarUrl = getAvatarUrl(senderInfo?.avatarImageUrl);
  const name = senderInfo?.displayName || senderInfo?.username || "You";
  const usernameTag = senderInfo?.username;

  // Payment / tip detection (mirrors MessageBubbleNew)
  const isPaidMsg = !!(message.paymentTxHash || message.paymentStatus || message.tipAmount);
  const paymentAmount = message.tipAmount ?? null;
  const paymentSymbol = message.tipSymbol ?? "DHB";
  const isFailed = isPaidMsg && message.uploadStatus === "failed";
  const isMediaOnly = hasMedia && !hasText && !isVoice;

  // Media preview (first media item)
  const mediaUrl = useMemo(() => {
    if (message.msgType === "gif") {
      const gifMedia = message.mediaUrls?.find(
        (mu) => typeof mu === "object" && /gif/i.test(mu.mimeType || mu.type || ""),
      );
      if (gifMedia) {
        const raw = typeof gifMedia === "string" ? gifMedia : gifMedia.url;
        return resolveMediaUrl(raw);
      }
      // Legacy: content might be a URL for old messages
      if (message.content?.startsWith("http")) return message.content;
      return null;
    }
    const first = message.mediaUrls?.[0];
    if (!first) return null;
    const url = typeof first === "string" ? first : first.url;
    return resolveMediaUrl(url);
  }, [message]);

  // Standalone tip → centred pill (same as MessageBubbleNew)
  if (isStandaloneTip) {
    const amountLabel = message.tipAmount
      ? `${Number(message.tipAmount).toLocaleString()} ${message.tipSymbol || "DHB"}`
      : "DHB";
    const label = isMine ? `You tipped ${amountLabel}` : `Tipped you ${amountLabel}`;
    return (
      <View className="items-center py-2 px-4">
        <View className="flex-row items-center bg-theme-neutrals-800/60 rounded-full px-3 py-1.5 gap-1.5">
          <Text className="text-[13px]">💎</Text>
          <Text className="text-theme-neutrals-300 text-[12px] font-medium">{label}</Text>
        </View>
        <Text className="text-[11px] text-theme-neutrals-500 mt-1">{fullDate}</Text>
      </View>
    );
  }

  const bubbleBg = isMine
    ? "bg-blue-600/90 rounded-2xl rounded-br-sm"
    : "bg-theme-neutrals-800 rounded-2xl rounded-bl-sm";

  return (
    <View className="max-w-[75%]">
      {/* Sender info header */}
      <View
        className={`flex-row items-center mb-1.5 gap-2 ${
          isMine ? "justify-end" : "justify-start"
        }`}
      >
        <Avatar
          uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
          size={24}
        />
        <View className={`flex-shrink-1 ${isMine ? "items-end" : "items-start"}`}>
          <Text className="text-white text-[13px] font-semibold" numberOfLines={1}>
            {isMine ? "You" : name}
          </Text>
          {usernameTag && !isMine && usernameTag !== name && (
            <Text className="text-theme-neutrals-400 text-[10px]" numberOfLines={1}>
              @{usernameTag}
            </Text>
          )}
        </View>
      </View>

      {/* Message bubble */}
      <View className={`${bubbleBg} overflow-hidden`}>
        {/* Forwarded tag */}
        {message.isForwarded && (
          <View className="flex-row items-center gap-1 px-3 pt-1.5">
            <Ionicons name="arrow-redo" size={10} color={isMine ? "rgba(255,255,255,0.5)" : "#A6A9AC"} />
            <Text className={`text-[10px] italic ${isMine ? "text-white/50" : "text-theme-neutrals-400"}`}>
              Forwarded
            </Text>
          </View>
        )}

        {/* Reply-to preview */}
        {message.replyTo && (
          <View
            className={`mx-2 mt-2 rounded-lg overflow-hidden border-l-2 ${
              isMine ? "bg-white/10 border-white/30" : "bg-theme-neutrals-700 border-accent"
            }`}
          >
            <View className="px-2.5 py-2">
              <Text
                className={`text-[11px] font-medium mb-0.5 ${
                  isMine ? "text-white/70" : "text-accent"
                }`}
                numberOfLines={1}
              >
                {message.replyTo.sender?.displayName ||
                  message.replyTo.sender?.username ||
                  "Unknown"}
              </Text>
              <Text
                className={`text-[12px] ${
                  isMine ? "text-white/50" : "text-theme-neutrals-400"
                }`}
                numberOfLines={2}
              >
                {message.replyTo.content ||
                  (message.replyTo.msgType === "voice" ? "🎤 Voice note" : "📷 Media")}
              </Text>
            </View>
          </View>
        )}

        {/* Media */}
        {mediaUrl && (
          <View className="bg-theme-neutrals-700">
            <Image
              source={{ uri: mediaUrl }}
              style={{ width: FLOAT_MAX_IMAGE_W, height: Math.round(FLOAT_MAX_IMAGE_W / (4 / 3)) }}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Voice */}
        {isVoice && (
          <View className="flex-row items-center px-3 py-2.5 gap-2.5 min-w-[160px]">
            <View
              className={`w-8 h-8 rounded-full items-center justify-center ${
                isMine ? "bg-white/20" : "bg-accent/20"
              }`}
            >
              <Ionicons name="mic" size={16} color={isMine ? "#fff" : "#3B82F6"} />
            </View>
            <View className="flex-1 h-1 rounded-full bg-white/20" />
            <Text
              className={`text-[11px] ${
                isMine ? "text-white/70" : "text-theme-neutrals-500"
              }`}
            >
              {message.voiceDuration
                ? `${Math.floor(message.voiceDuration / 60)}:${String(
                    Math.round(message.voiceDuration % 60),
                  ).padStart(2, "0")}`
                : "0:00"}
            </Text>
          </View>
        )}

        {/* Text */}
        {hasText && (
          <Text
            className={`px-3 ${
              hasMedia ? "pt-1.5 pb-0.5" : "pt-2.5 pb-0.5"
            } text-[15px] leading-5 ${
              isMine ? "text-white" : "text-theme-neutrals-100"
            }`}
          >
            {message.content}
          </Text>
        )}

        {/* Payment badge — for paid / tipped messages (not media-only) */}
        {isPaidMsg && !isMediaOnly && (
          <View className="px-3">
            <PaymentBadge
              amount={paymentAmount}
              symbol={paymentSymbol}
              status={message.paymentStatus}
              isMine={isMine}
              failed={isFailed}
            />
          </View>
        )}

        {/* Status + timestamp */}
        {isMediaOnly ? (
          <>
            {isPaidMsg && (
              <View className="px-2 pb-0.5">
                <PaymentBadge
                  amount={paymentAmount}
                  symbol={paymentSymbol}
                  status={message.paymentStatus}
                  isMine={isMine}
                  failed={isFailed}
                />
              </View>
            )}
            <View
              className={`${
                isPaidMsg ? "px-2 pb-1.5 justify-end" : "absolute bottom-1.5 right-2 bg-black/50 rounded-full px-1.5 py-0.5"
              } flex-row items-center gap-1`}
            >
              <Text className="text-[10px] text-white/80">
                {formatChatTimeSmart(message.createdAt, 0).split(",").pop()?.trim() || ""}
              </Text>
              {message.isEdited && (
                <Text className="text-[10px] text-white/50">· edited</Text>
              )}
              {isMine && (
                <Ionicons
                  name={message.isRead ? "checkmark-done" : "checkmark"}
                  size={12}
                  color={message.isRead ? "#3B82F6" : "rgba(255,255,255,0.6)"}
                />
              )}
            </View>
          </>
        ) : (
          <View
            className={`flex-row items-center gap-1 px-3 pb-1.5 ${
              isMine ? "justify-end" : "justify-start"
            }`}
          >
            <Text
              className={`text-[10px] ${
                isMine ? "text-white/50" : "text-theme-neutrals-500"
              }`}
            >
              {formatChatTimeSmart(message.createdAt, 0).split(",").pop()?.trim() || ""}
            </Text>
            {message.isEdited && (
              <Text
                className={`text-[10px] ${
                  isMine ? "text-white/40" : "text-theme-neutrals-600"
                }`}
              >
                · edited
              </Text>
            )}
            {isMine && (
              <Ionicons
                name={message.isRead ? "checkmark-done" : "checkmark"}
                size={12}
                color={message.isRead ? "#3B82F6" : "rgba(255,255,255,0.4)"}
              />
            )}
          </View>
        )}
      </View>

      {/* Full date below bubble */}
      <Text
        className={`text-[11px] text-theme-neutrals-500 mt-1 ${
          isMine ? "text-right" : "text-left"
        }`}
      >
        {fullDate}
      </Text>
    </View>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const ACTIONS_CARD_HEIGHT = 280;
const PADDING = 16;

const MessageContextMenuComponent: React.FC<MessageContextMenuProps> = ({
  visible,
  message,
  layout,
  isMine,
  peerUser,
  myUser,
  onClose,
  onReply,
  onEdit,
  onForward,
  onDelete,
  onCopy,
}) => {
  const insets = useSafeAreaInsets();

  // Resolve sender info for the float header
  const senderInfo = useMemo(() => {
    if (isMine) return myUser || { displayName: "You" };
    return peerUser || { displayName: "User" };
  }, [isMine, myUser, peerUser]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleReply = useCallback(() => {
    onClose();
    setTimeout(() => onReply?.(), 150);
  }, [onClose, onReply]);

  const handleCopy = useCallback(() => {
    if (message?.content) {
      copyToClipboard(message.content);
    }
    onClose();
  }, [message, onClose]);

  const handleEdit = useCallback(() => {
    onClose();
    setTimeout(() => onEdit?.(), 150);
  }, [onClose, onEdit]);

  const handleForward = useCallback(() => {
    onClose();
    setTimeout(() => onForward?.(), 150);
  }, [onClose, onForward]);

  const handleDelete = useCallback(() => {
    onClose();
    setTimeout(() => onDelete?.(), 100);
  }, [onClose, onDelete]);

  // ── Position calculation ──────────────────────────────────────────────────

  const { messageTop, actionsTop, actionsBelow } = useMemo(() => {
    if (!layout)
      return {
        messageTop: SCREEN_HEIGHT * 0.3,
        actionsTop: SCREEN_HEIGHT * 0.5,
        actionsBelow: true,
      };

    const safeTop = insets.top + 16;
    const safeBottom = SCREEN_HEIGHT - insets.bottom - 16;
    // Float includes sender header (~36px) + date below bubble (~24px)
    const FLOAT_EXTRA = 60;
    const msgH = layout.height + FLOAT_EXTRA;
    const actionsH = ACTIONS_CARD_HEIGHT;
    const gap = 8;

    let mTop = layout.y - 36; // offset up to account for sender header above bubble
    let below = true;

    // Clamp top so sender header is visible
    if (mTop < safeTop) mTop = safeTop;

    // Try placing actions below the message
    if (mTop + msgH + gap + actionsH > safeBottom) {
      // Try above instead
      if (mTop - gap - actionsH >= safeTop) {
        below = false;
      } else {
        // Clamp: push message up enough to fit both
        mTop = safeBottom - msgH - gap - actionsH;
        if (mTop < safeTop) mTop = safeTop;
      }
    }

    const aTop = below ? mTop + msgH + gap : mTop - gap - actionsH;
    return { messageTop: mTop, actionsTop: aTop, actionsBelow: below };
  }, [layout, insets]);

  if (!visible || !message) return null;

  const isTextOnly = message.msgType === "msg" || (!message.msgType && !!message.content);
  const canEdit = isMine && isTextOnly;
  const hasContent = !!message.content?.trim();

  return (
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Blurred backdrop */}
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={{ flex: 1 }}
        >
          <BlurView
            intensity={Platform.OS === "ios" ? 40 : 30}
            tint="dark"
            style={{ flex: 1 }}
            {...(Platform.OS === "android"
              ? { experimentalBlurMethod: "dimezisBlurView" }
              : {})}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
            }}
          />
        </Animated.View>
      </Pressable>

      {/* Floating message — aligned to original position */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(120)}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: messageTop,
          left: isMine ? undefined : PADDING,
          right: isMine ? PADDING : undefined,
          maxWidth: SCREEN_WIDTH - PADDING * 2,
        }}
      >
        <Pressable onPress={onClose}>
          <FloatingMessage message={message} isMine={isMine} senderInfo={senderInfo} />
        </Pressable>
      </Animated.View>

      {/* Actions card — aligned same side as message */}
      <Animated.View
        entering={FadeIn.duration(180).delay(60)}
        exiting={FadeOut.duration(120)}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: actionsTop,
          left: isMine ? undefined : PADDING,
          right: isMine ? PADDING : undefined,
          width: SCREEN_WIDTH * 0.65,
          maxWidth: 280,
        }}
      >
        <Pressable>
          <View className="bg-theme-neutrals-800 rounded-2xl overflow-hidden py-1">
            {/* Reply */}
            {onReply && (
              <ActionRow
                icon="chatbubble-outline"
                label="Reply"
                onPress={handleReply}
              />
            )}

            {/* Copy */}
            {hasContent && (
              <ActionRow
                icon="copy-outline"
                label="Copy"
                onPress={handleCopy}
              />
            )}

            {/* Forward */}
            {onForward && (
              <ActionRow
                icon="arrow-redo-outline"
                label="Forward"
                onPress={handleForward}
              />
            )}

            {/* Edit — own text messages only */}
            {canEdit && onEdit && (
              <ActionRow
                icon="pencil-outline"
                label="Edit"
                onPress={handleEdit}
              />
            )}

            {/* Delete — own messages only */}
            {isMine && onDelete && (
              <ActionRow
                icon="trash-outline"
                label="Delete"
                onPress={handleDelete}
                destructive
              />
            )}
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

export const MessageContextMenu = memo(MessageContextMenuComponent);
export default MessageContextMenu;
