import React, { memo, useCallback, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Dimensions,
  Pressable,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  runOnJS,
} from "react-native-reanimated";
import { ScrollView as RNScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { FeedCardHeader } from "./FeedCardHeader";
import FeedActionBar from "./FeedActionBar";
import { FeedCaption } from "./FeedCaption";
import AudioPostPlayer from "./AudioPostPlayer";
import FeedVideoPlayer from "./FeedVideoPlayer";
import StatusBadge from "./StatusBadge";
import { CommentBottomSheet } from "../Comments";
import PostOptionsMenu from "../common/PostOptionsMenu";
import ImageTranslationSheet from "../common/ImageTranslationSheet";
import QuotedPostEmbed from "../common/QuotedPostEmbed";
import GlassTipSheet from "../Tip/GlassTipSheet";
import PPVSheet from "../PPV/PPVSheet";
import BountyInfoSheet from "./BountyInfoSheet";
import AskAISheet from "./AskAISheet";
import Icon from "../ui/Icon";
import TranslateButton from "../ui/TranslateButton";
import SoundtrackBadge from "../Post/SoundtrackBadge";
import { useSyncedAudio } from "../../hooks/useSyncedAudio";
import { parseSoundtrack } from "../../libs/parseSoundtrack";
import { useTranslation } from "../../hooks/useTranslation";
import { useImageTranslation } from "../../hooks/useImageTranslation";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUser, useAuthActions, useAuthState } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import PollCard from "../DM/PollCard";
import {
  getAvatarUrl,
  getBadgeUrl,
  resolveBadgeBalance,
  getImageUrl,
  getImageUrlApiSimple,
  getAudioUrl,
  getVideoUrl,
  getShortsThumbnailUrl,
  resolveThumbnail,
  formatCompactNumber,
  shareProfile,
  toastError,
} from "../../libs";
import { secondsToHMMSS } from "../../libs/date.util";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { voteOnNFT } from "../../services/nft.service";
import { savePost } from "../../services/feed.service";
import { toggleRepost } from "../../services/repost.service";
import { WEBSITE_LINK } from "../../config";
import { getTransactionLink, openInApp } from "../../libs/links.utils";
import env from "../../config/env";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import type { AIPostContext } from "../../services/ai.service";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_WIDTH = SCREEN_WIDTH - 32;

const ReanimatedScrollView = Reanimated.createAnimatedComponent(RNScrollView);

type PostContentType = "image" | "video" | "audio" | "live" | "short";

function resolveContentType(item: UnifiedFeedItem): PostContentType {
  if (item.postType === "live") return "live";
  if (item.postType === "short") return "short";
  if (item.postType === "feed-audio" && !!item.audioUrl) return "audio";
  const hasVideo = !!(
    (item as any).videoDuration ||
    item.postType === "video" ||
    (item as any).streamKey
  );
  if (hasVideo) return "video";
  return "image";
}

function formatShortTimeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
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
  return `${Math.floor(days / 365)}y`;
}

interface FeedCardProps {
  item: UnifiedFeedItem;
  onCategorySelect?: (category: string) => void;
  fullContent?: boolean;
  disablePress?: boolean;
  onCommentPress?: () => void;
  isVisible?: boolean;
  enablePreview?: boolean;
  /** Fires before any card-press navigation (e.g. to close a bottom sheet). */
  onBeforeNavigate?: () => void;
  /** Show a "Reposted" label inside the card above the user header row. */
  showRepostLabel?: boolean;
}

