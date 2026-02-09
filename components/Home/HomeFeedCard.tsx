/**
 * HomeFeedCard - Feed post card for the home screen
 * 
 * Renders image and text posts in a style consistent with VideoCard.
 * This component is optimized for the unified feed on the home screen.
 */
import React, { memo, useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useDerivedValue,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { formatDistance } from "date-fns";
import { FeedCardHeader } from "./FeedCardHeader";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  getAvatarUrl,
  getBadgeUrl,
  getImageUrl,
  getImageUrlApiSimple,
  shareProfile,
  toastError,
} from "../../libs";
import { voteOnNFT } from "../../services/nft.service";
import { savePost } from "../../services/feed.service";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { WEBSITE_LINK } from "../../config";
import { getTransactionLink, openInApp } from "../../libs/links.utils";
import { FeedCaption } from "./FeedCaption";
import { CommentBottomSheet } from "../Comments";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_WIDTH = SCREEN_WIDTH - 32; // Account for padding

const ReanimatedScrollView = Reanimated.createAnimatedComponent(
  require("react-native").ScrollView
);

// =============================================================================
// Types
// =============================================================================

interface HomeFeedCardProps {
  item: UnifiedFeedItem;
  onPress?: () => void;
  onCategorySelect?: (category: string) => void;
  /** When true, shows full-length title, description, and categories without truncation */
  fullContent?: boolean;
  /** When true, disables navigation on press (useful for detail screens) */
  disablePress?: boolean;
  /** Custom handler for comment button press (overrides default bottom sheet) */
  onCommentPress?: () => void;
  /** Show follow button in header */
  showFollowButton?: boolean;
  /** Is the current user following this creator */
  isFollowing?: boolean;
  /** Is there a pending follow request to this creator */
  isFollowRequestPending?: boolean;
  /** Loading state for follow action */
  followLoading?: boolean;
  /** Callback when follow button is pressed */
  onFollowPress?: () => void;
}

// =============================================================================
// Component
// =============================================================================

