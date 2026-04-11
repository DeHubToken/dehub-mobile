import React, { memo, useCallback, useState, useRef, useMemo } from "react";
import { View, Text, Pressable, Image, Share } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import Icon from "../ui/Icon";
import TranslateButton from "../ui/TranslateButton";
import { useTranslation } from "../../hooks/useTranslation";
import Avatar from "../common/Avatar";
import VoiceNotePlayer from "./VoiceNotePlayer";
import { getAvatarUrl } from "../../libs";
import { buildCdnPath } from "../../libs/misc";

const resolveMediaUrl = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return buildCdnPath(path) ?? path;
};
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useUser } from "../../context/AuthContext";
import { LikeCommentResult } from "../../services/nft.service";
import type { Comment } from "../../services/nft.service";
import type { CommentLayout } from "./CommentContextMenu";
import { WEBSITE_LINK } from "../../config";

const ICON_MUTED = "#6F7174";
const ICON_ACTIVE = "#F9FBFF";

function formatShortTime(date: Date | string | undefined): string {
  if (!date) return "";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffYear > 0) return `${diffYear}y`;
  if (diffMonth > 0) return `${diffMonth}mo`;
  if (diffWeek > 0) return `${diffWeek}w`;
  if (diffDay > 0) return `${diffDay}d`;
  if (diffHour > 0) return `${diffHour}h`;
  if (diffMin > 0) return `${diffMin}m`;
  return `${Math.max(1, diffSec)}s`;
}

interface CommentItemProps {
  comment: Comment;
  isReply?: boolean;
  onReply?: (comment: Comment) => void;
  onLike?: (commentId: number) => Promise<LikeCommentResult | void>;
  onUserPress?: (userId: string) => void;
  onEdit?: (comment: Comment) => void;
  onLongPress?: (comment: Comment, layout: CommentLayout, extra: { liked: boolean; isOwnComment: boolean; isReply: boolean }) => void;
  tokenId?: number | string;
  contentType?: "video" | "feed";
  highlighted?: boolean;
}

