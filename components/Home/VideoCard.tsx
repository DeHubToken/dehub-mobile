import React, { useCallback, useState, useRef } from "react";
import { View, Text, Image, TouchableOpacity, Animated } from "react-native";
import env from "../../config/env"; // retained if used elsewhere
import VideoPreview from "./VideoPreview";
import { Ionicons } from "@expo/vector-icons";
import StatusBadge from "./StatusBadge";
import { formatDistance } from "date-fns";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth, useAuthActions } from "../../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { secondsToHMMSS } from "../../libs/date.util";
import {
  getAvatarUrl,
  resolveThumbnail,
  getImageUrl,
  getBadgeUrl,
  getVideoUrl,
  getDefaultBanner,
  formatCompactNumber,
  shareProfile,
  toastError,
} from "../../libs";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { voteOnNFT } from "../../services/nft.service";
import { savePost } from "../../services/feed.service";
import { toggleRepost } from "../../services/repost.service";
import { WEBSITE_LINK } from "../../config";
import { getTransactionLink, openInApp } from "../../libs/links.utils";
import { FeedCardHeader } from "./FeedCardHeader";
import { FeedCaption } from "./FeedCaption";
import { CommentBottomSheet } from "../Comments";
import PostOptionsMenu from "../common/PostOptionsMenu";
import RepostPopover from "../common/RepostPopover";
import QuotedPostEmbed from "../common/QuotedPostEmbed";

interface VideoCardProps {
  nft: any;
  enablePreview?: boolean;
  badgeIcon?: string;
  onBeforeNavigate?: () => void;
  onCategorySelect?: (category: string) => void;
}