const FeedCardComponent: React.FC<FeedCardProps> = ({
  item,
  onCategorySelect,
  fullContent = false,
  disablePress = false,
  onCommentPress: onCommentPressProp,
  isVisible = true,
  enablePreview = true,
  onBeforeNavigate,
  showRepostLabel = false,
}) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { isSignedIn } = useAuthState();
  const { showUserProfile, hideUserProfile } = useUserProfileSheet();

  const contentType = useMemo(() => resolveContentType(item), [item]);

  // --- Data derivation ---
  const stream = (item as any).stream;
  const streamInfo = (item as any).streamInfo || stream?.streamInfo;
  const tokenId = item.tokenId ?? (item as any).id ?? stream?.tokenId;
  const mintTxHash = (item as any).mintTxHash || (item as any).transactionHash || (item as any).txHash;
  const chainId = (item as any).chainId || 8453;

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
  const badgeImg = getBadgeUrl(resolveBadgeBalance(minterUser || item));

  const createdAt = item.createdAt || stream?.createdAt;
  const title = (() => {
    const raw = item.name || item.title || stream?.title || "";
    return raw.toLowerCase() === "untitled" ? "" : raw;
  })();
  const description = item.description || stream?.description || "";
  const soundtrack = useMemo(() => parseSoundtrack(description), [description]);
  const hasSoundtrack = !!soundtrack;
  const commentCount = item.commentCount || (item as any).comments || stream?.commentCount || 0;
  const views = item.views || (item as any).peakViewers || (item as any).totalViews || stream?.totalViews || 0;
  const totalTips = (item as any).totalTips || (item as any).tips || 0;
  const isAudioPost = contentType === "audio";
  const isLive = contentType === "live";
  const isVideo = contentType === "video" || contentType === "short";
  const isShort = contentType === "short";

  const userAddress = user?.address || user?.walletAddress || "";
  const isOwnerPost = !!(item as any).isOwner || (
    userAddress && minterAddress && userAddress.toLowerCase() === minterAddress.toLowerCase()
  );

  // --- Gallery images (for image posts) ---
  const galleryImages = useMemo(() => {
    const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    if (urls.length > 0) return urls.map((u) => getImageUrlApiSimple(u));
    const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "");
    return single ? [single] : [];
  }, [item]);
  const hasImages = galleryImages.length > 0;
  const hasMultipleImages = galleryImages.length > 1;

  // --- Video/Live thumbnail ---
  const thumbnail = useMemo(() => {
    if (isLive) {
      const thumb = stream?.thumbnail;
      if (thumb) {
        if (thumb.startsWith("http")) return thumb;
        return `${env.CDN_BASE_URL}/${thumb}`;
      }
      const itemThumb = item.imageUrl || item.thumbnailUrl;
      if (itemThumb) {
        if (itemThumb.startsWith("http")) return itemThumb;
        return `${env.CDN_BASE_URL}/${itemThumb}`;
      }
      return resolveThumbnail(item as any);
    }
    if (isVideo) {
      if (isShort) {
        return getShortsThumbnailUrl(tokenId) || "";
      }
      const rawThumb =
        (item as any).thumbnail ||
        stream?.thumbnail ||
        item.thumbnailUrl ||
        item.imageUrl ||
        "";
      return getImageUrl(rawThumb, 640, 360);
    }
    return "";
  }, [item, stream, isLive, isVideo]);

  const hasThumb = typeof thumbnail === "string" && thumbnail.trim().length > 0;
  const duration = (item as any).videoDuration ? secondsToHMMSS((item as any).videoDuration) : undefined;

  // --- Monetization badges ---
  const isPayPerView = streamInfo?.isPayPerView;
  const payPerViewAmount = streamInfo?.payPerViewAmount || 0;
  const payPerViewTokenSymbol = streamInfo?.payPerViewTokenSymbol || "DHB";
  const isLocked = streamInfo?.isLockContent;
  const lockContentAmount = streamInfo?.lockAmount || streamInfo?.lockContentAmount || 0;
  const lockContentTokenSymbol = streamInfo?.lockContentTokenSymbol || "DHB";
  const isBounty = !!streamInfo?.isAddBounty;
  const bountyAmount = streamInfo?.addBountyAmount || 0;
  const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol || "DHB";

  // --- Stream status ---
  const rawStatus: string | undefined = (item as any).status || stream?.status;
  const status = rawStatus ? rawStatus.toUpperCase() : undefined;
  const isCurrentlyLive = rawStatus === "live" || stream?.status === "live";

  // --- Live stats ---
  const currentViewers = stream?.peakViewers || 0;
  const liveViewCount = stream?.totalViews || item.views || 0;
  const liveLikes = stream?.likes || item.likes || 0;

  // --- Access info (for navigation) ---
  const accessInfo = useStreamAccessInfo(item as any);

  // Derive actual gating state from computed access (accounts for ownership and unlock status)
  const streamStatus = accessInfo?.streamStatus;
  const isServerLockedPPV = !!streamStatus?.isLockedWithPPV;
  const isActuallyLockedHoldings = !!streamStatus?.isLockedWithLockContent;

  // --- Interactive state ---
  const [liked, setLiked] = useState(!!item.isLiked);
  const [disliked, setDisliked] = useState(!!item.isDisliked);
  const [saved, setSaved] = useState(!!item.isSaved);
  const [likeCount, setLikeCount] = useState(
    (item as any).totalVotes?.for || item.likes || 0,
  );
  const [dislikeCount, setDislikeCount] = useState(
    (item as any).totalVotes?.against || item.dislikes || 0,
  );
  const [reposted, setReposted] = useState(!!item.isReposted);
  const [repostCount, setRepostCount] = useState(
    ((item as any).reposts || 0) + ((item as any).quotes || 0),
  );
  const [showRepostPopover, setShowRepostPopover] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showPPVModal, setShowPPVModal] = useState(false);
  const [showBountyModal, setShowBountyModal] = useState(false);
  const [showAISheet, setShowAISheet] = useState(false);
  const [ppvUnlocked, setPpvUnlocked] = useState(false);
  // Local unlock overrides server PPV state after successful payment
  const isActuallyLockedPPV = isServerLockedPPV && !ppvUnlocked;
  const isActuallyComboLocked = isActuallyLockedPPV && isActuallyLockedHoldings;
  const isActuallyGated = isActuallyLockedPPV || isActuallyLockedHoldings;
  const [isHidden, setIsHidden] = useState(!!((item as any).isHidden));
  const [isFollowingCreator, setIsFollowingCreator] = useState(!!((item as any).isFollowing));
  const [isFollowReqPending, setIsFollowReqPending] = useState(!!((item as any).isFollowRequestPending));
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description);
  const [localCategories, setLocalCategories] = useState<string[]>(item.category || []);

  const translationTexts = useMemo(() => ({
    title: localTitle || '',
    description: localDescription || '',
  }), [localTitle, localDescription]);
  const { isTranslated, translatedTexts, isLoading: translating, handleTranslate, handleShowOriginal, shouldShow: showTranslate } =
    useTranslation(translationTexts, item.detectedLanguage);
  const { isLoading: imgTranslating, error: imgTranslateError, result: imgTranslateResult, translateImage, clearResult: clearImgResult } =
    useImageTranslation();
  const [showImgTranslationSheet, setShowImgTranslationSheet] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const scrollX = useSharedValue(0);

  // --- Handlers ---
  const handleUserPress = useCallback(() => {
    const id = username || minterAddress;
    if (!id) return;
    showUserProfile(id);
  }, [username, minterAddress, showUserProfile]);

  const handleCardPress = useCallback(() => {
    if (disablePress) return;
    onBeforeNavigate?.();
    hideUserProfile();
    if (isLive) {
      const target = isOwnerPost ? ScreenNames.LiveProducer : ScreenNames.LiveViewer;
      const streamId = stream?._id || stream?.id || (item as any)._id;
      navigation.navigate(target as never, {
        isLive: isCurrentlyLive,
        nft: item,
        accessInfo,
        streamId,
      } as never);
    } else if (isShort && tokenId != null) {
      navigation.navigate(ScreenNames.ShortsViewer, {
        initialIndex: 0,
        initialItems: [item],
      });
    } else if (tokenId != null) {
      navigation.navigate(ScreenNames.FeedDetail, { postId: String(tokenId) });
    }
  }, [
    disablePress, isLive, isShort, isOwnerPost, item, tokenId,
    accessInfo, stream, isCurrentlyLive, navigation, hideUserProfile, onBeforeNavigate,
  ]);

  const handleImagePress = useCallback((index: number = 0) => {
    if (!hasImages) return;
    navigation.navigate(ScreenNames.ImageViewer, {
      images: galleryImages,
      initialIndex: index,
    });
  }, [navigation, galleryImages, hasImages]);

  const handleTranslateImage = useCallback(() => {
    const imageUrl = galleryImages[0];
    if (!imageUrl) return;
    setShowImgTranslationSheet(true);
    translateImage(imageUrl);
  }, [galleryImages, translateImage]);

  const handleLikePress = useCallback(() => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      const wasLiked = liked;
      const wasDisliked = disliked;
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
        setLiked(wasLiked);
        setDisliked(wasDisliked);
        setLikeCount((c) => wasLiked ? c + 1 : Math.max(0, c - 1));
        if (wasDisliked) setDislikeCount((c) => c + 1);
        toastError("Failed to update vote");
      });
    });
  }, [tokenId, liked, disliked, userAddress, requireAuth]);

  const handleDislikePress = useCallback(() => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      const wasLiked = liked;
      const wasDisliked = disliked;
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
        setLiked(wasLiked);
        setDisliked(wasDisliked);
        setDislikeCount((c) => wasDisliked ? c + 1 : Math.max(0, c - 1));
        if (wasLiked) setLikeCount((c) => c + 1);
        toastError("Failed to update vote");
      });
    });
  }, [tokenId, liked, disliked, userAddress, requireAuth]);

  const handleSavePress = useCallback(() => {
    requireAuth?.(() => {
      const wasSaved = saved;
      setSaved((s) => !s);
      if (tokenId != null) {
        savePost(Number(tokenId), userAddress).catch(() => {
          setSaved(wasSaved);
          toastError("Failed to save");
        });
      }
    });
  }, [tokenId, userAddress, saved, requireAuth]);

  const handleSharePress = useCallback(() => {
    if (tokenId == null) return;
    const url = `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
    const message = `Check out this post ${url}`;
    try {
      shareProfile(url, message);
    } catch {}
  }, [tokenId]);

  const handleTipPress = useCallback(() => {
    if (!minterAddress) return;
    requireAuth?.(() => {
      setShowTipModal(true);
    });
  }, [minterAddress, requireAuth]);

  const handlePPVPress = useCallback(() => {
    requireAuth?.(() => {
      setShowPPVModal(true);
    });
  }, [requireAuth]);

  const handlePPVSuccess = useCallback(() => {
    setPpvUnlocked(true);
  }, []);

  const handleBountyBadgePress = useCallback(() => {
    requireAuth?.(() => {
      setShowBountyModal(true);
    });
  }, [requireAuth]);

  const handleCommentPress = useCallback(() => {
    if (onCommentPressProp) {
      onCommentPressProp();
    } else if (tokenId != null) {
      setShowComments(true);
    }
  }, [tokenId, onCommentPressProp]);

  const handleRepostPress = useCallback(() => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      setShowRepostPopover(true);
    });
  }, [tokenId, requireAuth]);

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
      quotedPost: item as any,
    });
  }, [navigation, tokenId, item, hideUserProfile]);

  const handleInfoPress = useCallback(() => {
    if (mintTxHash) {
      const url = getTransactionLink(chainId, mintTxHash);
      if (url) openInApp(url);
    }
  }, [mintTxHash, chainId]);

  const handleOpenOptions = useCallback(() => {
    setShowOptionsMenu(true);
  }, []);

  const handleFollowChange = useCallback((following: boolean, pending?: boolean) => {
    setIsFollowingCreator(following);
    setIsFollowReqPending(!!pending);
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

  // Image carousel scroll handler
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

  const handleAiPress = useCallback(() => {
    requireAuth?.(() => {
      setShowAISheet(true);
    });
  }, [requireAuth]);

  const aiPostContext = useMemo<AIPostContext>(() => ({
    type: isVideo ? "video" : isLive ? "live" : isAudioPost ? "post" : "image",
    author: displayName,
    authorUsername: username || undefined,
    caption: description || undefined,
    title: title || undefined,
    thumbnail: thumbnail || undefined,
    imageUrl: galleryImages[0] || thumbnail || undefined,
    categories: item.category?.length ? item.category : undefined,
    views: views || undefined,
    likes: likeCount || undefined,
    dislikes: dislikeCount || undefined,
    comments: commentCount || undefined,
    tips: totalTips || undefined,
    reposts: repostCount || undefined,
    duration: duration || undefined,
    createdAt: createdAt || undefined,
    isPayPerView: isPayPerView || undefined,
    ppvAmount: isPayPerView ? payPerViewAmount : undefined,
    ppvCurrency: isPayPerView ? payPerViewTokenSymbol : undefined,
    isLockContent: isLocked || undefined,
    lockAmount: isLocked ? lockContentAmount : undefined,
    lockCurrency: isLocked ? lockContentTokenSymbol : undefined,
    isBounty: isBounty || undefined,
    bountyAmount: isBounty ? bountyAmount : undefined,
    bountyCurrency: isBounty ? bountyTokenSymbol : undefined,
    isLive: isCurrentlyLive || undefined,
    imageCount: hasMultipleImages ? galleryImages.length : undefined,
  }), [
    isVideo, isLive, isAudioPost, displayName, username, description, title,
    thumbnail, galleryImages, item.category, views, likeCount, dislikeCount,
    commentCount, totalTips, repostCount, duration, createdAt, isPayPerView,
    payPerViewAmount, payPerViewTokenSymbol, isLocked, lockContentAmount,
    lockContentTokenSymbol, isBounty, bountyAmount, bountyTokenSymbol,
    isCurrentlyLive, hasMultipleImages,
  ]);

  if (isDeleted) return null;

  // --- Content renderers ---
  const renderImageContent = () => {
    if (!hasImages) return null;

    // Combo-locked image (PPV + holdings): dual icon overlay (matches web ImageCard behaviour)
    if (isActuallyComboLocked) {
      return (
        <Pressable
          onPress={handlePPVPress}
          className="mt-2 rounded-xl overflow-hidden"
          style={{ height: IMAGE_WIDTH * 0.75 }}
        >
          <Image
            source={{ uri: galleryImages[0] }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            blurRadius={20}
          />
          <View className="absolute inset-0 bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row gap-2">
              <View className="flex-row items-center gap-1 bg-black/60 rounded-full px-2.5 py-1">
                <Icon name="Ticket" size={12} color="#fff" />
                <Text className="text-white text-xs font-medium">
                  {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
                </Text>
              </View>
              <View className="flex-row items-center gap-1 bg-black/60 rounded-full px-2.5 py-1">
                <Icon name="Lock" size={12} color="#fff" />
                <Text className="text-white text-xs font-medium">
                  {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3 mb-3">
              <View className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 items-center justify-center">
                <Icon name="Ticket" size={24} color="#fff" />
              </View>
              <View className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 items-center justify-center">
                <Icon name="Lock" size={24} color="#fff" />
              </View>
            </View>
            <Text className="text-white font-semibold text-sm mb-1">Pay-Per-View Content</Text>
            <Text className="text-white/70 text-xs">
              Unlock for {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol} + hold {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
            </Text>
          </View>
        </Pressable>
      );
    }

    // PPV-only locked image: blurred preview with unlock overlay (matches web ImageCard behaviour)
    if (isActuallyLockedPPV) {
      return (
        <Pressable
          onPress={handlePPVPress}
          className="mt-2 rounded-xl overflow-hidden"
          style={{ height: IMAGE_WIDTH * 0.75 }}
        >
          <Image
            source={{ uri: galleryImages[0] }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            blurRadius={20}
          />
          <View className="absolute inset-0 bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row items-center gap-1 bg-black/60 rounded-full px-2.5 py-1">
              <Icon name="Ticket" size={12} color="#fff" />
              <Text className="text-white text-xs font-medium">
                {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
              </Text>
            </View>
            <View className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10 items-center justify-center mb-3">
              <Icon name="Ticket" size={28} color="#fff" />
            </View>
            <Text className="text-white font-semibold text-sm mb-1">Pay-Per-View Content</Text>
            <Text className="text-white/70 text-xs">
              Unlock for {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
            </Text>
          </View>
        </Pressable>
      );
    }

    // Holdings-only locked image: blurred preview with lock overlay
    if (isActuallyLockedHoldings) {
      return (
        <Pressable
          onPress={handleCardPress}
          className="mt-2 rounded-xl overflow-hidden"
          style={{ height: IMAGE_WIDTH * 0.75 }}
        >
          <Image
            source={{ uri: galleryImages[0] }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            blurRadius={20}
          />
          <View className="absolute inset-0 bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row items-center gap-1 bg-black/60 rounded-full px-2.5 py-1">
              <Icon name="Lock" size={12} color="#fff" />
              <Text className="text-white text-xs font-medium">
                {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
              </Text>
            </View>
            <View className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10 items-center justify-center mb-3">
              <Icon name="Lock" size={28} color="#fff" />
            </View>
            <Text className="text-white font-semibold text-sm mb-1">Holdings Required</Text>
            <Text className="text-white/70 text-xs">
              Must be holding {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
            </Text>
          </View>
        </Pressable>
      );
    }

    if (!hasMultipleImages) {
      return (
        <Pressable onPress={() => handleImagePress(0)} className="mt-2">
          <Image
            source={{ uri: galleryImages[0] }}
            className="w-full rounded-xl"
            style={{ height: IMAGE_WIDTH * 0.75 }}
            resizeMode="cover"
          />
        </Pressable>
      );
    }
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
            <Pressable key={index} onPress={() => handleImagePress(index)} style={{ width: IMAGE_WIDTH }}>
              <Image
                source={{ uri }}
                className="rounded-xl"
                style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH }}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </ReanimatedScrollView>
        <View className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-1">
          <Text className="text-white text-xs font-medium">
            {activeImageIndex + 1}/{galleryImages.length}
          </Text>
        </View>
        <View className="absolute bottom-3 left-0 right-0 flex-row justify-center items-center gap-1.5">
          {galleryImages.map((_, index) => (
            <View
              key={index}
              className={`rounded-full ${
                index === activeImageIndex ? "bg-white w-2 h-2" : "bg-white/50 w-1.5 h-1.5"
              }`}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderVideoThumbnail = () => (
    <FeedVideoPlayer
      thumbnail={thumbnail}
      videoUrl={isActuallyGated ? undefined : (getVideoUrl(tokenId) || undefined)}
      duration={duration}
      tokenId={tokenId}
      isContentGated={isActuallyGated}
      isPPVLocked={isActuallyLockedPPV}
      isHoldingsLocked={isActuallyLockedHoldings}
      isBountyLocked={false}
      isComboLocked={isActuallyComboLocked}
      isBounty={isBounty}
      ppvAmount={payPerViewAmount}
      ppvCurrency={payPerViewTokenSymbol}
      lockAmount={lockContentAmount}
      lockCurrency={lockContentTokenSymbol}
      bountyAmount={bountyAmount}
      bountyCurrency={bountyTokenSymbol}
      isVisible={isVisible}
      isSignedIn={isSignedIn}
      onPress={handleCardPress}
      onPPVPress={handlePPVPress}
      onLockPress={handleCardPress}
      onBountyPress={handleBountyBadgePress}
    />
  );

  const renderLiveThumbnail = () => (
    <Pressable onPress={handleCardPress} className="relative w-full h-48 bg-zinc-800 rounded-xl overflow-hidden mt-2">
      {hasThumb ? (
        <Image
          source={{ uri: thumbnail }}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      ) : (
        <View className="absolute inset-0 w-full h-full bg-zinc-800 items-center justify-center">
          <Icon name="VideoOff" size={40} color="#666" />
        </View>
      )}
      {status && <StatusBadge status={status} />}
      {isHidden && (
        <View className="absolute top-2 right-2 flex-row items-center bg-black/60 rounded-full px-2 py-1 z-20">
          <Icon name="EyeOff" size={12} color="#6F7174" />
          <Text style={{ color: "#8B8D90", fontSize: 10, marginLeft: 4 }}>Hidden</Text>
        </View>
      )}
      {isBounty && (
        <View
          className="absolute z-10 bg-pink-600"
          style={{
            left: -64,
            top: 48,
            width: 240,
            transform: [{ rotate: "-45deg" }],
            paddingVertical: 2,
          }}
        >
          <Text className="text-white text-[10px] font-bold text-center">
            Watch2Earn: {formatCompactNumber(bountyAmount)} {bountyTokenSymbol}
          </Text>
        </View>
      )}
      {isPayPerView && (
        <View
          className="absolute z-10 bg-blue-600"
          style={{
            right: -80,
            top: 32,
            width: 240,
            transform: [{ rotate: "45deg" }],
            paddingVertical: 2,
          }}
        >
          <Text className="text-white text-[10px] font-bold text-center">
            PPV: {payPerViewAmount} {payPerViewTokenSymbol}
          </Text>
        </View>
      )}
      {isLocked && (
        <View
          className="absolute z-10 bg-violet-600"
          style={{
            right: -80,
            bottom: 32,
            width: 240,
            transform: [{ rotate: "-45deg" }],
            paddingVertical: 2,
          }}
        >
          <Text className="text-white text-[10px] font-bold text-center">
            Lock: {lockContentAmount} {lockContentTokenSymbol}
          </Text>
        </View>
      )}
    </Pressable>
  );

  const renderContent = () => {
    switch (contentType) {
      case "live":
        return renderLiveThumbnail();
      case "short":
        return (
          <View className="relative">
            <FeedVideoPlayer
              thumbnail={thumbnail}
              videoUrl={isActuallyGated ? undefined : (getVideoUrl(tokenId) || undefined)}
              duration={duration}
              tokenId={tokenId}
              isContentGated={isActuallyGated}
              isPPVLocked={isActuallyLockedPPV}
              isHoldingsLocked={isActuallyLockedHoldings}
              isBountyLocked={false}
              isComboLocked={isActuallyComboLocked}
              isBounty={isBounty}
              ppvAmount={payPerViewAmount}
              ppvCurrency={payPerViewTokenSymbol}
              lockAmount={lockContentAmount}
              lockCurrency={lockContentTokenSymbol}
              bountyAmount={bountyAmount}
              bountyCurrency={bountyTokenSymbol}
              isVisible={isVisible}
              isSignedIn={isSignedIn}
              onPress={handleCardPress}
              onPPVPress={handlePPVPress}
              onLockPress={handleCardPress}
              onBountyPress={handleBountyBadgePress}
              hideControls
            />
            <View className="absolute top-3 left-3 bg-black/60 rounded p-1.5 z-20">
              <Icon name="Film" size={14} color="#fff" />
            </View>
          </View>
        );
      case "video":
        return renderVideoThumbnail();
      case "audio":
        return (
          <>
            {renderImageContent()}
            {tokenId != null && (
              <AudioPostPlayer
                audioUrl={getAudioUrl(item.audioUrl!)}
                duration={item.audioDuration || 0}
                tokenId={tokenId}
                listens={item.listens}
                isVisible={isVisible}
                isSignedIn={isSignedIn}
              />
            )}
          </>
        );
      case "image":
      default:
        return renderImageContent();
    }
  };

  const showActionBar = contentType !== "live";

  return (
    <Pressable
      onPress={disablePress ? undefined : handleCardPress}
      disabled={disablePress}
      style={{ borderWidth: 1, borderColor: '#1D1F21', borderRadius: 16, padding: 12, marginVertical: 4 }}
    >
      {showRepostLabel && (
        <View className="flex-row items-center gap-1.5 mb-2">
          <Icon name="Repeat2" size={14} color="#9CA3AF" />
          <Text className="text-xs text-theme-neutrals-400">Reposted</Text>
        </View>
      )}
      <View className="flex-row items-start">
        <View className="flex-1">
          <FeedCardHeader
            avatarUrl={avatar}
            displayName={displayName}
            username={username}
            badgeImage={badgeImg}
            onUserPress={handleUserPress}
            onMenuPress={handleOpenOptions}
            onAiPress={handleAiPress}
            isHidden={isHidden}
          />
        </View>
      </View>

      {renderContent()}

      {hasSoundtrack && (
        <View className="mt-2">
          <SoundtrackBadge
            title={soundtrack.title}
            creator={soundtrack.creator}
            url={soundtrack.url}
          />
        </View>
      )}

      <FeedCaption
        title={(isTranslated ? translatedTexts.title : localTitle) || undefined}
        description={(isTranslated ? translatedTexts.description : localDescription) || undefined}
        categories={localCategories}
        onCategoryPress={onCategorySelect}
        fullContent={fullContent}
        showCategories={fullContent}
      />

      {(item as any).isQuotePost && (
        <QuotedPostEmbed
          quotedPost={(item as any).quotedPost}
          quotedTokenId={(item as any).quotedTokenId}
        />
      )}

      {tokenId != null && (
        <PollCard tokenId={Number(tokenId)} pollOwnerAddress={minterAddress} />
      )}

      <View className="flex-row items-center gap-2 pt-1.5">
        <Text style={{ fontSize: 11, color: "#8B8D90" }}>
          {formatShortTimeAgo(createdAt)}
        </Text>
        <Text style={{ fontSize: 11, color: "#6F7174" }}>·</Text>
        <View className="flex-row items-center gap-1">
          <Icon
            name={isAudioPost ? "Headphones" : isLive ? "Radio" : "Eye"}
            size={13}
            color="#6F7174"
          />
          <Text style={{ fontSize: 11, color: "#8B8D90" }}>
            {isAudioPost
              ? (item.listens || 0)
              : isLive
                ? formatCompactNumber(currentViewers)
                : views}
          </Text>
        </View>
        {isLive && liveViewCount > 0 && (
          <>
            <Text style={{ fontSize: 11, color: "#6F7174" }}>·</Text>
            <Text style={{ fontSize: 11, color: "#6F7174" }}>
              Peak: {formatCompactNumber(liveViewCount)}
            </Text>
          </>
        )}
        {showTranslate && (
          <>
            <Text style={{ fontSize: 11, color: "#6F7174" }}>·</Text>
            <TranslateButton
              isTranslated={isTranslated}
              isLoading={translating}
              detectedLanguage={item.detectedLanguage}
              onTranslate={handleTranslate}
              onShowOriginal={handleShowOriginal}
              inline
            />
          </>
        )}
      </View>

      {showActionBar && (
        <FeedActionBar
          liked={liked}
          disliked={disliked}
          saved={saved}
          reposted={reposted}
          likeCount={likeCount}
          dislikeCount={dislikeCount}
          commentCount={commentCount}
          repostCount={repostCount}
          tipCount={totalTips}
          onLike={handleLikePress}
          onDislike={handleDislikePress}
          onComment={handleCommentPress}
          onRepost={handleRepostPress}
          onTip={handleTipPress}
          onSave={handleSavePress}
          onInfo={handleInfoPress}
          showRepostPopover={showRepostPopover}
          onCloseRepostPopover={() => setShowRepostPopover(false)}
          onConfirmRepost={handleConfirmRepost}
          onUndoRepost={handleUndoRepost}
          onQuote={handleQuotePress}
        />
      )}

      {isLive && (
        <View className="flex-row items-center pt-2">
          <View className="flex-row items-center gap-1">
            <Icon name="Heart" size={16} color="#ef4444" />
            <Text style={{ color: "#F9FBFF", fontSize: 13 }}>{formatCompactNumber(liveLikes)}</Text>
          </View>
        </View>
      )}

      {tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
        />
      )}

      {minterAddress ? (
        <GlassTipSheet
          visible={showTipModal}
          onClose={() => setShowTipModal(false)}
          toAddress={minterAddress}
          tokenId={Number(tokenId) || 0}
          recipientName={displayName}
          tipContext="content"
        />
      ) : null}

      {isPayPerView && tokenId != null && minterAddress ? (
        <PPVSheet
          visible={showPPVModal}
          onClose={() => setShowPPVModal(false)}
          tokenId={tokenId}
          toAddress={minterAddress}
          amount={payPerViewAmount}
          tokenSymbol={payPerViewTokenSymbol}
          contentType={isVideo ? "video" : "image"}
          onSuccess={handlePPVSuccess}
        />
      ) : null}

      {isBounty && tokenId != null && (
        <BountyInfoSheet
          visible={showBountyModal}
          onClose={() => setShowBountyModal(false)}
          tokenId={tokenId}
          minter={minterAddress}
          bountyAmount={bountyAmount}
          bountyTokenSymbol={bountyTokenSymbol}
          firstXViewers={streamInfo?.addBountyFirstXViewers || 0}
          firstXComments={streamInfo?.addBountyFirstXComments || 0}
        />
      )}

      {tokenId != null && (
        <AskAISheet
          visible={showAISheet}
          onClose={() => setShowAISheet(false)}
          postId={tokenId}
          postContext={aiPostContext}
        />
      )}

      <PostOptionsMenu
        visible={showOptionsMenu}
        onClose={() => setShowOptionsMenu(false)}
        tokenId={tokenId}
        isOwner={!!isOwnerPost}
        isHidden={isHidden}
        creatorDisplayName={displayName}
        creatorIdentifier={minterAddress || username || ""}
        isFollowing={isFollowingCreator}
        isFollowRequestPending={isFollowReqPending}
        currentTitle={localTitle}
        currentDescription={localDescription}
        currentCategories={localCategories}
        hideReportContent={isLive}
        hideEdit={isLive}
        onFollowChange={handleFollowChange}
        onVisibilityChange={handleVisibilityChange}
        onEditSuccess={handleEditSuccess}
        onDeleteSuccess={handleDeleteSuccess}
        onTranslatePress={handleTranslate}
        onTranslateImagePress={hasImages ? handleTranslateImage : undefined}
      />

      <ImageTranslationSheet
        visible={showImgTranslationSheet}
        onClose={() => { setShowImgTranslationSheet(false); clearImgResult(); }}
        isLoading={imgTranslating}
        error={imgTranslateError}
        result={imgTranslateResult}
      />
    </Pressable>
  );
};

const FeedCard = memo(FeedCardComponent);

export default FeedCard;
