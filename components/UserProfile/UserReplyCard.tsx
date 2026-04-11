import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  Share,
} from "react-native";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import VoiceNotePlayer from "../Comments/VoiceNotePlayer";
import { getAvatarUrl, buildImageUrl } from "../../libs";
import { buildCdnPath } from "../../libs/misc";
import { WEBSITE_LINK } from "../../config/links";
import type { UserReplyItem } from "../../services/user.service";
import { likeComment, type LikeCommentResult } from "../../services/nft.service";


/** Resolve a media path: local file URIs pass through, relative paths go through CDN. */
const resolveMediaUrl = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return buildCdnPath(path) ?? path;
};

/** Post type → icon name mapping. */
const POST_TYPE_ICON: Record<string, string> = {
  video: "Video",
  "feed-images": "Image",
  "feed-audio": "Headphones",
  "feed-simple": "FileText",
};

/** Short-form elapsed time. */
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


interface UserReplyCardProps {
  item: UserReplyItem;
  onPress: (item: UserReplyItem) => void;
  onLongPress?: (item: UserReplyItem) => void;
}


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
  const handle = author?.username;
  const avatarUrl = getAvatarUrl(author?.avatarImageUrl);

  // Post context — work naturally with what the API gives us
  const post = item.post;
  // Only build a thumbnail when the API actually provides imageUrl (video posts)
  const postThumbnail = post?.imageUrl
    ? buildImageUrl(post.tokenId ?? item.tokenId, post.imageUrl)
    : undefined;
  const postName = (post?.name || "").trim() || undefined; // empty/whitespace → undefined
  const postType = post?.postType ?? "feed-simple";
  const postTypeIcon = POST_TYPE_ICON[postType] ?? "FileText";
  const replyCount = (item as any).replyIds?.length ?? 0;

  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const handleLongPress = useCallback(() => onLongPress?.(item), [item, onLongPress]);

  const handleShare = useCallback(async () => {
    try {
      const shareUrl = item.tokenId
        ? `${WEBSITE_LINK}/app/post/${item.tokenId}?c=${item.id}`
        : WEBSITE_LINK;
      await Share.share({ message: `Check this out: ${shareUrl}`, url: shareUrl });
    } catch (e) {
      console.error("Share error:", e);
    }
  }, [item.tokenId, item.id]);

  const handleLike = useCallback(async () => {
    if (isLiking) return;
    const wasLiked = liked;
    const oldCount = likeCount;

    setLiked(!wasLiked);
    setLikeCount((c) => (wasLiked ? Math.max(0, c - 1) : c + 1));

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


  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.75}
      delayLongPress={350}
      style={{
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        borderRadius: 16,
        overflow: "hidden",
        marginVertical: 4,
      }}
    >
      {post && (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
            borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.03)",
            overflow: "hidden",
          }}
        >
          <View className="flex-row gap-3 p-2.5">
            {postThumbnail ? (
              <View style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" }}>
                <Image
                  source={{ uri: postThumbnail }}
                  style={{ width: 56, height: 56 }}
                  resizeMode="cover"
                />
                {postType === "video" && (
                  <View
                    style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0, bottom: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.3)",
                    }}
                  >
                    <Icon name="Play" size={14} color="#fff" />
                  </View>
                )}
              </View>
            ) : (
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={postTypeIcon as any}
                  size={18}
                  color="#52525b"
                />
              </View>
            )}
            <View className="flex-1 justify-center" style={{ minWidth: 0 }}>
              <Text className="text-sm text-zinc-300 leading-snug" numberOfLines={2}>
                {postName || `Post #${item.tokenId}`}
              </Text>
              <Text className="text-xs text-zinc-500 mt-0.5" numberOfLines={1}>
                {postType === "video" ? "Video" : postType === "feed-images" ? "Image post" : postType === "feed-audio" ? "Audio post" : "Post"}
              </Text>
            </View>
          </View>
        </View>
      )}

      {item.tokenId ? (
        <View className="flex-row items-center gap-1.5 mt-2 mb-1 px-3" style={{ paddingLeft: 52 }}>
          <Icon name="CornerDownRight" size={12} color="#6F7174" />
          <Text className="text-[11px] text-zinc-500">
            {item.parentId ? "Replied to a comment" : "Commented on this post"}
          </Text>
        </View>
      ) : null}

      <View style={{ padding: 12, paddingTop: 4 }}>
        <View className="flex-row items-center">
          <Avatar
            uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
            size={32}
            name={displayName}
          />
          <View className="ml-2.5 flex-1" style={{ minWidth: 0 }}>
            <View className="flex-row items-center">
              <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                {displayName}
              </Text>
              {handle ? (
                <Text className="text-xs text-zinc-500 ml-1.5" numberOfLines={1}>
                  @{handle}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {item.content ? (
          <Text className="text-sm text-white/90 mt-2.5 leading-5" numberOfLines={4}>
            {parsedContent.map((part, idx) => (
              <Text
                key={idx}
                className={part.isMention ? "font-bold text-white" : "font-normal"}
              >
                {part.text}
              </Text>
            ))}
          </Text>
        ) : null}

        {item.imageUrl ? (
          <View className="mt-2 rounded-lg overflow-hidden" style={{ maxWidth: 240 }}>
            <Image
              source={{ uri: resolveMediaUrl(item.imageUrl) }}
              style={{ width: 240, height: 160, borderRadius: 8 }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {item.gifUrl ? (
          <View className="mt-2 rounded-lg overflow-hidden" style={{ maxWidth: 240 }}>
            <Image
              source={{ uri: item.gifUrl }}
              style={{ width: 240, height: 160, borderRadius: 8 }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {item.audioUrl ? (
          <View className="mt-2 rounded-lg bg-theme-neutrals-800/60 px-2" style={{ maxWidth: 240 }}>
            <VoiceNotePlayer
              audioUrl={resolveMediaUrl(item.audioUrl)}
              duration={item.audioDuration}
              compact
            />
          </View>
        ) : null}

        <Text className="text-xs text-zinc-500 mt-2.5">{timeAgo}</Text>

        <View className="flex-row items-center mt-2 -ml-1.5">
          <TouchableOpacity
            onPress={handleLike}
            disabled={isLiking}
            activeOpacity={0.7}
            className="flex-row items-center gap-1.5 px-2 py-1.5"
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Icon
                name="ThumbsUp"
                size={15}
                color={liked ? "#F9FBFF" : "#6F7174"}
                fill={liked ? "#F9FBFF" : undefined}
                strokeWidth={1.8}
              />
            </Animated.View>
            {likeCount > 0 && (
              <Text style={{ fontSize: 11, color: "#8B8D90" }}>
                {likeCount}
              </Text>
            )}
          </TouchableOpacity>

          {!item.isReply && (
            <TouchableOpacity
              onPress={handlePress}
              activeOpacity={0.7}
              className="flex-row items-center gap-1.5 px-2 py-1.5"
            >
              <Icon name="MessageSquare" size={15} color="#6F7174" />
              {replyCount > 0 && (
                <Text style={{ fontSize: 11, color: "#8B8D90" }}>
                  {replyCount}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleShare}
            activeOpacity={0.7}
            className="flex-row items-center gap-1.5 px-2 py-1.5"
          >
            <Icon name="Share2" size={15} color="#6F7174" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export const UserReplyCard = memo(UserReplyCardComponent);
export default UserReplyCard;