const VideoCardComponent: React.FC<VideoCardProps> = ({
  nft,
  enablePreview,
  badgeIcon,
  onBeforeNavigate,
  onCategorySelect,
}) => {
  // Derivations centralised here
  const streamInfo = nft.streamInfo || (nft as any).stream?.streamInfo;
  const tokenId = nft.tokenId || (nft as any).stream?.tokenId;
  const rawStatus: string | undefined = (nft as any).status;
  const status = rawStatus ? rawStatus.toUpperCase() : undefined;
  const isLive = (nft as any).postType === "live" || !!(nft as any).streamKey || !!streamInfo?.isLive;
  const duration = nft.videoDuration
    ? secondsToHMMSS(nft.videoDuration)
    : undefined;
  const rawThumb =
    (nft as any).thumbnail ||
    (nft as any).stream?.thumbnail ||
    nft.thumbnailUrl ||
    nft.imageUrl ||
    "";
  const thumbUrl = isLive
    ? resolveThumbnail(nft)
    : getImageUrl(rawThumb, 640, 360);
  const thumbnail = thumbUrl
  // Prefer nested minterUser object over individual fields
  const minterUser = (nft as any).minterUser;
  
  const avatarUrl = getAvatarUrl(
    minterUser?.avatarImageUrl ||
    (nft as any).minterAvatarUrl ||
    (nft as any).account?.avatarImageUrl ||
    ""
  );
  const profilePicture =
    avatarUrl && avatarUrl !== "default-avatar"
      ? avatarUrl
      : require("../../assets/default-avatar.png");
  const stakeForBadge = (nft as any).minterUser?.badgeBalance || (nft as any).minterStaked || 0;
  const badgeImage = getBadgeUrl(stakeForBadge, "dark");
  const rawTitle =
    (nft as any).name ||
    (nft as any).title ||
    (nft as any).stream?.title ||
    "";
  const title = rawTitle.toLowerCase() === "untitled" ? "" : rawTitle;
  const description = (nft as any).description || (nft as any).stream?.description || "";
  const categories: string[] = (nft as any).category || [];
  const creator =
    minterUser?.displayName ||
    minterUser?.username ||
    (nft as any).minterDisplayName ||
    (nft as any).mintername ||
    (nft as any).minter ||
    (nft as any).owner ||
    (nft as any).account?.displayName ||
    (nft as any).account?.username ||
    (nft as any).account?.address ||
    "Unknown";
  const username =
    minterUser?.username ||
    (nft as any).account?.username ||
    (nft as any).mintername ||
    undefined;
  const address =
    minterUser?.address ||
    (nft as any).account?.address ||
    (nft as any).minter ||
    (nft as any).owner ||
    undefined;
  const likes =
    nft.totalVotes?.for ||
    (nft as any).stream?.likes ||
    (nft as any).likes ||
    0;
  const dislikes =
    nft.totalVotes?.against ||
    (nft as any).stream?.dislikes ||
    (nft as any).dislikes ||
    0;
  const comments =
    (nft as any).commentCount ||
    (nft as any).stream?.commentCount ||
    (nft as any).comments ||
    0;
  const views =
    nft.views ||
    (nft as any).peakViewers ||
    nft.totalViews ||
    (nft as any).stream?.totalViews ||
    0;
  const createdAt =
    nft.createdAt || (nft as any).stream?.createdAt || new Date().toISOString();
  const isPayPerView = streamInfo?.isPayPerView;
  const payPerViewAmount = streamInfo?.payPerViewAmount;
  const payPerViewTokenSymbol = streamInfo?.payPerViewTokenSymbol;
  const isLocked = streamInfo?.isLockContent;
  const lockContentAmount = streamInfo?.lockContentAmount;
  const lockContentTokenSymbol = streamInfo?.lockContentTokenSymbol;
  const isBounty = !!streamInfo?.isAddBounty;
  const bountyAmount = streamInfo?.addBountyAmount;
  const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol;
  const mintTxHash = (nft as any).mintTxHash || (nft as any).transactionHash || (nft as any).txHash;
  const chainId = (nft as any).chainId || 8453; // Default to Base
  
  // Owner & visibility derivations
  const isOwnerPost = !!(nft as any).isOwner;
  const [isHidden, setIsHidden] = useState<boolean>(!!((nft as any).isHidden));
  const [isFollowingCreator, setIsFollowingCreator] = useState<boolean>(!!((nft as any).isFollowing));
  const [isFollowRequestPending, setIsFollowRequestPending] = useState<boolean>(!!((nft as any).isFollowRequestPending));
  const [showOptionsMenu, setShowOptionsMenu] = useState<boolean>(false);
  const [localTitle, setLocalTitle] = useState<string>(title);
  const [localDescription, setLocalDescription] = useState<string>(description);
  const [localCategories, setLocalCategories] = useState<string[]>(categories);
  const [isDeleted, setIsDeleted] = useState<boolean>(false);

  // Interactive state
  const [liked, setLiked] = useState<boolean>(!!nft.isLiked);
  const [disliked, setDisliked] = useState<boolean>(!!nft.isDisliked);
  const [saved, setSaved] = useState<boolean>(!!nft.isSaved);
  const [likeCount, setLikeCount] = useState<number>(likes);
  const [dislikeCount, setDislikeCount] = useState<number>(dislikes);
  const [showComments, setShowComments] = useState<boolean>(false);
  const [reposted, setReposted] = useState<boolean>(!!nft.isReposted);
  const [repostCount, setRepostCount] = useState<number>(((nft as any).reposts || 0) + ((nft as any).quotes || 0));
  const [showRepostPopover, setShowRepostPopover] = useState<boolean>(false);
  
  // Animation refs
  const likeScale = useRef(new Animated.Value(1)).current;
  const dislikeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const shareScale = useRef(new Animated.Value(1)).current;
  const repostScale = useRef(new Animated.Value(1)).current;
  const infoScale = useRef(new Animated.Value(1)).current;
  const commentScale = useRef(new Animated.Value(1)).current;
  const repostAnchorRef = useRef<View>(null);
  
  const { showUserProfile, hideUserProfile } = useUserProfileSheet();
  const { user } = useAuth();
  const { requireAuth } = useAuthActions();
  const navigation = useNavigation<any>();
  const userAddress = user?.address || user?.walletAddress || "";
  const handlePressCreator = useCallback(() => {
    const id = username || creator || address;
    if (!id) return;
    showUserProfile(id);
  }, [username, creator, address, showUserProfile]);
  const handlePressAvatar = handlePressCreator;
  const isStringThumb = typeof thumbnail === "string";
  const hasThumb = isStringThumb ? thumbnail.trim().length > 0 : true; // local require numbers considered valid
  const accessInfo = useStreamAccessInfo(nft);
  const handlePressVideo = useCallback(() => {
    if (tokenId == null) return; // require valid tokenId
    onBeforeNavigate?.();
    const target = isLive ? ScreenNames.LiveViewer : ScreenNames.VideoPlayer;
    navigation.navigate(
      target as never,
      {
        isLive,
        nft,
        accessInfo,
        streamId: (nft as any)?.stream?._id || (nft as any)?.stream?.id || nft?._id, // prefer livestream doc ID over NFT ID
      } as never
    );
  }, [navigation, tokenId, isLive, nft, accessInfo, onBeforeNavigate]);
  
  // Bounce animation helper
  const bounceAnimation = useCallback((scale: Animated.Value) => {
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 150,
      }),
    ]).start();
  }, []);
  
  const handleLikePress = useCallback(() => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      const wasLiked = liked;
      const wasDisliked = disliked;
      
      bounceAnimation(likeScale);
      
      if (wasLiked) {
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        setLiked(true);
        setLikeCount((c) => c + 1);
        if (wasDisliked) {
          setDisliked(false);
          setDislikeCount((c) => Math.max(0, c - 1));
        }
      }
      
      voteOnNFT({
        streamTokenId: tokenId,
        vote: true,
        account: userAddress,
      }).catch(() => {
        // Revert optimistic update
        setLiked(wasLiked);
        setDisliked(wasDisliked);
        setLikeCount((c) => wasLiked ? c + 1 : Math.max(0, c - 1));
        if (wasDisliked) setDislikeCount((c) => c + 1);
        toastError("Failed to update vote");
      });
    });
  }, [tokenId, liked, disliked, userAddress, likeScale, bounceAnimation, requireAuth]);
  
  const handleDislikePress = useCallback(() => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      const wasLiked = liked;
      const wasDisliked = disliked;
      
      bounceAnimation(dislikeScale);
      
      if (wasDisliked) {
        setDisliked(false);
        setDislikeCount((c) => Math.max(0, c - 1));
      } else {
        setDisliked(true);
        setDislikeCount((c) => c + 1);
        if (wasLiked) {
          setLiked(false);
          setLikeCount((c) => Math.max(0, c - 1));
        }
      }
      
      voteOnNFT({
        streamTokenId: tokenId,
        vote: false,
        account: userAddress,
      }).catch(() => {
        // Revert optimistic update
        setLiked(wasLiked);
        setDisliked(wasDisliked);
        setDislikeCount((c) => wasDisliked ? c + 1 : Math.max(0, c - 1));
        if (wasLiked) setLikeCount((c) => c + 1);
        toastError("Failed to update vote");
      });
    });
  }, [tokenId, liked, disliked, userAddress, dislikeScale, bounceAnimation, requireAuth]);
  
  const handleSavePress = useCallback(() => {
    requireAuth?.(() => {
      const wasSaved = saved;
      bounceAnimation(saveScale);
      setSaved((s) => !s);
      if (tokenId != null) {
        savePost(Number(tokenId), userAddress).catch(() => {
          // Revert optimistic update
          setSaved(wasSaved);
          toastError("Failed to save");
        });
      }
    });
  }, [tokenId, userAddress, saved, saveScale, bounceAnimation, requireAuth]);
  
  const handleSharePress = useCallback(() => {
    bounceAnimation(shareScale);
    if (tokenId == null) return;
    const url = `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
    const message = `Check out this video ${url}`;
    try {
      shareProfile(url, message);
    } catch {}
  }, [tokenId, shareScale, bounceAnimation]);
  
  const handleCommentPress = useCallback(() => {
    bounceAnimation(commentScale);
    if (tokenId != null) {
      setShowComments(true);
    }
  }, [tokenId, commentScale, bounceAnimation]);
  
  const handleRepostPress = useCallback(() => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      bounceAnimation(repostScale);
      setShowRepostPopover(true);
    });
  }, [tokenId, repostScale, bounceAnimation, requireAuth]);

  const handleUndoRepost = useCallback(() => {
    if (tokenId == null) return;
    const wasReposted = reposted;
    const prevCount = repostCount;
    setReposted(false);
    setRepostCount((c) => Math.max(0, c - 1));
    toggleRepost(Number(tokenId)).catch(() => {
      setReposted(wasReposted);
      setRepostCount(prevCount);
      toastError("Failed to remove repost");
    });
  }, [tokenId, reposted, repostCount]);

  const handleConfirmRepost = useCallback(() => {
    if (tokenId == null) return;
    const prevCount = repostCount;
    setReposted(true);
    setRepostCount((c) => c + 1);
    toggleRepost(Number(tokenId)).catch(() => {
      setReposted(false);
      setRepostCount(prevCount);
      toastError("Failed to repost");
    });
  }, [tokenId, repostCount]);

  const handleQuotePress = useCallback(() => {
    hideUserProfile();
    navigation.navigate(ScreenNames.Upload, {
      quotedTokenId: tokenId,
      quotedPost: nft as any,
    });
  }, [navigation, tokenId, nft, hideUserProfile]);

  const handleInfoPress = useCallback(() => {
    bounceAnimation(infoScale);
    if (mintTxHash) {
      const url = getTransactionLink(chainId, mintTxHash);
      if (url) openInApp(url);
    }
  }, [mintTxHash, chainId, infoScale, bounceAnimation]);

  const handleOpenOptions = useCallback(() => {
    setShowOptionsMenu(true);
  }, []);

  const handleFollowChange = useCallback((following: boolean, pending?: boolean) => {
    setIsFollowingCreator(following);
    setIsFollowRequestPending(!!pending);
  }, []);

  const handleVisibilityChange = useCallback((hidden: boolean) => {
    setIsHidden(hidden);
  }, []);

  const handleEditSuccess = useCallback((data: { name?: string; description?: string; category?: string[] }) => {
    if (data.name !== undefined) setLocalTitle(data.name);
    if (data.description !== undefined) setLocalDescription(data.description);
    if (data.category !== undefined) setLocalCategories(data.category);
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    setIsDeleted(true);
  }, []);

  // Don't render if deleted
  if (isDeleted) return null;
  
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePressVideo}
      className="rounded-lg my-4 overflow-hidden"
    >
      {/* Avatar row + menu trigger */}
      <View className="flex-row items-start">
        <View className="flex-1">
          <FeedCardHeader
            avatarUrl={typeof profilePicture === "string" ? profilePicture : undefined}
            displayName={creator}
            username={username}
            badgeImage={badgeImage}
            badgeIcon={badgeIcon}
            onUserPress={handlePressCreator}
          />
        </View>
        <TouchableOpacity
          onPress={handleOpenOptions}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="flex-row items-center ml-1 mt-1"
        >
          {isHidden && (
            <Ionicons name="eye-off" size={14} color="#9CA3AF" style={{ marginRight: 4 }} />
          )}
          <Ionicons name="ellipsis-vertical" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePressVideo}
        className="relative w-full h-48 bg-theme-neutrals-700 justify-center items-center rounded-xl overflow-hidden"
      >
        {hasThumb ? (
          typeof thumbnail === "string" ? (
            <Image
              source={{ uri: thumbnail }}
              className="absolute inset-0 w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <Image
              source={thumbnail}
              className="absolute inset-0 w-full h-full"
              resizeMode="cover"
            />
          )
        ) : (
          <View className="absolute inset-0 w-full h-full bg-theme-neutrals-800 items-center justify-center">
            <Ionicons name="videocam-off" size={40} color="#666" />
          </View>
        )}
        {enablePreview &&
          !isLive &&
          tokenId &&
          typeof tokenId !== "undefined" &&
          typeof thumbnail === "string" &&
          hasThumb && (
            <VideoPreview
              previewUrl={getVideoUrl(tokenId) || ""}
              onStart={undefined}
              onEnd={undefined}
              handlePressVideo={handlePressVideo}
            />
          )}
        {status && <StatusBadge status={status} />}
        {isPayPerView && (
          <View className="absolute top-2 right-2 bg-blue-600 px-2 py-1 rounded">
            <Text className="text-theme-neutrals-200 text-xs font-bold">
              PPV: {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
            </Text>
          </View>
        )}
        {isBounty && (
          <View
            className="absolute -left-8 top-0 w-40 origin-top-left bg-pink-600"
            style={{ transform: [{ rotate: "-45deg" }, { translateX: -30 }, { translateY: 8 }, { scaleX: 1.15 }] }}
          >
            <View className="w-full py-0.5">
              <Text className="text-theme-neutrals-200 text-[10px] font-bold text-center">
                W2E: {formatCompactNumber(bountyAmount)} {bountyTokenSymbol}
              </Text>
            </View>
          </View>
        )}
        {isLocked && (
          <View className="absolute bottom-2 mb-5 right-2 bg-purple-600 px-2 py-1 rounded">
            <Text className="text-theme-neutrals-200 text-xs font-bold">
              Lock: {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
            </Text>
          </View>
        )}

        {duration && (
          <View className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
            <Text className="text-theme-neutrals-200 text-xs">{duration}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Title, Description & Categories */}
      <FeedCaption
        title={localTitle || undefined}
        description={localDescription || undefined}
        categories={localCategories}
        onCategoryPress={onCategorySelect}
        showCategories={false}
      />

      {/* Quoted Post Embed (for quote posts) */}
      {(nft as any).isQuotePost && (
        <QuotedPostEmbed
          quotedPost={(nft as any).quotedPost}
          quotedTokenId={(nft as any).quotedTokenId}
        />
      )}

      {/* Time and Views row */}
      <View className="flex-row items-center gap-2 pt-1">
        <Text className="text-xs text-theme-neutrals-400">
          {(() => {
            const d = new Date(createdAt);
            const diffMs = Date.now() - d.getTime();
            const mins = Math.floor(diffMs / 60000);
            if (mins < 60) return `${mins || 1}m`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h`;
            const days = Math.floor(hrs / 24);
            if (days < 7) return `${days}d`;
            if (days < 30) return `${Math.floor(days / 7)}w`;
            const months = Math.floor(days / 30);
            if (months < 12) return `${months}mo`;
            const years = Math.floor(days / 365);
            return `${years}y`;
          })()}
        </Text>
        <Text className="text-xs text-theme-neutrals-500">·</Text>
        <View className="flex-row items-center gap-1">
          <Ionicons name="eye-outline" size={14} color="#9CA3AF" />
          <Text className="text-xs text-theme-neutrals-400">{views}</Text>
        </View>
      </View>

      {/* Action bar */}
      <View className="flex-row items-center justify-between pt-2">
        <View className="flex-row items-center gap-4">
          {/* Like */}
          <TouchableOpacity
            onPress={handleLikePress}
            activeOpacity={0.7}
            className="flex-row items-center gap-1"
          >
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={liked ? "thumbs-up" : "thumbs-up-outline"}
                size={18}
                color={liked ? "#FFFFFF" : "#9CA3AF"}
              />
            </Animated.View>
            <Text className="text-xs text-theme-neutrals-400">{likeCount}</Text>
          </TouchableOpacity>
          {/* Dislike */}
          <TouchableOpacity
            onPress={handleDislikePress}
            activeOpacity={0.7}
            className="flex-row items-center gap-1"
          >
            <Animated.View style={{ transform: [{ scale: dislikeScale }] }}>
              <Ionicons
                name={disliked ? "thumbs-down" : "thumbs-down-outline"}
                size={18}
                color={disliked ? "#FFFFFF" : "#9CA3AF"}
              />
            </Animated.View>
            <Text className="text-xs text-theme-neutrals-400">{dislikeCount}</Text>
          </TouchableOpacity>
          {/* Comments */}
          <TouchableOpacity
            onPress={handleCommentPress}
            activeOpacity={0.7}
            className="flex-row items-center gap-1"
          >
            <Animated.View style={{ transform: [{ scale: commentScale }] }}>
              <Ionicons name="chatbubble-outline" size={18} color="#9CA3AF" />
            </Animated.View>
            <Text className="text-xs text-theme-neutrals-400">{comments}</Text>
          </TouchableOpacity>
          {/* Repost */}
          <View ref={repostAnchorRef} style={{ position: 'relative', zIndex: 50 }}>
            <TouchableOpacity
              onPress={handleRepostPress}
              activeOpacity={0.7}
              className="flex-row items-center gap-1"
            >
              <Animated.View style={{ transform: [{ scale: repostScale }] }}>
                <Ionicons
                  name="git-compare-outline"
                  size={18}
                  color={reposted ? "#22C55E" : "#9CA3AF"}
                />
              </Animated.View>
              <Text className={`text-xs ${reposted ? "text-green-500" : "text-theme-neutrals-400"}`}>
                {repostCount}
              </Text>
            </TouchableOpacity>
            <RepostPopover
              visible={showRepostPopover}
              onClose={() => setShowRepostPopover(false)}
              onRepost={reposted ? handleUndoRepost : handleConfirmRepost}
              onQuote={handleQuotePress}
              isReposted={reposted}
              anchorRef={repostAnchorRef}
            />
          </View>
          {/* Share */}
          <TouchableOpacity
            onPress={handleSharePress}
            activeOpacity={0.7}
            className="flex-row items-center gap-1"
          >
            <Animated.View style={{ transform: [{ scale: shareScale }] }}>
              <Ionicons name="share-social-outline" size={18} color="#9CA3AF" />
            </Animated.View>
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center gap-4">
          {/* Bookmark */}
          <TouchableOpacity onPress={handleSavePress} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: saveScale }] }}>
              <Ionicons
                name={saved ? "bookmark" : "bookmark-outline"}
                size={18}
                color={saved ? "#FFFFFF" : "#9CA3AF"}
              />
            </Animated.View>
          </TouchableOpacity>
          {/* Info */}
          <TouchableOpacity onPress={handleInfoPress} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: infoScale }] }}>
              <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Comment Bottom Sheet */}
      <CommentBottomSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        tokenId={tokenId}
      />

      {/* Post Options Menu */}
      <PostOptionsMenu
        visible={showOptionsMenu}
        onClose={() => setShowOptionsMenu(false)}
        tokenId={tokenId}
        isOwner={isOwnerPost}
        isHidden={isHidden}
        creatorDisplayName={creator}
        creatorIdentifier={address || username || ""}
        isFollowing={isFollowingCreator}
        isFollowRequestPending={isFollowRequestPending}
        currentTitle={localTitle}
        currentDescription={localDescription}
        currentCategories={localCategories}
        onFollowChange={handleFollowChange}
        onVisibilityChange={handleVisibilityChange}
        onEditSuccess={handleEditSuccess}
        onDeleteSuccess={handleDeleteSuccess}
      />
    </TouchableOpacity>
  );
};

// Shallow props comparison to avoid unnecessary re-renders inside FlatList
const areEqual = (prev: VideoCardProps, next: VideoCardProps) =>
  prev.nft === next.nft &&
  prev.enablePreview === next.enablePreview &&
  prev.badgeIcon === next.badgeIcon &&
  prev.onBeforeNavigate === next.onBeforeNavigate;

const VideoCard = React.memo(VideoCardComponent, areEqual);

export default VideoCard;