const HomeFeedCardComponent: React.FC<HomeFeedCardProps> = ({ 
  item, 
  onPress, 
  onCategorySelect, 
  fullContent = false, 
  disablePress = false, 
  onCommentPressProp,
  showFollowButton = false,
  isFollowing = false,
  isFollowRequestPending = false,
  followLoading = false,
  onFollowPress,
}) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();
  
  // State
  const [liked, setLiked] = useState<boolean>(!!item.isLiked);
  const [disliked, setDisliked] = useState<boolean>(!!item.isDisliked);
  const [saved, setSaved] = useState<boolean>(!!item.isSaved);
  const [likeCount, setLikeCount] = useState<number>(
    (item as any).totalVotes?.for || item.likes || 0
  );
  const [dislikeCount, setDislikeCount] = useState<number>(
    (item as any).totalVotes?.against || item.dislikes || 0
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showComments, setShowComments] = useState<boolean>(false);
  
  // Reanimated shared value for scroll position
  const scrollX = useSharedValue(0);
  
  // Animation refs
  const likeScale = useRef(new Animated.Value(1)).current;
  const dislikeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const shareScale = useRef(new Animated.Value(1)).current;
  const commentScale = useRef(new Animated.Value(1)).current;
  const infoScale = useRef(new Animated.Value(1)).current;
  
  // Derived data
  const address = user?.address || user?.walletAddress || "";
  const tokenId = item.tokenId ?? item.id;
  const mintTxHash = (item as any).mintTxHash || (item as any).transactionHash || (item as any).txHash;
  const chainId = (item as any).chainId || 8453; // Default to Base
  
  // Views
  const views = item.views || 0;
  
  // Prefer nested minterUser object over individual fields
  const minterUser = item.minterUser;
  
  const displayName = 
    minterUser?.displayName ||
    minterUser?.username ||
    minterUser?.address ||
    item.minterDisplayName ||
    item.minterUsername ||
    item.minter ||
    "Unknown";
  
  const username = minterUser?.username || item.minterUsername || item.minter || "";
  
  const minterAddress = minterUser?.address || item.minter || item.owner || "";
  
  const avatar = getAvatarUrl(minterUser?.avatarImageUrl || item.minterAvatarUrl || "");
  const badgeImg = getBadgeUrl(item.minterStaked || 0, "dark");
  
  const createdAt = item.createdAt;
  const timeAgo = createdAt
    ? formatDistance(new Date(createdAt), new Date(), { addSuffix: true })
    : "";
  
  const title = item.name || item.title || "";
  const description = item.description || "";
  const commentCount = item.commentCount || 0;
  
  // Get images
  const galleryImages = React.useMemo(() => {
    const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    if (urls.length > 0) {
      return urls.map((u) => getImageUrlApiSimple(u));
    }
    const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "");
    return single ? [single] : [];
  }, [item]);
  
  const hasImages = galleryImages.length > 0;
  const hasMultipleImages = galleryImages.length > 1;
  
  // ==========================================================================
  // Handlers
  // ==========================================================================
  
  const handleUserPress = useCallback(() => {
    const id = minterUser?.username || minterUser?.address || item.minterUsername || item.minter || item.owner;
    if (!id) return;
    
    const selfUsernames = [user?.username, user?.displayName].filter(Boolean);
    const selfAddresses = [user?.walletAddress, user?.address].filter(Boolean);
    const isSelf = selfUsernames.includes(id) || selfAddresses.includes(id);
    
    if (isSelf) {
      navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Profile });
      return;
    }
    showUserProfile(id);
  }, [minterUser, item, user, navigation, showUserProfile]);
  
  const handleFeedPress = useCallback(() => {
    if (onPress) {
      onPress();
    } else if (tokenId != null) {
      navigation.navigate(ScreenNames.FeedDetail, { postId: String(tokenId) });
    }
  }, [tokenId, onPress, navigation]);
  
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
      // Store previous state for rollback
      const wasLiked = liked;
      const wasDisliked = disliked;
      
      // Optimistic update based on toggle behavior
      if (wasLiked) {
        // Already liked -> remove like
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        // Not liked -> add like
        setLiked(true);
        setLikeCount((c) => c + 1);
        // If was disliked, remove dislike
        if (wasDisliked) {
          setDisliked(false);
          setDislikeCount((c) => Math.max(0, c - 1));
        }
      }
      
      // Animation
      likeScale.setValue(1);
      Animated.sequence([
        Animated.timing(likeScale, {
          toValue: 1.2,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(likeScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 5,
          tension: 140,
        }),
      ]).start();
      
      voteOnNFT({
        streamTokenId: tokenId,
        vote: true,
        account: address,
      }).catch(() => {
        // Rollback on error
        setLiked(wasLiked);
        setDisliked(wasDisliked);
        setLikeCount((c) => wasLiked ? c + 1 : Math.max(0, c - 1));
        if (wasDisliked) setDislikeCount((c) => c + 1);
        toastError("Failed to update vote");
      });
    });
  }, [tokenId, liked, disliked, address, likeScale, bounceAnimation, requireAuth]);
  
  const handleDislikePress = useCallback(() => {
    if (tokenId == null) return;
    
    requireAuth?.(() => {
      // Store previous state for rollback
      const wasLiked = liked;
      const wasDisliked = disliked;
      
      bounceAnimation(dislikeScale);
      if (wasDisliked) {
        // Already disliked -> remove dislike
        setDisliked(false);
        setDislikeCount((c) => Math.max(0, c - 1));
      } else {
        // Not disliked -> add dislike
        setDisliked(true);
        setDislikeCount((c) => c + 1);
        // If was liked, remove like
        if (wasLiked) {
          setLiked(false);
          setLikeCount((c) => Math.max(0, c - 1));
        }
      }
      
      voteOnNFT({
        streamTokenId: tokenId,
        vote: false,
        account: address,
      }).catch(() => {
        // Rollback on error
        setLiked(wasLiked);
        setDisliked(wasDisliked);
        setDislikeCount((c) => wasDisliked ? c + 1 : Math.max(0, c - 1));
        if (wasLiked) setLikeCount((c) => c + 1);
        toastError("Failed to update vote");
      });
    });
  }, [tokenId, liked, disliked, address, dislikeScale, bounceAnimation, requireAuth]);
  
  const handleSavePress = useCallback(() => {
    requireAuth?.(() => {
      const wasSaved = saved;
      bounceAnimation(saveScale);
      setSaved((s) => !s);
      if (tokenId != null) {
        savePost(Number(tokenId), address).catch(() => {
          // Revert optimistic update
          setSaved(wasSaved);
          toastError("Failed to save");
        });
      }
    });
  }, [tokenId, address, saved, saveScale, bounceAnimation, requireAuth]);
  
  const handleSharePress = useCallback(() => {
    bounceAnimation(shareScale);
    if (tokenId == null) return;
    const url = `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
    const message = `Check out this post ${url}`;
    try {
      shareProfile(url, message);
    } catch {}
  }, [tokenId, shareScale, bounceAnimation]);
  
  const handleCommentPress = useCallback(() => {
    bounceAnimation(commentScale);
    if (onCommentPressProp) {
      onCommentPressProp();
    } else if (tokenId != null) {
      setShowComments(true);
    }
  }, [tokenId, commentScale, bounceAnimation, onCommentPressProp]);
  
  const handleInfoPress = useCallback(() => {
    bounceAnimation(infoScale);
    if (mintTxHash) {
      const url = getTransactionLink(chainId, mintTxHash);
      if (url) openInApp(url);
    }
  }, [mintTxHash, chainId, infoScale, bounceAnimation]);
  
  // Reanimated scroll handler - runs on UI thread
  const updateIndex = useCallback((index: number) => {
    setActiveImageIndex(index);
  }, []);
  
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const index = Math.round(event.contentOffset.x / IMAGE_WIDTH);
      runOnJS(updateIndex)(index);
    },
  });
  
  // ==========================================================================
  // Render
  // ==========================================================================
  
  const renderImages = () => {
    if (!hasImages) return null;
    
    if (!hasMultipleImages) {
      // Single image
      return (
        <TouchableOpacity activeOpacity={0.95} onPress={handleFeedPress} className="mt-2">
          <Image
            source={{ uri: galleryImages[0] }}
            className="w-full rounded-xl"
            style={{ height: IMAGE_WIDTH * 0.75 }}
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    }
    
    // Instagram-style carousel
    return (
      <View className="mt-2">
        <ReanimatedScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={IMAGE_WIDTH}
          snapToAlignment="start"
        >
          {galleryImages.map((uri, index) => (
            <TouchableOpacity
              key={index}
              activeOpacity={0.95}
              onPress={handleFeedPress}
              style={{ width: IMAGE_WIDTH }}
            >
              <Image
                source={{ uri }}
                className="rounded-xl"
                style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </ReanimatedScrollView>
        
        {/* Image counter badge */}
        <View className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-1">
          <Text className="text-white text-xs font-medium">
            {activeImageIndex + 1}/{galleryImages.length}
          </Text>
        </View>
        
        {/* Dot indicators */}
        <View className="absolute bottom-3 left-0 right-0 flex-row justify-center items-center gap-1.5">
          {galleryImages.map((_, index) => (
            <View
              key={index}
              className={`rounded-full ${
                index === activeImageIndex
                  ? "bg-white w-2 h-2"
                  : "bg-white/50 w-1.5 h-1.5"
              }`}
            />
          ))}
        </View>
      </View>
    );
  };
  
  return (
    <TouchableOpacity
      activeOpacity={disablePress ? 1 : 0.95}
      onPress={disablePress ? undefined : handleFeedPress}
      disabled={disablePress}
      className="my-4"
    >
      {/* Header - uses shared FeedCardHeader */}
      <FeedCardHeader
        avatarUrl={avatar}
        displayName={displayName}
        username={username}
        badgeImage={badgeImg}
        onUserPress={handleUserPress}
        showFollowButton={showFollowButton}
        isFollowing={isFollowing}
        isFollowRequestPending={isFollowRequestPending}
        followLoading={followLoading}
        onFollowPress={onFollowPress}
      />
      
      {/* Images */}
      {renderImages()}
      
      {/* Title, Description & Categories */}
      <FeedCaption
        title={title || undefined}
        description={description || undefined}
        categories={item.category}
        onCategoryPress={onCategorySelect}
    fullContent={fullContent}
        showCategories={fullContent}
      />

      {/* Time and Views row */}
      <View className="flex-row items-center gap-2 pt-1">
        <Text className="text-xs text-theme-neutrals-400">
          {(() => {
            if (!createdAt) return "";
            const d = new Date(createdAt);
            const diffMs = Date.now() - d.getTime();
            const mins = Math.floor(diffMs / 60000);
            if (mins < 60) return `${mins || 1}m`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h`;
            const days = Math.floor(hrs / 24);
            if (days < 7) return `${days}d`;
            const weeks = Math.floor(days / 7);
            if (weeks < 4) return `${weeks}w`;
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
            <Text className="text-xs text-theme-neutrals-400">{commentCount}</Text>
          </TouchableOpacity>
          
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
      {tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
        />
      )}
    </TouchableOpacity>
  );
};

// Memoize to prevent unnecessary re-renders in FlatList
const HomeFeedCard = memo(HomeFeedCardComponent, (prev, next) => {
  return (
    prev.item.tokenId === next.item.tokenId &&
    prev.item.isLiked === next.item.isLiked &&
    prev.item.isSaved === next.item.isSaved &&
    prev.item.likes === next.item.likes
  );
});

export default HomeFeedCard;
