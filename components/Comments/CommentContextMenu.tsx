/**
 * CommentContextMenu - WhatsApp/Instagram-style context menu
 *
 * When a user long-presses a comment the rest of the UI blurs out,
 * the pressed comment is rendered "floating" at its original position,
 * and a clean action card appears below it.
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
  Share,
  Image,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../common/Avatar";
import VoiceNotePlayer from "./VoiceNotePlayer";
import { getAvatarUrl } from "../../libs";
import { buildCdnPath } from "../../libs/misc";
import { copyToClipboard } from "../../libs/clipboard.utils";
import type { Comment } from "../../services/nft.service";
import { theme } from "../../theme";
import { WEBSITE_LINK } from "../../config";


export interface CommentLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CommentContextMenuProps {
  visible: boolean;
  comment: Comment | null;
  layout: CommentLayout | null;
  isReply?: boolean;
  isOwnComment: boolean;
  onClose: () => void;
  onReply?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /**
   * Spend a Comment Anchor on this comment, or undefined when it cannot be.
   *
   * Undefined for a comment that is not yours, on a thread that IS yours, or
   * for an account that has not reached Piranha — the same three refusals the
   * server applies, resolved once by the caller rather than by every row.
   */
  onAnchor?: () => void;
  onLike?: () => void;
  liked?: boolean;
  onDislike?: () => void;
  disliked?: boolean;
  /** Own comments swap the Like row for a who-liked row — the server refuses
   *  self-likes, and the author is the only one allowed to see the list. */
  onShowLikers?: () => void;
  tokenId?: number | string;
  /** Whether current user can delete (own comment or video owner) */
  canDelete?: boolean;
}


const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

/** Resolve a media path: local file URIs / full URLs pass through, relative paths go through CDN. */
const resolveMediaUrl = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return buildCdnPath(path) ?? path;
};

/** Returns true if the comment has any media attachment */
const isMediaComment = (c: Comment | null): boolean =>
  !!(c?.imageUrl || c?.gifUrl || c?.audioUrl);