const CommentItemComponent: React.FC<CommentItemProps> = ({
  comment,
  isReply = false,
  onReply,
  onLike,
  onUserPress,
  onEdit,
  onLongPress,
  tokenId,
  contentType = "video",
  highlighted = false,
}) => {
  const { showUserProfile } = useUserProfileSheet();
  const currentUser = useUser();
  const [liked, setLiked] = useState(!!comment.isLiked);
  const [likeCount, setLikeCount] = useState(comment.likeCount || 0);
  const [isLiking, setIsLiking] = useState(false);
  const containerRef = useRef<View>(null);

  const likeScale = useSharedValue(1);
  const highlightOpacity = useSharedValue(highlighted ? 1 : 0);

  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  const highlightAnimStyle = useAnimatedStyle(() => ({
    opacity: highlightOpacity.value,
  }));

  React.useEffect(() => {
    if (highlighted) {
      highlightOpacity.value = withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(0.5, { duration: 350 }),
        withTiming(1, { duration: 350 }),
        withTiming(0.5, { duration: 350 }),
        withTiming(1, { duration: 350 }),
        withTiming(1, { duration: 800 }),
        withTiming(0, { duration: 600 }),
      );
    } else {
      highlightOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [highlighted, highlightOpacity]);

  const user = comment.user;
  const displayName = user?.displayName || user?.username || "Unknown";
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl || "");
  const userId = user?.username || user?.address || comment.address || "";
  const isOwnComment = currentUser?.address === user?.address ||
                       currentUser?.walletAddress === user?.address ||
                       currentUser?.username === user?.username;

  const timeAgo = formatShortTime(comment.createdAt);

  const translationTexts = useMemo(() => ({ content: comment.content || '' }), [comment.content]);
  const { isTranslated, translatedTexts, isLoading: translating, handleTranslate, handleShowOriginal, shouldShow: showTranslate } =
    useTranslation(translationTexts, (comment as any).detectedLanguage);

  const displayContent = isTranslated ? (translatedTexts.content || comment.content) : comment.content;

  const parsedContent = useMemo(() => {
    const content = comment.content || "";
    const parts: { text: string; isMention: boolean; username?: string }[] = [];
    const regex = /@([\w.]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: content.slice(lastIndex, match.index), isMention: false });
      }
      parts.push({ text: match[0], isMention: true, username: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push({ text: content.slice(lastIndex), isMention: false });
    }
    return parts.length > 0 ? parts : [{ text: content, isMention: false }];
  }, [comment.content]);

  const handleMentionPress = useCallback((username: string) => {
    showUserProfile(username);
  }, [showUserProfile]);

  const handleUserPress = useCallback(() => {
    if (userId) {
      if (onUserPress) {
        onUserPress(userId);
      } else {
        showUserProfile(userId);
      }
    }
  }, [userId, onUserPress, showUserProfile]);

  const handleLikePress = useCallback(async () => {
    if (isLiking) return;

    const wasLiked = liked;
    const oldCount = likeCount;
    setLiked(!wasLiked);
    setLikeCount((c) => wasLiked ? Math.max(0, c - 1) : c + 1);

    likeScale.value = withSequence(
      withTiming(1.3, { duration: 100 }),
      withSpring(1, { damping: 12, stiffness: 300 }),
    );

    setIsLiking(true);
    try {
      const result = await onLike?.(comment.id);
      if (result && typeof result.liked === "boolean") {
        setLiked(result.liked);
        setLikeCount(result.likes);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(oldCount);
    } finally {
      setIsLiking(false);
    }
  }, [liked, likeCount, isLiking, comment.id, onLike, likeScale]);

  const handleReplyPress = useCallback(() => {
    onReply?.(comment);
  }, [comment, onReply]);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    containerRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress(comment, { x, y, width, height }, {
        liked,
        isOwnComment,
        isReply,
      });
    });
  }, [onLongPress, comment, liked, isOwnComment, isReply]);

  const handleSharePress = useCallback(async () => {
    try {
      const shareUrl = tokenId
        ? `${WEBSITE_LINK}/app/post/${tokenId}?c=${comment.id}`
        : WEBSITE_LINK;
      await Share.share({ message: `Check this out: ${shareUrl}`, url: shareUrl });
    } catch (e) {
      console.error("Share error:", e);
    }
  }, [tokenId, comment.id]);

  if (comment.notFound) {
    return (
      <View style={{ paddingVertical: 12, paddingLeft: isReply ? 48 : 0 }}>
        <Text style={{ color: "#6F7174", fontSize: 13, fontStyle: "italic" }}>
          Comment not found
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={300}
    >
      <View ref={containerRef} style={{ flexDirection: "row", paddingVertical: 10, paddingLeft: isReply ? 40 : 0 }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(59,130,246,0.12)",
              borderRadius: 10,
            },
            highlightAnimStyle,
          ]}
          pointerEvents="none"
        />

        <Pressable onPress={handleUserPress}>
          <Avatar
            uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
            size={isReply ? 28 : 32}
            rounded={false}
            name={displayName}
          />
        </Pressable>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{ fontSize: 13, fontWeight: "600", color: ICON_ACTIVE }}
              onPress={handleUserPress}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text style={{ fontSize: 11, color: "#8B8D90" }}>{timeAgo}</Text>
          </View>

          {comment.content ? (
            <Text style={{ fontSize: 13, color: "#C2C4C7", marginTop: 3, lineHeight: 18 }}>
              {isTranslated
                ? displayContent
                : parsedContent.map((part, idx) =>
                    part.isMention ? (
                      <Text
                        key={idx}
                        style={{ fontWeight: "700", color: "#60A5FA" }}
                        onPress={() => handleMentionPress(part.username!)}
                        suppressHighlighting
                      >
                        {part.text}
                      </Text>
                    ) : (
                      <Text key={idx}>{part.text}</Text>
                    )
                  )}
            </Text>
          ) : null}

          {showTranslate && (
            <TranslateButton
              isTranslated={isTranslated}
              isLoading={translating}
              detectedLanguage={(comment as any).detectedLanguage}
              onTranslate={handleTranslate}
              onShowOriginal={handleShowOriginal}
            />
          )}

          {comment.imageUrl ? (
            <View style={{ marginTop: 6, borderRadius: 10, overflow: "hidden", maxWidth: 220, backgroundColor: "rgba(255,255,255,0.04)" }}>
              <Image
                source={{ uri: resolveMediaUrl(comment.imageUrl) }}
                style={{ width: 220, height: 165 }}
                resizeMode="cover"
              />
            </View>
          ) : null}

          {comment.gifUrl ? (
            <View style={{ marginTop: 6, borderRadius: 10, overflow: "hidden", maxWidth: 220, backgroundColor: "rgba(255,255,255,0.04)" }}>
              <Image
                source={{ uri: comment.gifUrl }}
                style={{ width: 220, height: 165 }}
                resizeMode="cover"
              />
            </View>
          ) : null}

          {comment.audioUrl ? (
            <View style={{ marginTop: 6, borderRadius: 10, maxWidth: 260, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 8 }}>
              <VoiceNotePlayer
                audioUrl={resolveMediaUrl(comment.audioUrl)}
                duration={comment.audioDuration}
                compact
              />
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 12 }}>
            <Pressable
              onPress={handleLikePress}
              disabled={isLiking}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Animated.View style={likeAnimStyle}>
                <Icon
                  name="ThumbsUp"
                  size={14}
                  color={liked ? ICON_ACTIVE : ICON_MUTED}
                  fill={liked ? ICON_ACTIVE : undefined}
                  strokeWidth={1.8}
                />
              </Animated.View>
              {likeCount > 0 && (
                <Text style={{ fontSize: 11, color: "#8B8D90" }}>{likeCount}</Text>
              )}
            </Pressable>

            {!isReply && onReply && (
              <Pressable
                onPress={handleReplyPress}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Icon name="MessageSquare" size={14} color={ICON_MUTED} strokeWidth={1.8} />
              </Pressable>
            )}

            <Pressable
              onPress={handleSharePress}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Icon name="Share2" size={14} color={ICON_MUTED} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

export const CommentItem = memo(CommentItemComponent);
export default CommentItem;
