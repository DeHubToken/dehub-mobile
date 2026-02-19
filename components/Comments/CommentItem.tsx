/**
 * CommentItem - Individual comment component (Instagram-style)
 * 
 * Displays a comment with user avatar, username, content, time, like button,
 * and reply button. Also handles rendering replies.
 * - @usernames are bolded
 * - Long-press shows IG-style action sheet for share/edit
 * - Short timestamps (1s, 1m, 1h, 1d, 1w, 1mo, 1y)
 */
import React, { memo, useCallback, useState, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { getAvatarUrl } from "../../libs";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth } from "../../context/AuthContext";
import { LikeCommentResult } from "../../services/nft.service";
import type { Comment } from "../../services/nft.service";
import type { CommentLayout } from "./CommentContextMenu";

// Format time in short form: 1s, 1m, 1h, 1d, 1w, 1mo, 1y
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
  /** Called on long-press with the comment and its measured screen layout */
  onLongPress?: (comment: Comment, layout: CommentLayout, extra: { liked: boolean; isOwnComment: boolean; isReply: boolean }) => void;
  tokenId?: number | string;
  contentType?: "video" | "feed";
  /** When true, highlights the comment with a blinking animation */
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
  const { user: currentUser } = useAuth();
  const [liked, setLiked] = useState(!!comment.isLiked);
  const [likeCount, setLikeCount] = useState(comment.likeCount || 0);
  const [isLiking, setIsLiking] = useState(false);
  const [showHighlight, setShowHighlight] = useState(highlighted);
  const containerRef = useRef<View>(null);
  
  // Animation refs
  const likeScale = useRef(new Animated.Value(1)).current;
  const highlightOpacity = useRef(new Animated.Value(highlighted ? 1 : 0)).current;

  // Highlight animation: pulse gently twice, hold, then fade out
  React.useEffect(() => {
    if (highlighted) {
      setShowHighlight(true);
      highlightOpacity.setValue(0);
      const sequence = Animated.sequence([
        // Fade in
        Animated.timing(highlightOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        // Pulse: dim then bright twice
        Animated.timing(highlightOpacity, { toValue: 0.5, duration: 350, useNativeDriver: true }),
        Animated.timing(highlightOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(highlightOpacity, { toValue: 0.5, duration: 350, useNativeDriver: true }),
        Animated.timing(highlightOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        // Hold
        Animated.delay(800),
        // Fade out
        Animated.timing(highlightOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]);
      sequence.start(() => setShowHighlight(false));
    } else {
      setShowHighlight(false);
      highlightOpacity.setValue(0);
    }
  }, [highlighted, highlightOpacity]);

  // Use nested user object
  const user = comment.user;
  const displayName = user?.displayName || user?.username || "Unknown";
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl || "");
  const userId = user?.username || user?.address || comment.address || "";
  const isOwnComment = currentUser?.address === user?.address || 
                       currentUser?.walletAddress === user?.address ||
                       currentUser?.username === user?.username;

  const timeAgo = formatShortTime(comment.createdAt);

  // Parse content to bold @usernames
  const parsedContent = useMemo(() => {
    const content = comment.content || "";
    const parts: { text: string; isMention: boolean }[] = [];
    const regex = /@(\w+)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        parts.push({ text: content.slice(lastIndex, match.index), isMention: false });
      }
      // The @username
      parts.push({ text: match[0], isMention: true });
      lastIndex = regex.lastIndex;
    }
    // Remaining text
    if (lastIndex < content.length) {
      parts.push({ text: content.slice(lastIndex), isMention: false });
    }
    return parts.length > 0 ? parts : [{ text: content, isMention: false }];
  }, [comment.content]);

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
    
    // Optimistic update
    const wasLiked = liked;
    const oldCount = likeCount;
    setLiked(!wasLiked);
    setLikeCount((c) => wasLiked ? Math.max(0, c - 1) : c + 1);
    
    // Bounce animation
    Animated.sequence([
      Animated.timing(likeScale, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(likeScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 150,
      }),
    ]).start();

    setIsLiking(true);
    try {
      const result = await onLike?.(comment.id);
      // Sync with server response if available
      if (result && typeof result.liked === "boolean") {
        setLiked(result.liked);
        setLikeCount(result.likes);
      }
    } catch {
      // Revert on error
      setLiked(wasLiked);
      setLikeCount(oldCount);
    } finally {
      setIsLiking(false);
    }
  }, [liked, likeCount, isLiking, comment.id, onLike, likeScale]);

  const handleReplyPress = useCallback(() => {
    onReply?.(comment);
  }, [comment, onReply]);

  // Long-press handler - measure position and pass to parent
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

  // If comment not found (for shared comment links)
  if (comment.notFound) {
    return (
      <View className={`flex-row py-3 ${isReply ? "pl-12" : ""}`}>
        <View className="flex-1">
          <Text className="text-theme-neutrals-500 text-sm italic">
            Comment not found
          </Text>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onLongPress={handleLongPress}
      activeOpacity={0.8}
      delayLongPress={300}
    >
      <View ref={containerRef} className={`flex-row py-3 ${isReply ? "pl-10" : ""}`}>
          {/* Highlight background for shared comments */}
          {showHighlight && (
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                borderRadius: 10,
                opacity: highlightOpacity,
              }}
              pointerEvents="none"
            />
          )}
          
          {/* Avatar */}
          <TouchableOpacity onPress={handleUserPress} activeOpacity={0.7}>
            <Avatar
              uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
              size={isReply ? 28 : 32}
            />
          </TouchableOpacity>

          {/* Content */}
          <View className="flex-1 ml-3">
            {/* Username and timestamp */}
            <View className="flex-row items-center">
              <Text
                className="text-sm font-semibold text-theme-neutrals-100"
                onPress={handleUserPress}
              >
                {displayName}
              </Text>
              <Text className="text-xs text-theme-neutrals-500 ml-2">{timeAgo}</Text>
            </View>

            {/* Comment content with @mentions bolded */}
            <Text className="text-sm text-theme-neutrals-100 mt-1">
              {parsedContent.map((part, idx) => (
                <Text
                  key={idx}
                  className={part.isMention ? "font-bold text-theme-neutrals-100" : "font-normal text-theme-neutrals-300"}
                >
                  {part.text}
                </Text>
              ))}
            </Text>

            {/* Actions row */}
            <View className="flex-row items-center mt-1.5 gap-4">
              {/* Reply button - only for top-level comments */}
              {!isReply && onReply && (
                <TouchableOpacity onPress={handleReplyPress} activeOpacity={0.7}>
                  <Text className="text-xs text-theme-neutrals-500 font-semibold">
                    Reply
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Like button with count */}
          <TouchableOpacity
            onPress={handleLikePress}
            activeOpacity={0.7}
            className="px-2 py-1 items-center justify-center"
            disabled={isLiking}
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={isReply ? 14 : 16}
                color={liked ? "#FF3B5C" : "#9CA3AF"}
              />
            </Animated.View>
            {likeCount > 0 && (
              <Text className="text-[10px] text-theme-neutrals-500 mt-0.5">
                {likeCount}
              </Text>
            )}
          </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

export const CommentItem = memo(CommentItemComponent);
export default CommentItem;