/** Short-form timestamp (duplicated lite version to keep module self-contained) */
const formatShortTime = (date: Date | string | undefined): string => {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 365) return `${Math.floor(d / 365)}y`;
  if (d >= 30) return `${Math.floor(d / 30)}mo`;
  if (d >= 7) return `${Math.floor(d / 7)}w`;
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.max(1, s)}s`;
};


interface ActionRowProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

const ActionRow: React.FC<ActionRowProps> = ({ icon, label, onPress, destructive }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    className="flex-row items-center px-4 py-3"
  >
    <View className="w-8 items-center">
      <Icon
        name={icon}
        size={20}
        color={destructive ? "#EF4444" : "#E5E7EB"}
      />
    </View>
    <Text
      className={`ml-3 text-[15px] ${destructive ? "text-red-500" : "text-theme-neutrals-100"}`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);


const FloatingComment: React.FC<{
  comment: Comment;
  isReply?: boolean;
  liked?: boolean;
}> = ({ comment, isReply, liked }) => {
  const user = comment.user;
  const displayName = user?.displayName || user?.username || "Unknown";
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl || "");
  const timeAgo = formatShortTime(comment.createdAt);

  const parsedContent = useMemo(() => {
    const content = comment.content || "";
    const parts: { text: string; isMention: boolean }[] = [];
    const regex = /@(\w+)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex)
        parts.push({ text: content.slice(lastIndex, match.index), isMention: false });
      parts.push({ text: match[0], isMention: true });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length)
      parts.push({ text: content.slice(lastIndex), isMention: false });
    return parts.length > 0 ? parts : [{ text: content, isMention: false }];
  }, [comment.content]);

  return (
    <View className="flex-row py-3 px-4">
      <Avatar
        uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
        size={isReply ? 28 : 32}
        name={displayName}
      />
      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <Text className="text-sm font-semibold text-theme-neutrals-100">
            {displayName}
          </Text>
          <Text className="text-xs text-theme-neutrals-500 ml-2">{timeAgo}</Text>
        </View>

        {comment.content ? (
          <Text className="text-sm text-theme-neutrals-100 mt-1">
            {parsedContent.map((part, idx) => (
              <Text
                key={idx}
                className={
                  part.isMention
                    ? "font-bold"
                    : "font-normal text-theme-neutrals-300"
                }
                style={part.isMention ? { color: "#D4D4D8" } : undefined}
              >
                {part.text}
              </Text>
            ))}
          </Text>
        ) : null}

        {comment.imageUrl ? (
          <View className="mt-1.5 rounded-lg overflow-hidden bg-theme-neutrals-700" style={{ maxWidth: 220 }}>
            <Image
              source={{ uri: resolveMediaUrl(comment.imageUrl) }}
              style={{ width: 220, height: 165 }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {comment.gifUrl ? (
          <View className="mt-1.5 rounded-lg overflow-hidden bg-theme-neutrals-700" style={{ maxWidth: 220 }}>
            <Image
              source={{ uri: comment.gifUrl }}
              style={{ width: 220, height: 165 }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {comment.audioUrl ? (
          <View className="mt-1.5 rounded-lg bg-theme-neutrals-700/60 px-2" style={{ maxWidth: 260 }}>
            <VoiceNotePlayer
              audioUrl={resolveMediaUrl(comment.audioUrl)}
              duration={comment.audioDuration}
              compact
            />
          </View>
        ) : null}
      </View>

      <View className="px-2 items-center justify-center">
        <Icon
          name="ThumbsUp"
          size={isReply ? 14 : 16}
          color={liked ? "#F9FBFF" : "#6F7174"}
          fill={liked ? "#F9FBFF" : undefined}
          strokeWidth={1.8}
        />
        {(comment.likeCount ?? 0) > 0 && (
          <Text style={{ fontSize: 12, color: "#8B8D90", marginTop: 2 }}>
            {comment.likeCount}
          </Text>
        )}
      </View>
    </View>
  );
};


const ACTIONS_CARD_HEIGHT_ESTIMATE = 240; // rough max
const COMMENT_PADDING = 16;

const CommentContextMenuComponent: React.FC<CommentContextMenuProps> = ({
  visible,
  comment,
  layout,
  isReply,
  isOwnComment,
  onClose,
  onReply,
  onShare,
  onEdit,
  onDelete,
  onAnchor,
  onLike,
  liked,
  onDislike,
  disliked,
  onShowLikers,
  tokenId,
  canDelete,
}) => {
  const insets = useSafeAreaInsets();


  const handleReply = useCallback(() => {
    onClose();
    // Small delay so the menu dismisses before the keyboard opens
    setTimeout(() => onReply?.(), 150);
  }, [onClose, onReply]);

  const handleCopy = useCallback(() => {
    if (comment?.content) {
      copyToClipboard(comment.content);
    }
    onClose();
  }, [comment, onClose]);

  const handleShare = useCallback(async () => {
    onClose();
    try {
      let shareUrl = WEBSITE_LINK;
      if (tokenId && comment) {
        shareUrl = `${WEBSITE_LINK}/app/post/${tokenId}?c=${comment.id}`;
      }
      await Share.share({ message: `Check this out: ${shareUrl}`, url: shareUrl });
    } catch (e) {
      console.error("Share error:", e);
    }
  }, [onClose, tokenId, comment]);

  const handleEdit = useCallback(() => {
    onClose();
    setTimeout(() => onEdit?.(), 150);
  }, [onClose, onEdit]);

  const handleLike = useCallback(() => {
    onClose();
    // Fire after modal dismisses so the async call isn't interrupted
    setTimeout(() => onLike?.(), 100);
  }, [onLike, onClose]);

  const handleShowLikers = useCallback(() => {
    onClose();
    setTimeout(() => onShowLikers?.(), 100);
  }, [onShowLikers, onClose]);

  const handleDislike = useCallback(() => {
    onClose();
    setTimeout(() => onDislike?.(), 100);
  }, [onDislike, onClose]);

  const handleDelete = useCallback(() => {
    onClose();
    setTimeout(() => onDelete?.(), 100);
  }, [onClose, onDelete]);


  const { commentTop, actionsTop } = useMemo(() => {
    if (!layout) return { commentTop: SCREEN_HEIGHT * 0.3, actionsTop: SCREEN_HEIGHT * 0.5 };

    const safeTop = insets.top + 16;
    const safeBottom = SCREEN_HEIGHT - insets.bottom - 16;
    const commentH = layout.height;
    const actionsH = ACTIONS_CARD_HEIGHT_ESTIMATE;
    const gap = 8;
    const totalH = commentH + gap + actionsH;

    let cTop = layout.y;

    // Clamp so the comment + actions stay within safe area
    if (cTop + totalH > safeBottom) {
      cTop = safeBottom - totalH;
    }
    if (cTop < safeTop) {
      cTop = safeTop;
    }

    return { commentTop: cTop, actionsTop: cTop + commentH + gap };
  }, [layout, insets]);

  if (!visible || !comment) return null;

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
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
          {/* Extra dim layer for better contrast */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.45)",
            }}
          />
        </Animated.View>
      </Pressable>

      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(120)}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: commentTop,
          left: COMMENT_PADDING,
          right: COMMENT_PADDING,
        }}
      >
        <Pressable onPress={onClose}>
          <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden">
            <FloatingComment comment={comment} isReply={isReply} liked={liked} />
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(180).delay(60)}
        exiting={FadeOut.duration(120)}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: actionsTop,
          left: COMMENT_PADDING,
          right: COMMENT_PADDING,
        }}
      >
        <Pressable>
          <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden py-1">
            {onReply && (
              <ActionRow icon="MessageSquare" label="Reply" onPress={handleReply} />
            )}

            {comment.content ? (
              <ActionRow icon="Copy" label="Copy" onPress={handleCopy} />
            ) : null}

            <ActionRow icon="Share2" label="Share" onPress={handleShare} />

            {onLike && !isOwnComment && (
              <ActionRow
                icon="ThumbsUp"
                label={liked ? "Unlike" : "Like"}
                onPress={handleLike}
              />
            )}

            {/* Own comment: liking would 400 server-side, so the row becomes
                the author-only who-liked list. Un-liking a historical
                self-like stays possible. */}
            {isOwnComment && liked && onLike && (
              <ActionRow icon="ThumbsUp" label="Unlike" onPress={handleLike} />
            )}
            {isOwnComment && onShowLikers && (
              <ActionRow icon="Users" label="Who liked" onPress={handleShowLikers} />
            )}

            {onDislike && (
              <ActionRow
                icon="ThumbsDown"
                label={disliked ? "Remove Dislike" : "Dislike"}
                onPress={handleDislike}
              />
            )}

            {/*
              Comment Anchor — holding your own comment at the top of somebody
              else's thread. Beside Edit and Delete because it is the same kind
              of thing: something only the comment's author can do to it.
            */}
            {isOwnComment && onAnchor && (
              <ActionRow
                icon="Anchor"
                label="Anchor to the top"
                onPress={() => {
                  onClose();
                  setTimeout(() => onAnchor(), 150);
                }}
              />
            )}

            {isOwnComment && onEdit && !isMediaComment(comment) && (
              <ActionRow icon="Pencil" label="Edit" onPress={handleEdit} />
            )}

            {canDelete && onDelete && (
              <ActionRow icon="Trash2" label="Delete" onPress={handleDelete} destructive />
            )}
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

export const CommentContextMenu = memo(CommentContextMenuComponent);
export default CommentContextMenu;
