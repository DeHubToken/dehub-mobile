import React, { memo, useCallback, useRef, useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Pressable,
  type LayoutChangeEvent,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  runOnJS,
} from "react-native-reanimated";
import { ScrollView as RNScrollView } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useNavigation } from "@react-navigation/native";
import { FeedCardHeader } from "./FeedCardHeader";
import FeedActionBar from "./FeedActionBar";
import { FeedCaption } from "./FeedCaption";
import AudioPostPlayer from "./AudioPostPlayer";
import FeedVideoPlayer from "./FeedVideoPlayer";
import StatusBadge from "./StatusBadge";
import { CommentBottomSheet } from "../Comments";
import ReactionInfoSheet from "./ReactionInfoSheet";
import PostOptionsMenu from "../common/PostOptionsMenu";
import ImageTranslationSheet from "../common/ImageTranslationSheet";
import QuotedPostEmbed from "../common/QuotedPostEmbed";
import SmartImage from "../common/SmartImage";
import { cdnImage } from "../../libs/cdnImage";
import GlassTipSheet from "../Tip/GlassTipSheet";
import PPVSheet from "../PPV/PPVSheet";
import BountyInfoSheet from "./BountyInfoSheet";
import AskAISheet from "./AskAISheet";
import AddToFolderSheet from "./AddToFolderSheet";
import ShareToDmSheet from "../DM/ShareToDmSheet";
import ShareSheet from "./ShareSheet";
import CashtagSheet from "./CashtagSheet";
import Icon from "../ui/Icon";
import TranslateButton from "../ui/TranslateButton";
import SoundtrackBadge from "../Post/SoundtrackBadge";
import { useSyncedAudio } from "../../hooks/useSyncedAudio";
import { parseSoundtrack } from "../../libs/parseSoundtrack";
import { useTranslation } from "../../hooks/useTranslation";
import { useImageTranslation } from "../../hooks/useImageTranslation";
import { resolveViewCount } from "../../libs/numbers.util";
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
  toastError,
  toastSuccess,
} from "../../libs";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { sharePostAsImage } from "../../libs/shareImage";
import {
  applyEngagement,
  revertEngagement,
  engagementKeyOf,
  isFailedResponse,
  useEngagement,
} from "../../libs/engagementCache";
import { secondsToHMMSS } from "../../libs/date.util";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { voteOnNFT, reactToNFT, getPpvSalesCount } from "../../services/nft.service";
import {
  applyReactionDelta,
  isPositiveReaction,
  type PostReaction,
} from "../../libs/reactions";
import { savePost } from "../../services/feed.service";
import { toggleRepost } from "../../services/repost.service";
import { WEBSITE_LINK } from "../../config";
import { getTransactionLink, openInApp } from "../../libs/links.utils";
import env from "../../config/env";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import type { AIPostContext } from "../../services/ai.service";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Pre-measurement fallback only. The gallery measures its own box on layout
// (handleGalleryLayout) because the true content width is the screen minus the
// feed list's padding (8/side) *and* the card's own (12/side) — a hardcoded
// guess drifted 8px per page here before, which desynced paging from the dots.
const IMAGE_WIDTH = SCREEN_WIDTH - 40;

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
  // Signed-out viewers are already folded into totalViews by the API — see
  // resolveViewCount. peakViewers/stream.totalViews stay for live posts, which
  // report an audience rather than a view count.
  const views = resolveViewCount(item) || (item as any).peakViewers || stream?.totalViews || 0;
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
  // Every branch is sized to IMAGE_WIDTH — the card's real content width, which
  // is also what the thumbnail renders into. This is a poster frame behind a
  // play button, never something the user zooms into, so it does not need the
  // original: the fullscreen player fetches the video itself.
  const thumbnail = useMemo(() => {
    if (isLive) {
      const thumb = stream?.thumbnail;
      if (thumb) {
        const abs = thumb.startsWith("http") ? thumb : `${env.CDN_BASE_URL}/${thumb}`;
        return cdnImage(abs, { width: IMAGE_WIDTH });
      }
      const itemThumb = item.imageUrl || item.thumbnailUrl;
      if (itemThumb) {
        const abs = itemThumb.startsWith("http")
          ? itemThumb
          : `${env.CDN_BASE_URL}/${itemThumb}`;
        return cdnImage(abs, { width: IMAGE_WIDTH });
      }
      return resolveThumbnail(item as any, IMAGE_WIDTH);
    }
    if (isVideo) {
      if (isShort) {
        return getShortsThumbnailUrl(tokenId, IMAGE_WIDTH) || "";
      }
      const rawThumb =
        (item as any).thumbnail ||
        stream?.thumbnail ||
        item.thumbnailUrl ||
        item.imageUrl ||
        "";
      return getImageUrl(rawThumb, IMAGE_WIDTH);
    }
    return "";
  }, [item, stream, isLive, isVideo, isShort, tokenId]);

  const hasThumb = typeof thumbnail === "string" && thumbnail.trim().length > 0;
  const duration = (item as any).videoDuration ? secondsToHMMSS((item as any).videoDuration) : undefined;

  // --- Monetization badges ---
  const isPayPerView = streamInfo?.isPayPerView;
  const payPerViewAmount = streamInfo?.payPerViewAmount || 0;
  const payPerViewTokenSymbol = streamInfo?.payPerViewTokenSymbol || "DHB";
  // PPV payment chain — Solana posts pay in SOL/SPL (#41)
  const payPerViewChainId = Array.isArray(streamInfo?.payPerViewChainIds)
    ? streamInfo?.payPerViewChainIds[0]
    : streamInfo?.payPerViewChainIds;

  // PPV sales count — fetch once for owner's own PPV posts
  const [ppvSalesCount, setPpvSalesCount] = useState<number | null>(null);
  useEffect(() => {
    if (!isOwnerPost || !isPayPerView || !tokenId) return;
    getPpvSalesCount(tokenId).then(r => setPpvSalesCount(r.salesCount)).catch(() => {});
  }, [isOwnerPost, isPayPerView, tokenId]);
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
  const engagementKey = engagementKeyOf(item);
  // Read straight from the shared overlay instead of local useState. This is
  // what makes a like survive the row being recycled or the screen being left
  // and re-entered, and what keeps the six feed lists HomeScreen mounts over
  // the same posts in agreement without a refetch. Writes go through
  // applyEngagement in the handlers below, which re-renders every mounted card
  // for that post. See libs/engagementCache.ts.
  const {
    isLiked: liked,
    isDisliked: disliked,
    isSaved: saved,
    isReposted: reposted,
    likeCount,
    dislikeCount,
    repostCount,
    myReaction,
    reactionCounts,
  } = useEngagement(item);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReactionInfo, setShowReactionInfo] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showPPVModal, setShowPPVModal] = useState(false);
  const [showBountyModal, setShowBountyModal] = useState(false);
  const [showAISheet, setShowAISheet] = useState(false);
  const [showAddToFolder, setShowAddToFolder] = useState(false);
  const [showShareToDm, setShowShareToDm] = useState(false);
  const [activeCashtag, setActiveCashtag] = useState<string | null>(null);
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
  const [localCommentsDisabled, setLocalCommentsDisabled] = useState<boolean>(!!(item as any).commentsDisabled);
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
    // Dismiss the profile sheet first, otherwise the viewer opens behind it.
    onBeforeNavigate?.();
    hideUserProfile();
    navigation.navigate(ScreenNames.ImageViewer, {
      images: galleryImages,
      initialIndex: index,
    });
  }, [navigation, galleryImages, hasImages, hideUserProfile, onBeforeNavigate]);

  const handleTranslateImage = useCallback(() => {
    const imageUrl = galleryImages[0];
    if (!imageUrl) return;
    setShowImgTranslationSheet(true);
    translateImage(imageUrl);
  }, [galleryImages, translateImage]);

  /**
   * Cast, switch or toggle off a reaction.
   *
   * Sending the reaction the viewer already holds is what REMOVES it — the
   * server reads a repeat the same way, so the optimistic overlay and the
   * eventual refetch agree without the client modelling a separate "unreact".
   *
   * likeCount/dislikeCount track POLARITY, not the individual reaction, so
   * swapping like → love leaves both counts alone and only moves
   * reactionCounts. Getting that wrong would make a post's like count jump
   * every time somebody changed their mind.
   */
  const handleReaction = useCallback((reaction: PostReaction) => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      const wasLiked = liked;
      const wasDisliked = disliked;
      const wasLikeCount = likeCount;
      const wasDislikeCount = dislikeCount;
      const wasReaction = myReaction;
      const wasCounts = reactionCounts;

      const isRemoving = wasReaction === reaction;
      const next: PostReaction | null = isRemoving ? null : reaction;

      const wasPositive = wasReaction ? isPositiveReaction(wasReaction) : false;
      const wasNegative = wasReaction ? !wasPositive : false;
      const nextPositive = next ? isPositiveReaction(next) : false;
      const nextNegative = next ? !nextPositive : false;

      let nextLikeCount = wasLikeCount;
      let nextDislikeCount = wasDislikeCount;
      if (wasPositive && !nextPositive) nextLikeCount = Math.max(0, nextLikeCount - 1);
      if (!wasPositive && nextPositive) nextLikeCount += 1;
      if (wasNegative && !nextNegative) nextDislikeCount = Math.max(0, nextDislikeCount - 1);
      if (!wasNegative && nextNegative) nextDislikeCount += 1;

      // Publish to the shared overlay; the sync effect above pushes it into
      // this card and every other mounted card for the same post.
      applyEngagement(engagementKey, {
        isLiked: nextPositive,
        isDisliked: nextNegative,
        myReaction: next,
        likeCount: nextLikeCount,
        dislikeCount: nextDislikeCount,
        reactionCounts: applyReactionDelta(wasCounts, wasReaction, next),
      });

      const rollback = () => {
        // Restore only the fields this handler owns, so a concurrent save or
        // repost that succeeded is not undone.
        revertEngagement(engagementKey, {
          isLiked: wasLiked,
          isDisliked: wasDisliked,
          myReaction: wasReaction,
          likeCount: wasLikeCount,
          dislikeCount: wasDislikeCount,
          reactionCounts: wasCounts,
        });
        toastError("Failed to update reaction");
      };

      // Plain like/dislike keeps using the long-lived vote endpoint; anything
      // else needs the reaction one. Same row either way on the server.
      const request =
        reaction === "like" || reaction === "dislike"
          ? voteOnNFT({ streamTokenId: tokenId, vote: reaction === "like", account: userAddress })
          : reactToNFT({ streamTokenId: tokenId, reaction });

      request
        // A 200 carrying `{ error }` resolves rather than throwing
        // (libs/api.client.ts only throws on !response.ok), so `.catch` alone
        // would record a failed vote as successful and then share it.
        .then((res) => {
          if (isFailedResponse(res)) rollback();
        })
        .catch(rollback);
    });
  }, [tokenId, liked, disliked, likeCount, dislikeCount, myReaction, reactionCounts, engagementKey, userAddress, requireAuth]);

  /**
   * Tapping a thumb re-sends whatever reaction of that polarity the viewer
   * already holds, which the server reads as "toggle it off" — so tapping the
   * thumb clears a 🔥 the same way it clears a 👍, instead of silently
   * downgrading it to a plain like.
   */
  const togglePolarity = useCallback((positive: boolean) => {
    const holdsSamePolarity = myReaction !== null && isPositiveReaction(myReaction) === positive;
    handleReaction(holdsSamePolarity ? myReaction! : (positive ? "like" : "dislike"));
  }, [handleReaction, myReaction]);

  const handleLikePress = useCallback(() => togglePolarity(true), [togglePolarity]);
  const handleDislikePress = useCallback(() => togglePolarity(false), [togglePolarity]);

  const handleSavePress = useCallback(() => {
    requireAuth?.(() => {
      const wasSaved = saved;
      const willBeSaved = !wasSaved;
      applyEngagement(engagementKey, { isSaved: willBeSaved });
      if (tokenId != null) {
        const rollback = () => {
          revertEngagement(engagementKey, { isSaved: wasSaved });
          toastError("Failed to save");
        };
        savePost(Number(tokenId), userAddress)
          .then((res) => {
            if (isFailedResponse(res)) {
              rollback();
              return;
            }
            if (willBeSaved) {
              setShowAddToFolder(true);
            }
          })
          .catch(rollback);
      }
    });
  }, [tokenId, userAddress, saved, engagementKey, requireAuth]);

  const handleSharePress = useCallback(() => {
    if (tokenId == null) return;
    const url = `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
    sharePostAsImage(Number(tokenId), url, localTitle || undefined).catch(() => {});
  }, [tokenId, localTitle]);

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

  // Open the Share sheet. Ungated so logged-out users can still copy the link /
  // share as image; repost & quote gate themselves via requireAuth.
  const handleOpenShare = useCallback(() => {
    if (tokenId == null) return;
    setShowShareSheet(true);
  }, [tokenId]);

  const handleCopyLink = useCallback(() => {
    if (tokenId == null) return;
    copyToClipboard(`${WEBSITE_LINK || ""}/app/post/${tokenId}`);
    toastSuccess("Post link copied to clipboard");
  }, [tokenId]);

  const handleUndoRepost = useCallback(() => {
    if (tokenId == null) return;
    const wasReposted = reposted;
    const prevCount = repostCount;
    applyEngagement(engagementKey, {
      isReposted: false,
      repostCount: Math.max(0, prevCount - 1),
    });
    const rollback = () => {
      revertEngagement(engagementKey, {
        isReposted: wasReposted,
        repostCount: prevCount,
      });
      toastError("Failed to remove repost");
    };
    toggleRepost(Number(tokenId))
      .then((res) => {
        if (isFailedResponse(res)) {
          rollback();
          return;
        }
        // Reconcile against the server's own flag. Its `repostCount` is NOT
        // used: this card displays reposts + quotes and it is unconfirmed
        // whether the server's figure includes quotes, so adopting it could
        // shift the number by the quote count.
        if (typeof res?.reposted === "boolean" && res.reposted !== false) {
          applyEngagement(engagementKey, { isReposted: true, repostCount: prevCount });
        }
      })
      .catch(rollback);
  }, [tokenId, reposted, repostCount, engagementKey]);

  const handleConfirmRepost = useCallback(() => {
    if (tokenId == null) return;
    requireAuth?.(() => {
      const wasReposted = reposted;
      const prevCount = repostCount;
      applyEngagement(engagementKey, {
        isReposted: true,
        repostCount: prevCount + 1,
      });
      const rollback = () => {
        revertEngagement(engagementKey, {
          isReposted: wasReposted,
          repostCount: prevCount,
        });
        toastError("Failed to repost");
      };
      toggleRepost(Number(tokenId))
        .then((res) => {
          if (isFailedResponse(res)) {
            rollback();
            return;
          }
          // Server flag wins. If it reports not-reposted the toggle did not
          // apply, so fall back to the pre-tap count (see note in
          // handleUndoRepost about not adopting res.repostCount).
          if (typeof res?.reposted === "boolean" && res.reposted === false) {
            applyEngagement(engagementKey, { isReposted: false, repostCount: prevCount });
          }
        })
        .catch(rollback);
    });
  }, [tokenId, reposted, repostCount, engagementKey, requireAuth]);

  const handleQuotePress = useCallback(() => {
    requireAuth?.(() => {
      hideUserProfile();
      navigation.navigate(ScreenNames.Upload, {
        quotedTokenId: tokenId,
        quotedPost: item as any,
      });
    });
  }, [navigation, tokenId, item, hideUserProfile, requireAuth]);

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

  const handleEditSuccess = useCallback((data: { name?: string; description?: string; category?: string[]; commentsDisabled?: boolean }) => {
    if (data.name !== undefined) setLocalTitle(data.name);
    if (data.description !== undefined) setLocalDescription(data.description);
    if (data.category !== undefined) setLocalCategories(data.category);
    // Without this the composer stays live until the feed refetches, so the
    // creator would still see an input on a post they just closed.
    if (data.commentsDisabled !== undefined) setLocalCommentsDisabled(data.commentsDisabled);
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    setIsDeleted(true);
  }, []);

  // Image carousel scroll handler
  const updateIndex = useCallback((index: number) => {
    // onScroll fires per frame; only cross the worklet→JS bridge when the page
    // actually changes, instead of ~60 setState calls a second while dragging.
    setActiveImageIndex((prev) => (prev === index ? prev : index));
  }, []);

  // Measured width of the gallery's own box. Both the item width and the index
  // maths read this, so paging and the dots can never disagree — which is what
  // broke when the item width was a hardcoded guess wider than the viewport.
  const [itemWidth, setItemWidth] = useState(IMAGE_WIDTH);
  const itemWidthSV = useSharedValue(IMAGE_WIDTH);

  const handleGalleryLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w > 0 && w !== itemWidthSV.value) {
        itemWidthSV.value = w;
        setItemWidth(w);
      }
    },
    [itemWidthSV],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      const width = itemWidthSV.value || IMAGE_WIDTH;
      runOnJS(updateIndex)(Math.round(event.contentOffset.x / width));
    },
  });

  // Non-null only when this card sits inside a horizontal pager (Home). Lets the
  // multi-image gallery below keep its own swipes — see renderImageContent.
  const scrollGuard = useHorizontalScrollGuard();

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
          <SmartImage
            source={{ uri: galleryImages[0] }}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={galleryImages[0]}
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
              <View className="w-14 h-14 rounded-xl bg-black/40 border border-white/10 items-center justify-center">
                <Icon name="Ticket" size={24} color="#fff" />
              </View>
              <View className="w-14 h-14 rounded-xl bg-black/40 border border-white/10 items-center justify-center">
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
          <SmartImage
            source={{ uri: galleryImages[0] }}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={galleryImages[0]}
            blurRadius={20}
          />
          <View className="absolute inset-0 bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row items-center gap-1 bg-black/60 rounded-full px-2.5 py-1">
              <Icon name="Ticket" size={12} color="#fff" />
              <Text className="text-white text-xs font-medium">
                {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
              </Text>
            </View>
            <View className="w-16 h-16 rounded-xl bg-black/40 border border-white/10 items-center justify-center mb-3">
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
          <SmartImage
            source={{ uri: galleryImages[0] }}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={galleryImages[0]}
            blurRadius={20}
          />
          <View className="absolute inset-0 bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row items-center gap-1 bg-black/60 rounded-full px-2.5 py-1">
              <Icon name="Lock" size={12} color="#fff" />
              <Text className="text-white text-xs font-medium">
                {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
              </Text>
            </View>
            <View className="w-16 h-16 rounded-xl bg-black/40 border border-white/10 items-center justify-center mb-3">
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
          <SmartImage
            source={{ uri: galleryImages[0] }}
            className="w-full rounded-xl"
            style={{ height: IMAGE_WIDTH * 0.75 }}
            recyclingKey={galleryImages[0]}
          />
        </Pressable>
      );
    }
    const gallery = (
      <ReanimatedScrollView
        horizontal
        // Deliberately NOT pagingEnabled: that snaps to multiples of the scroll
        // view's own width, while the items are sized to `itemWidth`. When the
        // two disagree every page compounds the error. snapToInterval pages off
        // the item width itself, so they cannot drift apart.
        showsHorizontalScrollIndicator={false}
        onLayout={handleGalleryLayout}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={itemWidth}
        // A hard fling should advance one image, not skip several.
        disableIntervalMomentum
        snapToAlignment="start"
      >
        {galleryImages.map((uri, index) => (
          <Pressable key={index} onPress={() => handleImagePress(index)} style={{ width: itemWidth }}>
            <SmartImage
              source={{ uri }}
              className="rounded-xl"
              style={{ width: itemWidth, height: itemWidth }}
              recyclingKey={uri}
            />
          </Pressable>
        ))}
      </ReanimatedScrollView>
    );

    return (
      <View className="mt-2">
        {/* Inside Home's swipe pager, paging through this gallery has to win
            over the page turn — without the guard the pager's pan clears its
            threshold first and cancels the gallery scroll mid-drag. Elsewhere
            (profile, search) the hook returns null and this renders bare. */}
        {scrollGuard ? <GestureDetector gesture={scrollGuard}>{gallery}</GestureDetector> : gallery}
        {/* pointerEvents="none" on both overlays is load-bearing, not tidiness.
            They are siblings drawn ABOVE the guarded scroller, and both paint a
            background. RNGH's orchestrator walks children in reverse drawing
            order and stops at the first subtree that claims the pointer
            (extractGestureHandlers -> shouldHandlerlessViewBecomeTouchTarget),
            so a drag starting on the pill or a dot never reaches the
            ScrollView's native handler — while the pager's pan, being an
            ancestor, still gets recorded. The guard then has nothing to block
            and the page turns. The dot row spans the full width at the bottom
            of the image, i.e. exactly where a thumb swipes, which is why this
            read as "swiping the pictures changes to video mode".
            Off the pager (post detail, profile) the same theft just made the
            drag do nothing. Neither overlay is interactive, so ignoring touches
            costs nothing and lets taps fall through to open the viewer. */}
        <View
          pointerEvents="none"
          className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-1"
        >
          <Text className="text-white text-xs font-medium">
            {activeImageIndex + 1}/{galleryImages.length}
          </Text>
        </View>
        <View
          pointerEvents="none"
          className="absolute bottom-3 left-0 right-0 flex-row justify-center items-center gap-1.5"
        >
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
        <SmartImage
          source={{ uri: thumbnail }}
          className="absolute inset-0 w-full h-full"
          recyclingKey={thumbnail}
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
            {isOwnerPost && ppvSalesCount != null ? `  ·  ${ppvSalesCount} sold` : ""}
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
      // Shorts render identically to normal videos in the feed — same player
      // with full controls, no special "short" badge — to match the web app.
      case "short":
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
      // Matches the web feed tile (dehubweb HomeFeed.tsx:1066 + index.css:1264):
      // translucent white fill and hairline rather than an opaque grey outline,
      // 6pt vertical margin = 12pt inter-card gap (web `space-y-3`, was 8pt),
      // and 24pt bottom padding (web overrides the uniform p-3 to pb-6).
      style={{
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        paddingTop: 12,
        paddingHorizontal: 12,
        paddingBottom: 24,
        marginVertical: 6,
      }}
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
        onCashtagPress={(sym) => setActiveCashtag(sym)}
        fullContent={fullContent}
        showCategories={fullContent}
      />

      {(item as any).isQuotePost && (
        <QuotedPostEmbed
          quotedPost={(item as any).quotedPost}
          quotedTokenId={(item as any).quotedTokenId}
        />
      )}

      {tokenId != null && !isLive && !(item as any).isQuotePost && (
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
          onReact={handleReaction}
          myReaction={myReaction}
          reactionCounts={reactionCounts}
          onComment={handleCommentPress}
          onShare={handleOpenShare}
          onTip={handleTipPress}
          onSave={handleSavePress}
          onInfo={handleInfoPress}
          onShowReactionInfo={
            isOwnerPost && tokenId != null ? () => setShowReactionInfo(true) : undefined
          }
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

      {showComments && tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
          commentsDisabled={localCommentsDisabled}
        />
      )}

      {showReactionInfo && tokenId != null && (
        <ReactionInfoSheet
          visible={showReactionInfo}
          onClose={() => setShowReactionInfo(false)}
          tokenId={tokenId}
        />
      )}

      {showTipModal && minterAddress ? (
        <GlassTipSheet
          visible={showTipModal}
          onClose={() => setShowTipModal(false)}
          toAddress={minterAddress}
          tokenId={Number(tokenId) || 0}
          recipientName={displayName}
          tipContext="content"
          paymentChainId={chainId}
        />
      ) : null}

      {showPPVModal && isPayPerView && tokenId != null && minterAddress ? (
        <PPVSheet
          visible={showPPVModal}
          onClose={() => setShowPPVModal(false)}
          tokenId={tokenId}
          toAddress={minterAddress}
          amount={payPerViewAmount}
          tokenSymbol={payPerViewTokenSymbol}
          contentType={isVideo ? "video" : "image"}
          paymentChainId={payPerViewChainId}
          onSuccess={handlePPVSuccess}
        />
      ) : null}

      {showBountyModal && isBounty && tokenId != null && (
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

      {showAISheet && tokenId != null && (
        <AskAISheet
          visible={showAISheet}
          onClose={() => setShowAISheet(false)}
          postId={tokenId}
          postContext={aiPostContext}
        />
      )}

      {showAddToFolder && tokenId != null && (
        <AddToFolderSheet
          visible={showAddToFolder}
          onClose={() => setShowAddToFolder(false)}
          tokenId={tokenId}
        />
      )}

      {showOptionsMenu && (
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
          currentCommentsDisabled={localCommentsDisabled}
          hideReportContent={isLive}
          hideEdit={isLive}
          onFollowChange={handleFollowChange}
          onVisibilityChange={handleVisibilityChange}
          onEditSuccess={handleEditSuccess}
          onDeleteSuccess={handleDeleteSuccess}
          onSendToDm={isSignedIn ? () => setShowShareToDm(true) : undefined}
          onTranslatePress={handleTranslate}
          onTranslateImagePress={hasImages ? handleTranslateImage : undefined}
        />
      )}

      {showShareToDm && tokenId != null && (
        <ShareToDmSheet
          visible={showShareToDm}
          onClose={() => setShowShareToDm(false)}
          tokenId={tokenId}
          postTitle={localTitle || undefined}
        />
      )}

      {showShareSheet && tokenId != null && (
        <ShareSheet
          visible={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          isReposted={reposted}
          onRepost={handleConfirmRepost}
          onUndoRepost={handleUndoRepost}
          onQuote={handleQuotePress}
          onCopyLink={handleCopyLink}
          onSendToDm={isSignedIn ? () => setShowShareToDm(true) : undefined}
          onShareAsImage={handleSharePress}
        />
      )}

      {!!activeCashtag && (
        <CashtagSheet
          visible={!!activeCashtag}
          symbol={activeCashtag || ""}
          onClose={() => setActiveCashtag(null)}
        />
      )}

      {showImgTranslationSheet && (
        <ImageTranslationSheet
          visible={showImgTranslationSheet}
          onClose={() => { setShowImgTranslationSheet(false); clearImgResult(); }}
          isLoading={imgTranslating}
          error={imgTranslateError}
          result={imgTranslateResult}
        />
      )}
    </Pressable>
  );
};

const FeedCard = memo(FeedCardComponent);

export default FeedCard;
