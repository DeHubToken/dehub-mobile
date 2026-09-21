import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  Share,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import VoiceNotePlayer from "../Comments/VoiceNotePlayer";
import { getAvatarUrl } from "../../libs";
import { buildCdnPath, getBadgeUrlFor, getBadgeOpticalStyle } from "../../libs/misc";
import { WEBSITE_LINK } from "../../config/links";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import type {
  UserReplyAuthor,
  UserReplyItem,
  UserReplyParentComment,
  UserReplyPost,
} from "../../services/user.service";
import { likeComment, type LikeCommentResult } from "../../services/nft.service";
import {
  loadReplyPost,
  needsReplyPostAuthor,
  needsReplyPostEnrichment,
  resolveReplyPostBody,
  resolveReplyPostThumbnail,
} from "../../libs/replyPostDisplay";

// A reply is shown as the thread it belongs to, the way the comments section
// draws one: the post on top, the comment being answered when there is one,
// then this user's reply, with a line running through the avatars. Every row
// carries its author's display name, handle and badge — a wallet address is
// never what ends up on screen.

/** Avatar column: 32px wide, so its centre — and the thread line — sits at 16. */
const AVATAR_SIZE = 32;
const AVATAR_GAP = 10;
/** The content column starts after the avatar and its gap. */
const THREAD_INDENT = AVATAR_SIZE + AVATAR_GAP;

