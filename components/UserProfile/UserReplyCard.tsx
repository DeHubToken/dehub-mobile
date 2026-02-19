/**
 * UserReplyCard – Renders a single comment/reply from the "Replies" tab.
 *
 * Shows: author avatar + name, comment text, post thumbnail context,
 * parent-comment context (for replies), like button, and time.
 * - Tap navigates to the post (video/feed) with the commentId so it highlights.
 * - Long-press opens the existing CommentContextMenu with relevant actions.
 */
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getImageUrl } from "../../libs";
import type { UserReplyItem } from "../../services/user.service";
import { likeComment, type LikeCommentResult } from "../../services/nft.service";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Short-form elapsed time (matching CommentItem convention). */
const formatShortTime = (date: string | undefined): string => {
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

/** Parse @mentions and bold them. */
const parseMentions = (
  text: string,
): { text: string; isMention: boolean }[] => {
  const parts: { text: string; isMention: boolean }[] = [];
  const regex = /@(\w+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isMention: false });
    }
    parts.push({ text: match[0], isMention: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMention: false });
  }
  return parts.length > 0 ? parts : [{ text, isMention: false }];
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface UserReplyCardProps {
  item: UserReplyItem;
  /** Called when the card is tapped — navigate to the post + highlight comment. */
  onPress: (item: UserReplyItem) => void;
  /** Called on long-press. */
  onLongPress?: (item: UserReplyItem) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

const UserReplyCardComponent: React.FC<UserReplyCardProps> = ({
  item,
  onPress,
  onLongPress,
}) => {
  const [liked, setLiked] = useState(item.isLiked);
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);
  const [isLiking, setIsLiking] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;

  const timeAgo = useMemo(() => formatShortTime(item.createdAt), [item.createdAt]);
  const parsedContent = useMemo(() => parseMentions(item.content || ""), [item.content]);

  const author = item.author;
  const displayName = author?.displayName || author?.username || "Unknown";
  const avatarUrl = getAvatarUrl(author?.avatarImageUrl);
  const postThumbnail = item.post?.imageUrl ? getImageUrl(item.post.imageUrl) : undefined;
  const postName = item.post?.name;

  // ── Handlers ────────────────────────────────────────────────────────────

  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [item, onLongPress]);

  const handleLike = useCallback(async () => {
    if (isLiking) return;
    const wasLiked = liked;
    const oldCount = likeCount;

    // Optimistic update
    setLiked(!wasLiked);
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));

    // Bounce
    Animated.sequence([
      Animated.timing(likeScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 150 }),
    ]).start();

    setIsLiking(true);
    try {
      const res: LikeCommentResult = await likeComment({ commentId: item.id });
      if (typeof res.liked === "boolean") {
        setLiked(res.liked);
        setLikeCount(res.likes);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount(oldCount);
    } finally {
      setIsLiking(false);
    }
  }, [liked, likeCount, isLiking, item.id, likeScale]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.75}
      delayLongPress={350}
    >
      <View className="py-3">
        {/* ── "Replying to …" context (only for replies) ── */}
        {item.isReply && item.parentComment && (
          <View className="flex-row items-center mb-1.5 ml-11">
            <Ionicons name="return-down-forward-outline" size={12} color="#6F7174" />
            <Text className="text-[11px] text-theme-neutrals-500 ml-1" numberOfLines={1}>
              Replying to{" "}
              <Text className="font-semibold text-theme-neutrals-400">
                {item.parentComment.author?.displayName ||
                  item.parentComment.author?.username ||
                  "someone"}
              </Text>
              {item.parentComment.content ? (
                <Text className="text-theme-neutrals-600">
                  {" – "}
                  {item.parentComment.content.length > 50
                    ? `${item.parentComment.content.slice(0, 50)}…`
                    : item.parentComment.content}
                </Text>
              ) : null}
            </Text>
          </View>
        )}

        <View className="flex-row">
          {/* Avatar */}
          <Avatar
            uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
            size={32}
          />

          {/* Main content area */}
          <View className="flex-1 ml-3">
            {/* Name + time row */}
            <View className="flex-row items-center">
              <Text className="text-sm font-semibold text-theme-neutrals-100" numberOfLines={1}>
                {displayName}
              </Text>
              {author?.username ? (
                <Text className="text-xs text-theme-neutrals-500 ml-1.5" numberOfLines={1}>
                  @{author.username}
                </Text>
              ) : null}
              <Text className="text-xs text-theme-neutrals-500 ml-1.5">{timeAgo}</Text>
            </View>

            {/* Comment text with @mentions bolded */}
            <Text className="text-sm text-theme-neutrals-300 mt-1 leading-5" numberOfLines={4}>
              {parsedContent.map((part, idx) => (
                <Text
                  key={idx}
                  className={
                    part.isMention
                      ? "font-bold text-theme-neutrals-100"
                      : "font-normal"
                  }
                >
                  {part.text}
                </Text>
              ))}
            </Text>

            {/* Comment image (if any) */}
            {item.imageUrl ? (
              <Image
                source={{ uri: getImageUrl(item.imageUrl) }}
                className="mt-2 rounded-lg"
                style={{ width: 160, height: 100 }}
                resizeMode="cover"
              />
            ) : null}

            {/* Post context badge ── shows what post this comment is on */}
            {item.post && (
              <View className="flex-row items-center mt-2 bg-theme-neutrals-800 rounded-lg overflow-hidden"
                style={{ maxWidth: 280 }}
              >
                {postThumbnail ? (
                  <Image
                    source={{ uri: postThumbnail }}
                    style={{ width: 40, height: 40 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    className="items-center justify-center bg-theme-neutrals-700"
                    style={{ width: 40, height: 40 }}
                  >
                    <Ionicons
                      name={
                        item.post.postType === "video"
                          ? "videocam-outline"
                          : "document-text-outline"
                      }
                      size={18}
                      color="#6F7174"
                    />
                  </View>
                )}
                <View className="flex-1 px-2.5 py-1.5">
                  <Text className="text-[11px] text-theme-neutrals-500" numberOfLines={1}>
                    {item.isReply ? "Replied on" : "Commented on"}
                  </Text>
                  <Text className="text-xs text-theme-neutrals-300 font-medium" numberOfLines={1}>
                    {postName || `Post #${item.tokenId}`}
                  </Text>
                </View>
                <View className="pr-2.5">
                  <Ionicons name="chevron-forward" size={14} color="#6F7174" />
                </View>
              </View>
            )}

            {/* Actions row: like count */}
            <View className="flex-row items-center mt-1.5 gap-4">
              {likeCount > 0 && (
                <Text className="text-[11px] text-theme-neutrals-500">
                  {likeCount} {likeCount === 1 ? "like" : "likes"}
                </Text>
              )}
            </View>
          </View>

          {/* Like button — right-aligned */}
          <TouchableOpacity
            onPress={handleLike}
            activeOpacity={0.7}
            className="px-1 pt-1 items-center justify-start"
            disabled={isLiking}
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={16}
                color={liked ? "#FF3B5C" : "#9CA3AF"}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export const UserReplyCard = memo(UserReplyCardComponent);
export default UserReplyCard;