const threadLineStyles = StyleSheet.create({
  above: { position: "absolute", left: AVATAR_SIZE / 2, top: 0, height: AVATAR_SIZE / 2, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  below: { position: "absolute", left: AVATAR_SIZE / 2, top: AVATAR_SIZE / 2, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
});

/** Resolve a media path: local file URIs pass through, relative paths go through CDN. */
const resolveMediaUrl = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return buildCdnPath(path) ?? path;
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

const shortAddress = (address?: string): string =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

/** The avatar helper answers a sentinel for "no avatar"; the Avatar wants undefined. */
const avatarUriFor = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  const url = getAvatarUrl(path);
  return url && url !== "default-avatar" ? url : undefined;
};

interface AuthorDisplay {
  name: string;
  handle?: string;
  avatarUri?: string;
  badgeImg?: number;
  /** What the profile sheet opens on — the username, else the address. */
  profileId?: string;
}

/**
 * Everything a header row shows for an author. The wallet address is the
 * last resort for the name and never stands in for the handle — a user with
 * no username simply shows no handle.
 */
function describeAuthor(author: UserReplyAuthor | null | undefined, fallbackAddress?: string): AuthorDisplay {
  const handle = author?.username || undefined;
  const name = author?.displayName || handle || shortAddress(author?.address || fallbackAddress);
  return {
    name,
    handle,
    avatarUri: avatarUriFor(author?.avatarImageUrl),
    badgeImg: author?.hideBadgeAndBalance ? undefined : getBadgeUrlFor(author),
    profileId: author?.username || author?.address || fallbackAddress || undefined,
  };
}

/**
 * One row of the thread. The line segments run to the row's own top and
 * bottom edges so neighbouring rows join into one line; the opaque avatar
 * paints over the middle and the line reads as leaving its rim. Kept inside
 * the row's bounds on purpose: Android clips a child that hangs outside.
 */
const ThreadRow: React.FC<{ lineAbove?: boolean; lineBelow?: boolean; children: React.ReactNode }> = ({
  lineAbove,
  lineBelow,
  children,
}) => (
  <View style={{ position: "relative" }}>
    {lineAbove && <View style={threadLineStyles.above} pointerEvents="none" />}
    {lineBelow && <View style={threadLineStyles.below} pointerEvents="none" />}
    {children}
  </View>
);

const AuthorHeader: React.FC<AuthorDisplay & { time?: string; onPress?: () => void }> = ({
  name,
  handle,
  avatarUri,
  badgeImg,
  time,
  onPress,
}) => (
  <View className="flex-row items-center">
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Avatar uri={avatarUri} size={AVATAR_SIZE} name={name} />
    </TouchableOpacity>
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      className="flex-1"
      style={{ marginLeft: AVATAR_GAP, minWidth: 0 }}
    >
      <View className="flex-row items-center">
        <Text className="text-sm font-semibold text-white" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Text>
        {badgeImg ? (
          <Image
            source={badgeImg}
            style={getBadgeOpticalStyle(badgeImg, 14, 3, 18)}
            resizeMode="contain"
          />
        ) : null}
      </View>
      {handle || time ? (
        <View className="flex-row items-center">
          {handle ? (
            <Text className="text-xs text-zinc-500" numberOfLines={1} style={{ flexShrink: 1 }}>
              @{handle}
            </Text>
          ) : null}
          {handle && time ? <Text className="text-xs text-zinc-600"> · </Text> : null}
          {time ? <Text className="text-xs text-zinc-500">{time}</Text> : null}
        </View>
      ) : null}
    </TouchableOpacity>
  </View>
);

const ThreadSkeletonRow: React.FC = () => (
  <View className="flex-row items-center" style={{ paddingBottom: 14, opacity: 0.7 }}>
    <View style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" }} />
    <View style={{ marginLeft: AVATAR_GAP, flex: 1 }}>
      <View style={{ height: 10, width: 110, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.08)" }} />
      <View style={{ height: 10, width: 170, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.06)", marginTop: 8 }} />
    </View>
  </View>
);

const ThreadNoteRow: React.FC<{ text: string }> = ({ text }) => (
  <View className="flex-row items-center" style={{ paddingBottom: 14 }}>
    <View
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.05)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="MessageSquare" size={14} color="#52525b" />
    </View>
    <Text className="text-sm text-zinc-500 italic" style={{ marginLeft: AVATAR_GAP, flex: 1 }}>
      {text}
    </Text>
  </View>
);

/** The post a comment sits under: its author, its text and its media. */
const ThreadPostRow: React.FC<{ post: UserReplyPost; tokenId: number; onUserPress: (id?: string) => void }> = ({
  post,
  tokenId,
  onUserPress,
}) => {
  const author = describeAuthor(
    post.minterUser ?? {
      address: post.minter || "",
      username: post.minterUsername,
      displayName: post.minterDisplayName,
      avatarImageUrl: post.minterAvatarUrl,
    },
    post.minter,
  );
  const { title, body } = resolveReplyPostBody(post);
  const thumbnail = resolveReplyPostThumbnail(post, tokenId);
  const isVideo = post.postType === "video" || post.postType === "short";
  return (
    <>
      <AuthorHeader {...author} time={formatShortTime(post.createdAt)} onPress={() => onUserPress(author.profileId)} />
      <View style={{ paddingLeft: THREAD_INDENT, paddingBottom: 14 }}>
        {title ? (
          <Text className="text-sm font-semibold text-white mt-2 leading-5" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {body ? (
          <Text className="text-sm text-white/90 leading-5" style={{ marginTop: title ? 4 : 8 }} numberOfLines={6}>
            {body}
          </Text>
        ) : null}
        {thumbnail ? (
          <View style={{ marginTop: 8, borderRadius: 12, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" }}>
            <Image source={{ uri: thumbnail }} style={{ width: "100%", height: 170 }} resizeMode="cover" />
            {isVideo && (
              <View
                style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0, bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="Play" size={18} color="#fff" />
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </>
  );
};

/** The comment this reply answers. */
const ThreadParentCommentRow: React.FC<{ parent: UserReplyParentComment; onUserPress: (id?: string) => void }> = ({
  parent,
  onUserPress,
}) => {
  const author = describeAuthor(parent.author, parent.address);
  const image = parent.imageUrl || parent.gifUrl;
  return (
    <>
      <AuthorHeader {...author} time={formatShortTime(parent.createdAt)} onPress={() => onUserPress(author.profileId)} />
      <View style={{ paddingLeft: THREAD_INDENT, paddingBottom: 14 }}>
        {parent.content ? (
          <Text className="text-sm text-white/90 mt-2 leading-5" numberOfLines={6}>
            {parent.content}
          </Text>
        ) : null}
        {image ? (
          <View className="mt-2 rounded-lg overflow-hidden" style={{ maxWidth: 240 }}>
            <Image
              source={{ uri: resolveMediaUrl(image) }}
              style={{ width: 240, height: 160, borderRadius: 8 }}
              resizeMode="cover"
            />
          </View>
        ) : null}
        {parent.audioUrl ? (
          <View className="mt-2 rounded-lg bg-theme-neutrals-800/60 px-2" style={{ maxWidth: 240 }}>
            <VoiceNotePlayer
              audioUrl={resolveMediaUrl(parent.audioUrl)}
              duration={parent.audioDuration}
              compact
            />
          </View>
        ) : null}
      </View>
    </>
  );
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
  const { t } = useTranslation();
  const { showUserProfile } = useUserProfileSheet();
  const [liked, setLiked] = useState(item.isLiked);
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);
  const [isLiking, setIsLiking] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;

  const timeAgo = useMemo(() => formatShortTime(item.createdAt), [item.createdAt]);
  const parsedContent = useMemo(() => parseMentions(item.content || ""), [item.content]);

  const author = useMemo(() => describeAuthor(item.author, item.address), [item.author, item.address]);
  const replyCount = (item as any).replyIds?.length ?? 0;

  // The comments endpoint only knows the post's minter as an address. The
  // full post — author, avatar, badge, media — is fetched once per tokenId
  // and shared between every reply on the same post.
  const tokenId = item.tokenId ?? item.post?.tokenId ?? 0;
  const needsPost = !!tokenId && (needsReplyPostAuthor(item.post) || needsReplyPostEnrichment(item.post, tokenId));
  // undefined: still loading. null: could not be fetched (deleted, hidden).
  const [loadedPost, setLoadedPost] = useState<UserReplyPost | null | undefined>(undefined);
  useEffect(() => {
    if (!needsPost) return;
    let cancelled = false;
    loadReplyPost(tokenId).then((post) => {
      if (!cancelled) setLoadedPost(post);
    });
    return () => {
      cancelled = true;
    };
  }, [needsPost, tokenId]);
  const post = needsPost ? loadedPost : item.post;
  const postFailed = needsPost && loadedPost === null;

  const isReply = !!item.isReply || (item.parentId != null && item.parentId > 0);
  const parentComment = isReply ? item.parentComment : undefined;
  // A reply whose parent the API could not resolve any more (deleted, hidden).
  const parentCommentGone = isReply && !parentComment;

  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const handleLongPress = useCallback(() => onLongPress?.(item), [item, onLongPress]);
  const handleUserPress = useCallback(
    (id?: string) => {
      if (id) showUserProfile(id);
    },
    [showUserProfile],
  );

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
        borderRadius: 12,
        overflow: "hidden",
        marginVertical: 4,
        padding: 12,
      }}
    >
      {/* The post — the top of every thread. */}
      {tokenId ? (
        <ThreadRow lineBelow>
          {post ? (
            <ThreadPostRow post={post} tokenId={tokenId} onUserPress={handleUserPress} />
          ) : postFailed ? (
            <ThreadNoteRow text={t("profile.replyThread.postUnavailable")} />
          ) : (
            <ThreadSkeletonRow />
          )}
        </ThreadRow>
      ) : null}

      {/* The comment being answered, when this is a reply to one. */}
      {parentComment ? (
        <ThreadRow lineAbove lineBelow>
          <ThreadParentCommentRow parent={parentComment} onUserPress={handleUserPress} />
        </ThreadRow>
      ) : null}
      {parentCommentGone ? (
        <ThreadRow lineAbove lineBelow>
          <ThreadNoteRow text={t("profile.replyThread.commentUnavailable")} />
        </ThreadRow>
      ) : null}

      {/* This user's comment or reply. */}
      <ThreadRow lineAbove={!!tokenId}>
        <AuthorHeader {...author} time={timeAgo} onPress={() => handleUserPress(author.profileId)} />

        <View style={{ paddingLeft: THREAD_INDENT }}>
          {item.content ? (
            <Text className="text-sm text-white/90 mt-2 leading-5" numberOfLines={4}>
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

            {!isReply && (
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
      </ThreadRow>
    </TouchableOpacity>
  );
};

export const UserReplyCard = memo(UserReplyCardComponent);
export default UserReplyCard;
