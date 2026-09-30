import { isStreamLive } from '../../libs/live-status';
import { isHoldGated } from "../../libs/content-gate";
import React, { memo, useCallback, useRef, useState, useMemo, useEffect } from "react";
import {
  View,
  DeviceEventEmitter,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Pressable,
  StyleSheet,
  Image,
  type LayoutChangeEvent,
} from "react-native";
import { GRAIN } from "../../theme/skins";
import { GestureDetector } from "react-native-gesture-handler";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useNavigation } from "@react-navigation/native";
import { FeedCardHeader } from "./FeedCardHeader";
import FeedActionBar from "./FeedActionBar";
import ShopBoard from "../common/ShopBoard";
import type { ShopLink } from "../../services/nft.service";
import { FeedCaption } from "./FeedCaption";
import MatureContentGate, { useMatureGate } from "./MatureContentGate";
import AudioPostPlayer from "./AudioPostPlayer";
import FeedVideoPlayer from "./FeedVideoPlayer";
import StatusBadge from "./StatusBadge";
import { CommentBottomSheet } from "../Comments";
import { warmCommentThread } from "../Comments/CommentSection";
import { useQueryClient } from "@tanstack/react-query";
import { seedPostDetail, warmRequest } from "../../libs/navPrefetch";
import ReactionInfoSheet from "./ReactionInfoSheet";
import PostOptionsMenu from "../common/PostOptionsMenu";
import ImageTranslationSheet from "../common/ImageTranslationSheet";
import QuotedPostEmbed from "../common/QuotedPostEmbed";
import { DehubLinkCards, MAX_CARDS_PER_MESSAGE } from "../common/DehubLinkCard";
import LinkPreviewCard from "../common/LinkPreviewCard";
import { findDehubLinks, stripDehubLinkMatches } from "../../libs/dehub-links";
import { AssetRefCards, MAX_ASSET_CARDS_PER_MESSAGE } from "../common/AssetRefCard";
import { findAssetRefs, stripAssetRefs } from "../../libs/asset-refs";
import SmartImage from "../common/SmartImage";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/colors";
import ArticleCover from "../article/ArticleCover";
import ArticleReaderBody from "../article/ArticleReaderBody";
import { articleLook, articleReadingMinutes } from "../../libs/article";
import ContainedFeedImage from "./ContainedFeedImage";
import { FeedBleedContext, type FeedBleed, type MediaTool } from "./feedBleed";
import {
  CinematicAuthorChip,
  CinematicIconButton,
  CinematicToolsMenu,
  CINEMATIC_EDGE,
  CINEMATIC_TEXT_INSET,
  CINEMATIC_TOP_BAND,
  CINEMATIC_BOTTOM_BAND,
  CINEMATIC_BOTTOM_LIFT,
} from "./CinematicChrome";
import FeedImageGallery from "./FeedImageGallery";
import PostTapSurface from "./PostTapSurface";
import LiveFeedPreview from "../common/LiveFeedPreview";
import LiveFeedReactionFlow, { type SelfReaction } from "../LiveProducer/LiveFeedReactionFlow";
import { useWebSocketApi } from "../../context/WebSocketContext";
import { liveReactionType } from "../../libs/live-reaction-flow";
import { LivestreamEvents } from "../../services/enums/livestream.enum";
import { cdnImage } from "../../libs/cdnImage";
import { FEED_BENTO_RADIUS } from "../../libs/feed-image-layout";
import { hlsUrlFor, liveThumbnailFor } from "../../libs/live-ingest";
import { extractReplayUrl, replayDurationSec } from "../../libs/live-replay";
import GlassTipSheet from "../Tip/GlassTipSheet";
import PPVSheet from "../PPV/PPVSheet";
import BountyInfoSheet from "./BountyInfoSheet";
import AskAISheet from "./AskAISheet";
import AddToFolderSheet from "./AddToFolderSheet";
import ShareToDmSheet from "../DM/ShareToDmSheet";
import BoostSheet from "../common/BoostSheet";
import { DIGITAL_PURCHASES_ENABLED } from "../../config/storefront";
import { isPostHiddenByStorefront } from "../../libs/storefront-content";
import { useSuperpowers } from "../../hooks/useSuperpowers";
import ShareSheet from "./ShareSheet";
import CashtagSheet from "./CashtagSheet";
import Icon from "../ui/Icon";
import TranslateButton from "../ui/TranslateButton";
import SoundtrackBadge from "../Post/SoundtrackBadge";
import { parseSoundtrack } from "../../libs/parseSoundtrack";
import { useTranslation } from "../../hooks/useTranslation";
import { useTranslation as useCopy } from "react-i18next";
import { useImageTranslation } from "../../hooks/useImageTranslation";
import { useKeyedState } from "../../hooks/useItemState";
import { speechAvailable } from "../../hooks/useVoiceDub";
import { resolveViewCount } from "../../libs/numbers.util";
import { seedViewerStats } from "../../libs/viewers.util";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUser, useAuthActions, useAuthState } from "../../context/AuthContext";
import { useEngagementWeight } from "../../hooks/useEngagementWeight";
import { appliedEngagementWeight } from "../../libs/engagement-weight";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import PollCard from "../DM/PollCard";
// Direct module imports, not the `libs` barrel — it `export *`s the axios
// client and auth utils into every card module.
import { getAvatarUrl, getBadgeUrlFor, getImageUrl, getImageUrlApiSimple, buildFeedImageUrls, getAudioUrl, getVideoUrl, getShortsThumbnailUrl, resolveThumbnail, DEFAULT_BANNER_SENTINEL } from "../../libs/misc";
import { formatCompactNumber } from "../../libs/numbers.util";
import { toastError, toastSuccess } from "../../libs/toast";
import { copyToClipboard } from "../../libs/clipboard.utils";
import {
  usePostLinkCopyCount,
  useLinkCopyFloor,
  useTrackPostLinkCopy,
} from "../../libs/link-copy-count";
import { sharePostAsImage } from "../../libs/shareImage";
import {
  applyEngagement,
  revertEngagement,
  engagementKeyOf,
  isFailedResponse,
  useEngagement,
} from "../../libs/engagementCache";
import { markTokenUnlocked, useTokenUnlocked } from "../../libs/unlocked-tokens";
import { secondsToHMMSS } from "../../libs/date.util";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { voteOnNFT, reactToNFT, getPpvSalesCount, getNFT } from "../../services/nft.service";
import {
  applyReactionDelta,
  isPositiveReaction,
  reactionForTap,
  type PostReaction,
} from "../../libs/reactions";
import { savePost } from "../../services/feed.service";
import { toggleRepost } from "../../services/repost.service";
import { WEBSITE_LINK } from "../../config";
import env from "../../config/env";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import type { AIPostContext } from "../../services/ai.service";

// Pre-measurement fallback only. The gallery measures its own box on layout
// (handleGalleryLayout) because the true content width is the screen minus the
// feed list's padding (8/side) *and* the card's own (12/side) — a hardcoded
// guess drifted 8px per page here before, which desynced paging from the dots.
const imageWidthFor = (screenWidth: number) => screenWidth - 40;
// The single image gets its real width up front: screen minus the list's
// padding (8/side), the card's padding (12/side) and its 1px border. Left to
// measure itself, every card mounted at IMAGE_WIDTH and then shrank by 2px
// once layout reported the truth — a second layout, a scroll correction, and
// expo-image re-decoding the picture for the new size (traced: 143 image
// views created on a fling, 149 resize re-renders). At 120Hz that was a
// frame per card.
const singleImageWidthFor = (screenWidth: number) => screenWidth - 42;
// Width, in points, of the thumbnail a locked post blurs. 20px of blur on a
// 96px-wide image reads exactly like 20px of blur on the full one.
const LOCKED_PREVIEW_WIDTH = 32;


// Minimal theme text inset from the screen edge — the common 16pt mobile
// gutter. Media bleeds back out by exactly this much to reach both edges.
const MINIMAL_TEXT_INSET = 16;
// The side padding every feed list gives its cards. A minimal card steps out
// over it; measured per card (handleMinimalLayout) because not every list
// that renders a FeedCard pads the same, this is only the first guess.
const DEFAULT_LIST_GUTTER = 8;

type PostContentType = "image" | "video" | "audio" | "live" | "short";

// What the owner changed from the options menu, laid over the post's own data
// until the feed refetches. Held against the post it was made on (see
// useKeyedState), so a card handed another post shows that post's fields.
type PostEdits = {
  name?: string;
  description?: string;
  articleBody?: string;
  category?: string[];
  commentsDisabled?: boolean;
  contentRating?: string;
  forKids?: boolean;
  shopLinks?: ShopLink[];
  shopListingCount?: number;
  hidden?: boolean;
};
const NO_EDITS: PostEdits = {};
// One shared empty list, so a post with no categories keeps FeedCaption's memo.
const NO_CATEGORIES: string[] = [];
// Votes in flight, per post. Shared by every mounted card for that post, so
// the lists HomeScreen keeps over the same posts cannot send two at once, and
// a vote still out on one post never blocks a tap on the next.
const votesInFlight = new Set<string>();

export function resolveContentType(item: UnifiedFeedItem): PostContentType {
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
  /** True on the one card the list has handed autoplay to. A card that is
   *  visible but not the autoplay target still plays when it is tapped. */
  isAutoplayActive?: boolean;
  enablePreview?: boolean;
  /** Fires before any card-press navigation (e.g. to close a bottom sheet). */
  onBeforeNavigate?: () => void;
  /** Show a "Reposted" label inside the card above the user header row. */
  showRepostLabel?: boolean;
  /** Post-detail media is already on screen and must not wait behind feed images. */
  prioritizeMedia?: boolean;
  /** Post page, immersive like the web: no bento, and the media sits first,
   *  edge to edge across the screen, with the creator row and caption under
   *  it. The screen drops its top bar for a floating back button. */
  immersive?: boolean;
  /** Post page for a post with no media on top (text, audio, quotes): no
   *  bento, full width, the text on the same inset as an immersive post. */
  flat?: boolean;
  /** Home feed, system theme only: no bento, media edge to edge with the
   *  author and caption laid over it, the actions underneath. Ignored under
   *  every other theme. */
  cinematic?: boolean;
  /** Cinematic only: how far the top of the screen's chrome reaches into
   *  this post. Set on the feed's first row, which starts under the floating
   *  capsule; its author and buttons are pushed below it. */
  topChromeInset?: number;
  /** Cinematic only: no hairline under this post (the row after it draws its own). */
  hideDivider?: boolean;
}

/** Side inset for the text of an immersive post; the media ignores it. */
const IMMERSIVE_INSET = 16;

const FeedCardComponent: React.FC<FeedCardProps> = ({
  item,
  onCategorySelect,
  fullContent = false,
  disablePress = false,
  onCommentPress: onCommentPressProp,
  isVisible = true,
  isAutoplayActive = true,
  enablePreview = true,
  onBeforeNavigate,
  showRepostLabel = false,
  prioritizeMedia = false,
  immersive = false,
  flat = false,
  cinematic = false,
  topChromeInset = 0,
  hideDivider = false,
}) => {
  const navigation = useNavigation<any>();
  const { t } = useCopy();
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { isSignedIn } = useAuthState();
  // Live window width, so split-screen and unfolding resize the card instead
  // of keeping the width the app started with.
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const IMAGE_WIDTH = imageWidthFor(SCREEN_WIDTH);
  const SINGLE_IMAGE_WIDTH = singleImageWidthFor(SCREEN_WIDTH);

  // Deep Current is the one power spent on somebody ELSE's post, so it is the
  // one row that belongs in the non-owner half of the options menu.
  // `status.powers` is the authority for whether this account has it — the
  // badge the client draws from a live wallet read deliberately over-reports.
  const { data: superpowerStatus } = useSuperpowers();

  const canGiftBoost = !!superpowerStatus?.powers.some(
    p => p.key === 'deep_current' && p.unlocked && p.available,
  );
  const { showUserProfile, hideUserProfile } = useUserProfileSheet();

  const contentType = useMemo(() => resolveContentType(item), [item]);

  // --- Data derivation ---
  const stream = (item as any).stream;
  const streamInfo = (item as any).streamInfo || stream?.streamInfo;
  const tokenId = item.tokenId ?? (item as any).id ?? stream?.tokenId;
  // Which post this card is showing. Everything the card remembers about a
  // post (open sheets, edits, a deletion) is held against this, so none of it
  // can follow the card onto a different post.
  const postKey = tokenId != null ? String(tokenId) : String((item as any).__listKey ?? (item as any)._id ?? "");
  const chainId = (item as any).chainId || 8453;

  const minterUser = item.minterUser;
  const displayName =
    minterUser?.displayName ||
    minterUser?.username ||
    minterUser?.address ||
    item.minterDisplayName ||
    item.minterUsername ||
    item.minter ||
    t("settings.unknown");
  const username = minterUser?.username || item.minterUsername || item.minter || "";
  const minterAddress = minterUser?.address || item.minter || item.owner || "";
  // Following belongs to the creator, not the post, so a follow made from
  // this card is held against the creator's address.
  const followKey = minterAddress ? minterAddress.toLowerCase() : postKey;
  // URL building and the "untitled" check are per-item, not per-render; a card
  // re-renders many times over its life (engagement ticks, visibility).
  const avatarSource = minterUser?.avatarImageUrl || item.minterAvatarUrl || "";
  const avatar = useMemo(() => getAvatarUrl(avatarSource), [avatarSource]);
  const hideBadge = !!minterUser?.hideBadgeAndBalance;
  const badgeImg = useMemo(
    () => (hideBadge ? null : getBadgeUrlFor(minterUser || item)),
    [hideBadge, minterUser, item],
  );

  const createdAt = item.createdAt || stream?.createdAt;
  const rawTitle = item.name || item.title || stream?.title || "";
  // Trimmed, because the Go Live flow mints its post with a single space for a
  // name when the broadcaster leaves the title empty. " " is truthy, so every
  // `title || fallback` on this card rendered that space instead of the
  // fallback — a live card whose caption was one blank character.
  const title = useMemo(() => {
    const trimmed = rawTitle.trim();
    return trimmed.toLowerCase() === "untitled" ? "" : trimmed;
  }, [rawTitle]);
  const description = item.description || stream?.description || "";
  const soundtrack = useMemo(() => parseSoundtrack(description), [description]);
  const hasSoundtrack = !!soundtrack;
  const isLive = contentType === "live";
  // Keep the API's zero authoritative. Falling through on zero can revive a
  // stale stream count and make the card disagree with the opened thread.
  const commentCount = isLive
    ? Math.max(item.commentCount ?? stream?.commentCount ?? 0, (item as any).liveChatCount ?? 0)
    : (item.commentCount ?? (item as any).comments ?? stream?.commentCount ?? 0);
  // The canonical count, for EVERY post type — the API already folds the
  // signed-out and badge-weighted halves into totalViews and the web card
  // renders exactly this number. The old `|| peakViewers || stream.totalViews`
  // tail traded a real zero for a stream's audience figures, which measure
  // something else entirely (see the live chips below).
  const views = resolveViewCount(item);
  const totalTips = (item as any).totalTips || (item as any).tips || 0;
  const isAudioPost = contentType === "audio";
  const isVideo = contentType === "video" || contentType === "short";
  const isShort = contentType === "short";

  const userAddress = user?.address || user?.walletAddress || "";
  // What one reaction from this viewer counts for — their badge multiplier.
  // A badge never buys a second reaction, only a heavier one.
  const voteWeight = useEngagementWeight();
  const isOwnerPost = !!(item as any).isOwner || (
    userAddress && minterAddress && userAddress.toLowerCase() === minterAddress.toLowerCase()
  );

  const { isMinimal, skin, theme } = useAppTheme();
  const articleUi = useMemo(() => articleLook(theme), [theme]);
  // How far this card has to step out to span the screen. Worked out from the
  // width the list actually gives it, so a list with other padding still
  // lands edge to edge. The applied margin is added back before comparing, or
  // the measurement would chase its own correction.
  const [minimalGutter, setMinimalGutter] = useState(DEFAULT_LIST_GUTTER);
  const handleMinimalLayout = useCallback((e: LayoutChangeEvent) => {
    const listWidth = e.nativeEvent.layout.width - 2 * minimalGutter;
    const next = Math.max(0, Math.round((SCREEN_WIDTH - listWidth) / 2));
    if (Math.abs(next - minimalGutter) > 1) setMinimalGutter(next);
  }, [minimalGutter, SCREEN_WIDTH]);

  const [replacementImages, setReplacementImages] = useState<{ tokenId: string; imageUrls: string[] } | null>(null);
  // Only the owner can replace a post's images, so only the owner's own card
  // needs to hear about it; one listener per mounted card was the alternative.
  useEffect(() => {
    if (!isOwnerPost) return;
    const subscription = DeviceEventEmitter.addListener('post-images-replaced', (updated: { tokenId: string; imageUrls: string[] }) => {
      if (updated.tokenId === String(tokenId)) setReplacementImages(updated);
    });
    return () => subscription.remove();
  }, [tokenId, isOwnerPost]);
  const [replacementCover, setReplacementCover] = useState<{ tokenId: string; imageUrl: string } | null>(null);
  useEffect(() => {
    if (!isOwnerPost) return;
    const subscription = DeviceEventEmitter.addListener('post-cover-replaced', (updated: { tokenId: string; imageUrl: string }) => {
      if (updated.tokenId === String(tokenId)) setReplacementCover(updated);
    });
    return () => subscription.remove();
  }, [tokenId, isOwnerPost]);
  // --- Gallery images (for image posts) ---
  // Measured on a Galaxy S24+ with Android's frame log: a third of frames
  // janky on the home feed, every one of them a "slow bitmap upload". Two
  // sizing mistakes fed it. The gallery asked for 640pt, which on a 3x screen
  // snaps to a 2048px-wide image for a card a third of that; and the
  // single-image path passed no width at all, which `cdnImage` treats as "no
  // transform" — the original upload, tens of megapixels, decoded and pushed
  // to the GPU in the middle of a fling. Both now ask for the card's width.
  const rawImageUrls = useMemo<string[]>(
    () =>
      replacementImages?.tokenId === String(tokenId)
        ? replacementImages.imageUrls
        : Array.isArray(item.imageUrls)
          ? item.imageUrls
          : [],
    [item, tokenId, replacementImages],
  );
  const galleryImages = useMemo(() => {
    if (rawImageUrls.length > 0) return buildFeedImageUrls(rawImageUrls, IMAGE_WIDTH);
    const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "", IMAGE_WIDTH);
    return single ? [single] : [];
  }, [item, rawImageUrls, IMAGE_WIDTH]);
  // A locked post shows its picture blurred. Blurring a full-width image
  // costs the same decode and upload as showing it; blurring a thumbnail
  // looks identical under a 20px blur and is a fraction of the work. It also
  // means the phone never holds the full-resolution picture of a paywalled
  // post it has not paid for.
  const lockedPreviewUri = useMemo(() => {
    if (rawImageUrls.length > 0) return buildFeedImageUrls([rawImageUrls[0]], LOCKED_PREVIEW_WIDTH)[0];
    return getImageUrl(item.imageUrl || item.thumbnailUrl || "", LOCKED_PREVIEW_WIDTH) || galleryImages[0];
  }, [item, rawImageUrls, galleryImages]);
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
      // Neither the post nor the stream carries a picture. Livepeer renders a
      // poster for a running broadcast — the closest thing to a recent
      // screenshot available without one. The self-hosted ingest renders none
      // and an ended stream's poster 404s, so both fall through to whatever
      // the post itself can offer.
      const liveNow = String(stream?.status ?? (item as any).status ?? "").toLowerCase();
      if (liveNow === "live" || liveNow === "paused") {
        const poster = liveThumbnailFor(stream as any);
        if (poster) return poster;
      }
      // resolveThumbnail answers with the SENTINEL "default-banner" — not a
      // URL — when a post carries no picture at all. It reads as a thumbnail to
      // every `typeof === string` check downstream, so a live post with no
      // cover (the norm: the self-hosted ingest renders none and the token
      // carries no image) handed that string to <Image>, which throws
      // "no scheme was found for default-banner" and paints nothing. The card
      // was then a flat grey slab: the poster was "present" so neither the
      // preview's placeholder nor the fallback below could run.
      const resolved = resolveThumbnail(item as any, IMAGE_WIDTH);
      return resolved === DEFAULT_BANNER_SENTINEL ? "" : resolved;
    }
    if (isVideo) {
      // A cover just changed from Edit Post, before the feed refetches.
      if (replacementCover?.tokenId === String(tokenId)) return cdnImage(`${env.CDN_BASE_URL}/${replacementCover.imageUrl}`, { width: IMAGE_WIDTH });
      if (isShort) {
        // A changed cover sits on its own key; read it rather than the id-built one.
        if (item.imageUrl?.startsWith("shorts/")) return cdnImage(`${env.CDN_BASE_URL}/${item.imageUrl}`, { width: IMAGE_WIDTH });
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
  }, [item, stream, isLive, isVideo, isShort, tokenId, IMAGE_WIDTH, replacementCover]);

  const [failedLiveThumbnail, setFailedLiveThumbnail] = useState<string | null>(null);
  const hasThumb = typeof thumbnail === "string" && thumbnail.trim().length > 0
    && (!isLive || thumbnail !== failedLiveThumbnail);
  const liveDurationSec = isLive ? replayDurationSec(stream) : undefined;
  const durationSeconds = (item as any).videoDuration || liveDurationSec;
  const duration = durationSeconds ? secondsToHMMSS(durationSeconds) : undefined;

  // --- Monetization badges ---
  const isPayPerView = streamInfo?.isPayPerView;
  const payPerViewAmount = streamInfo?.payPerViewAmount || 0;
  const payPerViewTokenSymbol = streamInfo?.payPerViewTokenSymbol || "DHB";
  // PPV payment chain — Solana posts pay in SOL/SPL (#41)
  const payPerViewChainId = Array.isArray(streamInfo?.payPerViewChainIds)
    ? streamInfo?.payPerViewChainIds[0]
    : streamInfo?.payPerViewChainIds;

  // PPV sales count — fetch once for owner's own PPV posts
  const [ppvSalesCount, setPpvSalesCount] = useKeyedState<number | null>(postKey, null);
  useEffect(() => {
    if (!isOwnerPost || !isPayPerView || !tokenId) return;
    let cancelled = false;
    getPpvSalesCount(tokenId).then(r => { if (!cancelled) setPpvSalesCount(r.salesCount); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOwnerPost, isPayPerView, tokenId, setPpvSalesCount]);
  const isLocked = isHoldGated(streamInfo?.isLockContent, streamInfo?.lockAmount ?? streamInfo?.lockContentAmount);
  const lockContentAmount = streamInfo?.lockAmount || streamInfo?.lockContentAmount || 0;
  const lockContentTokenSymbol = streamInfo?.lockContentTokenSymbol || "DHB";
  const isBounty = !!(streamInfo?.isAddBounty || (item as any).is_w2e);
  const bountyAmount = streamInfo?.addBountyAmount || 0;
  const bountyTokenSymbol = streamInfo?.addBountyTokenSymbol || "DHB";

  // --- Stream status ---
  //
  // Two different `status` fields collide on a live post. The item's is its
  // MINT status ("signed"/"minted"), the stream's is the broadcast's
  // ("LIVE"/"OFFLINE"/"SCHEDULED"). Reading the item's first meant a live post
  // always answered "minted": no badge (StatusBadge knows no such status) and
  // never live. The stream's own status wins wherever there is one.
  //
  // Case-folded before comparing, because the API answers in upper case while
  // this check was written in lower — so `isCurrentlyLive` was false even for a
  // stream that was running.
  const rawStatus: string | undefined = stream?.status || (item as any).status;
  const status = rawStatus ? rawStatus.toUpperCase() : undefined;
  const isCurrentlyLive = isStreamLive(stream, status === "LIVE" || status === "PAUSED");
  const liveReactionStreamId = isLive ? stream?._id || stream?.id || (item as any)._id : undefined;
  // The core namespace specifically: the shared flag is also true when only
  // the DM socket is up, which would send the reaction nowhere. Read at tap
  // time through the getter, not subscribed: the status half of the socket
  // context changes on every reconnect — every return from the background on
  // Android — and every mounted card re-rendered for it.
  const { emitAuthed: emitLiveReaction, isCoreConnected: isReactionSocketConnected } = useWebSocketApi();
  // The viewer's own floating reaction, played on tap rather than waiting on
  // the room echo — see LiveFeedReactionFlow's `self`.
  const [selfLiveReaction, setSelfLiveReaction] = useKeyedState<SelfReaction | null>(postKey, null);
  const selfLiveReactionNonce = useRef(0);

  // HLS ladder for the in-card preview. Derived from the playbackId the same
  // way the post page does it — `playbackUrl` off the API is usually absent
  // for a self-hosted stream.
  const livePreviewUrl = useMemo(
    () => (isLive ? hlsUrlFor(stream as any) : null),
    [isLive, stream],
  );

  // A finished stream leaves a plain mp4 replay on the CDN once its capture
  // reports ready, and the HLS ladder above is dead the moment ingest stops.
  // So a past live plays its replay in the card where a running one plays its
  // stream — otherwise every ended stream is a poster with nothing behind it.
  const replayUrl = useMemo(
    () => (isLive ? extractReplayUrl(stream) : undefined),
    [isLive, stream],
  );
  const livePlayableUrl = isCurrentlyLive ? livePreviewUrl : replayUrl || null;

  // --- Live stats ---
  // An audience, not a view count, and the two stream fields mean the opposite
  // of what this card assumed: `peakViewers` IS the high-water mark, while the
  // stream's own `totalViews` counts JOINS — one viewer whose connection drops
  // and returns three times makes it 3. See libs/viewers.util. So the row was
  // printing the peak under "watching now" and a reconnect tally under "Peak".
  const { peakViewers: peakAudience } = seedViewerStats(stream);
  const liveLikes = stream?.likes || item.likes || 0;

  // --- Access info (for navigation) ---
  const accessInfo = useStreamAccessInfo(item as any);

  // Derive actual gating state from computed access (accounts for ownership and unlock status)
  const streamStatus = accessInfo?.streamStatus;
  const isServerLockedPPV = !!streamStatus?.isLockedWithPPV;
  const isActuallyLockedHoldings = !!streamStatus?.isLockedWithLockContent;
  // Same server verdict, different question: subscribe to this creator.
  const isActuallySubGated = !!streamStatus?.isLockedWithSubscription;

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

  // Share counter = reposts + link copies. The copies come from Supabase
  // (batched to one request per feed page); the floor is the copies made this
  // session, so the number moves on the tap rather than on the next refetch.
  const { data: linkCopyCount = 0 } = usePostLinkCopyCount(tokenId);
  const linkCopyFloor = useLinkCopyFloor(tokenId);
  const shareCount = repostCount + Math.max(linkCopyCount, linkCopyFloor);
  const trackLinkCopy = useTrackPostLinkCopy();
  // Which sheet is open, held against the post it was opened for. Several of
  // these open late (after a save resolves, after sign-in), and a card handed
  // another post in the meantime must not open them there.
  const [showShareSheet, setShowShareSheet] = useKeyedState(postKey, false);
  const [showComments, setShowComments] = useKeyedState(postKey, false);
  const [showReactionInfo, setShowReactionInfo] = useKeyedState(postKey, false);
  const [showOptionsMenu, setShowOptionsMenu] = useKeyedState(postKey, false);
  const [showTipModal, setShowTipModal] = useKeyedState(postKey, false);
  const [showPPVModal, setShowPPVModal] = useKeyedState(postKey, false);
  const [showBountyModal, setShowBountyModal] = useKeyedState(postKey, false);
  const [showAISheet, setShowAISheet] = useKeyedState(postKey, false);
  const [showAddToFolder, setShowAddToFolder] = useKeyedState(postKey, false);
  const [showShareToDm, setShowShareToDm] = useKeyedState(postKey, false);
  const [showBoost, setShowBoost] = useKeyedState(postKey, false);
  const [activeCashtag, setActiveCashtag] = useKeyedState<string | null>(postKey, null);
  // Read from the session store, never kept here: a card recycled out of the
  // FlatList window does not re-lock a post the viewer just paid for, and a
  // card handed another post never carries this one's unlock onto it.
  const ppvUnlocked = useTokenUnlocked(tokenId);
  // Local unlock overrides server PPV state after successful payment
  const isActuallyLockedPPV = isServerLockedPPV && !ppvUnlocked;
  const isActuallyComboLocked = isActuallyLockedPPV && isActuallyLockedHoldings;
  const isActuallyGated = isActuallyLockedPPV || isActuallyLockedHoldings || isActuallySubGated;
  // The owner's edits from the options menu, laid over the post's own fields
  // so a change shows on this card without waiting for the feed to refetch.
  // Only the fields actually edited are held; everything else keeps reading
  // the post, so a refetch still lands.
  const [edits, setEdits] = useKeyedState<PostEdits>(postKey, NO_EDITS);
  // Re-rating a post from its own options menu takes effect at once.
  const localContentRating: string | undefined = edits.contentRating ?? (item as any).contentRating;
  // Same for the Kids Mode marking, so taking it off re-opens the comment box
  // on this card without a refetch.
  const localForKids = edits.forKids ?? !!(item as any).forKids;
  // Same for the Shop board, so adding or clearing links shows on this card
  // immediately.
  const localShopLinks = edits.shopLinks;
  const localShopListingCount = edits.shopListingCount;
  // Independent of the monetisation gates above: a post can be both mature and
  // pay-per-view, and the creator's own post is warned about too — the warning
  // is for whoever is holding the phone.
  const matureGate = useMatureGate(localContentRating, postKey);
  const isHidden = edits.hidden ?? !!(item as any).isHidden;
  const [follow, setFollow] = useKeyedState<{ following: boolean; pending: boolean } | null>(followKey, null);
  const isFollowingCreator = follow ? follow.following : !!(item as any).isFollowing;
  const isFollowReqPending = follow ? follow.pending : !!(item as any).isFollowRequestPending;
  const localTitle = edits.name ?? title;
  const localDescription = edits.description ?? description;
  const localArticleBody = edits.articleBody ?? item.articleBody;
  const localCommentsDisabled = edits.commentsDisabled ?? !!(item as any).commentsDisabled;
  const localCategories = edits.category ?? item.category ?? NO_CATEGORIES;

  const translationTexts = useMemo(() => ({
    title: localTitle || '',
    description: localDescription || '',
  }), [localTitle, localDescription]);
  const { isTranslated, translatedTexts, isLoading: translating, handleTranslate, handleShowOriginal, shouldShow: showTranslate, sourceLang: translationSourceLang } =
    useTranslation(translationTexts, item.detectedLanguage, true, true, postKey);
  // DeHub links in the caption become entity cards, and the URLs that became
  // cards come out of the text — the same contract the DM, comment and
  // community-chat surfaces already follow, and the same one web's PostCard
  // uses. Without this the feed was the one surface where a stage, community
  // or shop link stayed a bare URL that opened the in-app browser.
  //
  // Run on the text actually being displayed, not the original: a translation
  // that mangled a URL then keeps it as visible text rather than dropping it
  // for a card that never renders.
  const captionText = (isTranslated ? translatedTexts.description : localDescription) || '';
  const dehubLinks = useMemo(
    () => findDehubLinks(captionText).slice(0, MAX_CARDS_PER_MESSAGE),
    [captionText],
  );
  const captionWithoutLinks = useMemo(
    () => stripDehubLinkMatches(captionText, dehubLinks),
    [captionText, dehubLinks],
  );
  // Market references get the same treatment, and in this order: the entity pass
  // claims whole URLs first, so a dehub.io link carrying a hex id cannot also
  // read as a contract address. Tickers stay in the caption; addresses come out.
  const assetRefs = useMemo(
    () => findAssetRefs(captionWithoutLinks).slice(0, MAX_ASSET_CARDS_PER_MESSAGE),
    [captionWithoutLinks],
  );
  const displayCaption = useMemo(
    () => stripAssetRefs(captionWithoutLinks, assetRefs),
    [captionWithoutLinks, assetRefs],
  );

  const { isLoading: imgTranslating, error: imgTranslateError, result: imgTranslateResult, translateImage, clearResult: clearImgResult } =
    useImageTranslation();
  const [showImgTranslationSheet, setShowImgTranslationSheet] = useKeyedState(postKey, false);
  const [isDeleted, setIsDeleted] = useKeyedState(postKey, false);

  // --- Handlers ---
  const handleUserPress = useCallback(() => {
    const id = username || minterAddress;
    if (!id) return;
    showUserProfile(id);
  }, [username, minterAddress, showUserProfile]);

  // A subscriber gate is opened by subscribing, so send them where the plans
  // are sold rather than to the post they cannot read.
  const handleSubscribePress = useCallback(() => {
    const id = username || minterAddress;
    if (!id) return;
    showUserProfile(id);
  }, [username, minterAddress, showUserProfile]);

  // Stable handlers so the memo'd header, caption and action bar keep their
  // bail-outs; an inline arrow here re-rendered all three on every card render.
  // The keyed setters change with the post, so every handler that calls one
  // lists it; a stale one would write under the previous post's key and the
  // sheet would never open on this one.
  const handleBoostPress = useCallback(() => setShowBoost(true), [setShowBoost]);
  const handleShowReactionInfo = useCallback(() => setShowReactionInfo(true), [setShowReactionInfo]);
  // Relative time moves by the minute at most; recomputing it on every render
  // parsed the date each time.
  const timeAgo = useMemo(() => formatShortTimeAgo(createdAt), [createdAt]);

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
        tokenId,
      } as never);
    } else if (isShort && tokenId != null) {
      navigation.navigate(ScreenNames.ShortsViewer, {
        initialIndex: 0,
        initialItems: [item],
      });
    } else if (tokenId != null) {
      // Hand the detail screen this card's post to paint at once, and start
      // its fetch now rather than after the new screen has rendered.
      seedPostDetail(tokenId, item);
      warmRequest(`nft:${tokenId}`, () => getNFT(tokenId));
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
      soundtrack: !isActuallyGated && !matureGate.isGated ? soundtrack : undefined,
    });
  }, [navigation, galleryImages, hasImages, hideUserProfile, onBeforeNavigate, isActuallyGated, matureGate.isGated, soundtrack]);

  const handleTranslateImage = useCallback(() => {
    const imageUrl = galleryImages[0];
    if (!imageUrl) return;
    setShowImgTranslationSheet(true);
    translateImage(imageUrl);
  }, [galleryImages, translateImage, setShowImgTranslationSheet]);

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
    if (isCurrentlyLive) {
      requireAuth?.(() => {
        // The sender's own bubble, always. A missing stream id or a dropped
        // socket costs the room its copy, never the person who tapped theirs.
        selfLiveReactionNonce.current += 1;
        setSelfLiveReaction({ type: reaction, weight: voteWeight, nonce: selfLiveReactionNonce.current });
        if (liveReactionStreamId && isReactionSocketConnected()) {
          emitLiveReaction(LivestreamEvents.StreamReaction, {
            streamId: liveReactionStreamId, reactionType: liveReactionType(reaction),
          });
        }
      });
    }
    // One vote at a time: a double-tap otherwise reads the same stale
    // myReaction twice and fires two toggles that cancel server-side, leaving
    // the overlay asserting a reaction the server no longer holds.
    if (votesInFlight.has(engagementKey)) return;
    requireAuth?.(() => {
      // Auth can defer callbacks; recheck when the authorized action runs.
      if (votesInFlight.has(engagementKey)) return;
      votesInFlight.add(engagementKey);
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

      // The whole optimistic result at a given weight. A function of the
      // weight because the server answers with the weight it actually applied,
      // and that can differ from the one guessed here — the cached account row
      // can be a beat behind the one the API priced from.
      const countsAt = (weight: number) => {
        let nextLikeCount = wasLikeCount;
        let nextDislikeCount = wasDislikeCount;
        if (wasPositive && !nextPositive) nextLikeCount = Math.max(0, nextLikeCount - weight);
        if (!wasPositive && nextPositive) nextLikeCount += weight;
        // A dislike always shows as one, whatever badge cast it.
        if (wasNegative && !nextNegative) nextDislikeCount = Math.max(0, nextDislikeCount - 1);
        if (!wasNegative && nextNegative) nextDislikeCount += 1;
        return {
          isLiked: nextPositive,
          isDisliked: nextNegative,
          myReaction: next,
          likeCount: nextLikeCount,
          dislikeCount: nextDislikeCount,
          reactionCounts: applyReactionDelta(wasCounts, wasReaction, next, weight),
        };
      };

      // Publish to the shared overlay; the sync effect above pushes it into
      // this card and every other mounted card for the same post.
      applyEngagement(engagementKey, countsAt(voteWeight));

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
        toastError(t("feedCard.reactionFailed"));
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
        .then((res: any) => {
          if (isFailedResponse(res)) {
            rollback();
            return;
          }
          // Settle on the weight the server actually applied. Only differs
          // when this side is a beat behind the account row — but the overlay
          // outlives the refetch, so a wrong number would sit on the card
          // until then. An API that does not send one is left alone rather
          // than settled to 1: absent means "older build", not "counted once".
          const raw = res?.weight ?? res?.result?.weight;
          if (typeof raw === "number") {
            const applied = appliedEngagementWeight(raw);
            if (applied !== voteWeight) applyEngagement(engagementKey, countsAt(applied));
          }
        })
        .catch(rollback)
        .finally(() => {
          votesInFlight.delete(engagementKey);
        });
    });
  }, [tokenId, liked, disliked, likeCount, dislikeCount, myReaction, reactionCounts, engagementKey, userAddress, requireAuth, voteWeight, isCurrentlyLive, liveReactionStreamId, isReactionSocketConnected, emitLiveReaction, setSelfLiveReaction]);

  /**
   * Tapping a thumb casts whichever reaction it is WEARING: a card leading with
   * 🔥 draws a 🔥 thumb, so the tap reacts 🔥 rather than quietly casting a 👍
   * the viewer never picked. Tapping a reaction you already hold re-sends it,
   * which the server reads as "toggle it off" — so the thumb clears a 🔥 the
   * same way it clears a 👍, instead of downgrading it to a plain like.
   */
  const togglePolarity = useCallback((positive: boolean) => {
    handleReaction(reactionForTap(positive, myReaction, reactionCounts));
  }, [handleReaction, myReaction, reactionCounts]);

  const handleLikePress = useCallback(() => togglePolarity(true), [togglePolarity]);
  const handleDislikePress = useCallback(() => togglePolarity(false), [togglePolarity]);
  const handleVideoTapReaction = useCallback((reaction: "like" | "love") => {
    // Media gestures only add or upgrade; they never toggle an existing vote
    // off when a deliberate play/pause tap happens to become a double tap.
    if (myReaction === reaction) return;
    if (reaction === "like" && liked) return;
    handleReaction(reaction);
  }, [handleReaction, liked, myReaction]);

  const handleSavePress = useCallback(() => {
    requireAuth?.(() => {
      const wasSaved = saved;
      const willBeSaved = !wasSaved;
      applyEngagement(engagementKey, { isSaved: willBeSaved });
      if (tokenId != null) {
        const rollback = () => {
          revertEngagement(engagementKey, { isSaved: wasSaved });
          toastError(t("feedCard.saveFailed"));
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
  }, [tokenId, userAddress, saved, engagementKey, requireAuth, setShowAddToFolder]);

  // An off-chain post shares as its own slug (/newpost/<n>), never as the
  // NFT-style /app/post/<tokenId> it hasn't earned. The slug survives minting
  // server-side, so links handed out now keep working after a mint.
  const shareUrl = useMemo(() => {
    const newPostId = (item as any).newPostId;
    if (rawStatus === "signed" && newPostId != null) {
      return `${WEBSITE_LINK || ""}/newpost/${newPostId}`;
    }
    return `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
  }, [item, rawStatus, tokenId]);

  const handleSharePress = useCallback(() => {
    if (tokenId == null) return;
    sharePostAsImage(Number(tokenId), shareUrl, localTitle || undefined).catch(() => {});
  }, [tokenId, shareUrl, localTitle]);

  const handleTipPress = useCallback(() => {
    if (!minterAddress) return;
    requireAuth?.(() => {
      setShowTipModal(true);
    });
  }, [minterAddress, requireAuth, setShowTipModal]);

  const handlePPVPress = useCallback(() => {
    requireAuth?.(() => {
      setShowPPVModal(true);
    });
  }, [requireAuth, setShowPPVModal]);

  // The store re-renders every card showing this post, this one included.
  const handlePPVSuccess = useCallback(() => {
    markTokenUnlocked(tokenId);
  }, [tokenId]);

  const handleBountyBadgePress = useCallback(() => {
    requireAuth?.(() => {
      setShowBountyModal(true);
    });
  }, [requireAuth, setShowBountyModal]);

  const handleCommentPress = useCallback(() => {
    if (onCommentPressProp) {
      onCommentPressProp();
    } else if (isLive) {
      // A live post's conversation is its chat, in the viewer — not a comment
      // sheet beside it. Same as the web feed card, which opens the room.
      handleCardPress();
    } else if (tokenId != null) {
      setShowComments(true);
    }
  }, [tokenId, onCommentPressProp, isLive, handleCardPress, setShowComments]);

  // The sheet opens on release; its reads can start on touch-down.
  const queryClient = useQueryClient();
  const handleCommentPressIn = useCallback(() => {
    if (onCommentPressProp || isLive || tokenId == null) return;
    warmCommentThread(queryClient, tokenId, userAddress || undefined);
  }, [queryClient, tokenId, onCommentPressProp, isLive, userAddress]);

  // Open the Share sheet. Ungated so logged-out users can still copy the link /
  // share as image; repost & quote gate themselves via requireAuth.
  const handleOpenShare = useCallback(() => {
    if (tokenId == null) return;
    setShowShareSheet(true);
  }, [tokenId, setShowShareSheet]);

  const handleCopyLink = useCallback(() => {
    if (tokenId == null) return;
    copyToClipboard(shareUrl);
    toastSuccess(t("feedCard.linkCopied"));
    // A copy is a share: it counts once per actor per post, next to reposts.
    trackLinkCopy(tokenId, userAddress, linkCopyCount);
  }, [tokenId, shareUrl, trackLinkCopy, userAddress, linkCopyCount]);

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
      toastError(t("feedCard.removeRepostFailed"));
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
        toastError(t("toasts.failed_to_repost"));
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

  // Post info is a page on web and here — the on-chain block inside it is
  // the only part that waits on a mint, not the whole page.
  const handleInfoPress = useCallback(() => {
    if (tokenId == null) return;
    navigation.navigate(ScreenNames.PostInfo, { tokenId: String(tokenId) });
  }, [navigation, tokenId]);

  const handleOpenOptions = useCallback(() => {
    setShowOptionsMenu(true);
  }, [setShowOptionsMenu]);

  // The menu calls these after its request resolves. Each one writes under
  // the key it was created with, so a result that arrives after the card has
  // moved on lands on the post it was for, never the one now showing.
  const handleFollowChange = useCallback((following: boolean, pending?: boolean) => {
    setFollow({ following, pending: !!pending });
  }, [setFollow]);

  const handleVisibilityChange = useCallback((hidden: boolean) => {
    setEdits((prev) => ({ ...prev, hidden }));
  }, [setEdits]);

  // Every field the menu sends is kept, and only those. That covers the
  // comments switch (without it the composer stays live until the feed
  // refetches, so the creator would still see an input on a post they just
  // closed) and the Shop links (the button has to appear, change count or
  // disappear on the card that is already on screen).
  const handleEditSuccess = useCallback((data: Omit<PostEdits, "hidden">) => {
    const defined = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    ) as PostEdits;
    setEdits((prev) => ({ ...prev, ...defined }));
  }, [setEdits]);

  const handleDeleteSuccess = useCallback(() => {
    setIsDeleted(true);
  }, [setIsDeleted]);

  // The gallery width is the maximum width available to each image. Portrait
  // images hug their rendered bitmap width so the next image follows directly.
  const [itemWidth, setItemWidth] = useState(IMAGE_WIDTH);

  const handleGalleryLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w > 0) setItemWidth((current) => current === w ? current : w);
    },
    [],
  );

  // Non-null only when this card sits inside a horizontal pager (Home). Lets the
  // multi-image gallery below keep its own swipes — see renderImageContent.
  const scrollGuard = useHorizontalScrollGuard();

  const handleAiPress = useCallback(() => {
    requireAuth?.(() => {
      setShowAISheet(true);
    });
  }, [requireAuth, setShowAISheet]);

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

  // Cinematic (system theme, home feed): a post with a picture or a player
  // runs it edge to edge with the author, buttons and caption over it. Posts
  // without one (text, audio, articles, a post behind the mature warning)
  // lose the bento too but keep the header above the text.
  const cinematicFeed = cinematic && theme === "system" && !skin && !isMinimal && !immersive && !flat;
  const cinematicMedia =
    cinematicFeed &&
    !matureGate.isGated &&
    !localArticleBody &&
    (contentType === "video" ||
      contentType === "short" ||
      contentType === "live" ||
      (contentType === "image" && hasImages));
  const overlayTitle = (isTranslated ? translatedTexts.title : localTitle) || "";
  // Video and live carry the author and buttons over the picture; a photo
  // gets a plain header row above it instead, and nothing over it.
  const chipOverMedia = cinematicMedia && contentType !== "image";
  // Under the capsule the first thing in the post moves down: the repost or
  // boost labels when there are any, the author otherwise. A video still runs
  // to the top of the screen; only its chip and buttons move.
  const hasLabels = showRepostLabel || !!(item as any).__boosted;
  const chromeInset = cinematicFeed ? topChromeInset : 0;
  const leadInset = hasLabels ? 0 : chromeInset;
  // The first post keeps the top of its picture clear under the capsule: its
  // author and buttons move to the bottom of the media instead, and badges
  // sit just under the capsule.
  const chipAtBottom = chipOverMedia && leadInset > 0;
  const mediaBand = chipAtBottom ? leadInset + 8 : CINEMATIC_TOP_BAND;
  // The player's own buttons, folded into one tools menu on the card.
  const [mediaTools, setMediaTools] = useState<MediaTool[] | null>(null);
  const [toolsOpen, setToolsOpen] = useKeyedState(postKey, false);
  const feedBleed = useMemo<FeedBleed | null>(
    () => (cinematicMedia
      ? {
          topInset: chipOverMedia ? mediaBand : 0,
          bottomInset: chipAtBottom ? CINEMATIC_BOTTOM_BAND : 0,
          setTools: chipOverMedia ? setMediaTools : undefined,
        }
      : null),
    [cinematicMedia, chipOverMedia, chipAtBottom, mediaBand],
  );
  // Media that already spans the screen: square, no top gap.
  const edgeMedia = immersive || cinematicMedia;
  // Badges a locked picture pins to its top-left corner start under the chip.
  const lockBadgeTop = chipOverMedia ? { top: mediaBand } : undefined;

  if (isDeleted) return null;

  // --- Content renderers ---
  const renderImageContent = () => {
    if (!hasImages) return null;

    // Combo-locked image (PPV + holdings): dual icon overlay (matches web ImageCard behaviour)
    if (isActuallyComboLocked) {
      return (
        <Pressable
          onPress={handlePPVPress}
          className={edgeMedia ? "overflow-hidden" : "mt-2 rounded-xl overflow-hidden"}
          style={{ height: (edgeMedia ? SCREEN_WIDTH : IMAGE_WIDTH) * 0.75 }}
        >
          <SmartImage
            source={{ uri: lockedPreviewUri }}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={lockedPreviewUri}
            priority={prioritizeMedia ? "high" : "normal"}
            blurRadius={20}
          />
          <View className="absolute inset-0 dark-surface bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row gap-2" style={lockBadgeTop}>
              <View className="flex-row items-center gap-1 dark-surface bg-black/60 rounded-full px-2.5 py-1">
                <Icon name="Ticket" size={12} color="#fff" />
                <Text className="text-white text-xs font-medium">
                  {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
                </Text>
              </View>
              <View className="flex-row items-center gap-1 dark-surface bg-black/60 rounded-full px-2.5 py-1">
                <Icon name="Lock" size={12} color="#fff" />
                <Text className="text-white text-xs font-medium">
                  {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3 mb-3">
              <View className="w-14 h-14 rounded-xl dark-surface bg-black/40 border border-white/10 items-center justify-center">
                <Icon name="Ticket" size={24} color="#fff" />
              </View>
              <View className="w-14 h-14 rounded-xl dark-surface bg-black/40 border border-white/10 items-center justify-center">
                <Icon name="Lock" size={24} color="#fff" />
              </View>
            </View>
            <Text className="text-white font-semibold text-sm mb-1">{t("ppv.title")}</Text>
            <Text className="text-white/70 text-xs">
              {t("feedCard.unlockForAndHold", { price: formatCompactNumber(payPerViewAmount), symbol: payPerViewTokenSymbol, hold: formatCompactNumber(lockContentAmount), holdSymbol: lockContentTokenSymbol })}
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
          className={edgeMedia ? "overflow-hidden" : "mt-2 rounded-xl overflow-hidden"}
          style={{ height: (edgeMedia ? SCREEN_WIDTH : IMAGE_WIDTH) * 0.75 }}
        >
          <SmartImage
            source={{ uri: lockedPreviewUri }}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={lockedPreviewUri}
            priority={prioritizeMedia ? "high" : "normal"}
            blurRadius={20}
          />
          <View className="absolute inset-0 dark-surface bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row items-center gap-1 dark-surface bg-black/60 rounded-full px-2.5 py-1" style={lockBadgeTop}>
              <Icon name="Ticket" size={12} color="#fff" />
              <Text className="text-white text-xs font-medium">
                {formatCompactNumber(payPerViewAmount)} {payPerViewTokenSymbol}
              </Text>
            </View>
            <View className="w-16 h-16 rounded-xl dark-surface bg-black/40 border border-white/10 items-center justify-center mb-3">
              <Icon name="Ticket" size={28} color="#fff" />
            </View>
            <Text className="text-white font-semibold text-sm mb-1">{t("ppv.title")}</Text>
            <Text className="text-white/70 text-xs">
              {t("feedCard.unlockFor", { price: formatCompactNumber(payPerViewAmount), symbol: payPerViewTokenSymbol })}
            </Text>
          </View>
        </Pressable>
      );
    }

    // Subscriber-gated image: same blur, different ask. Tapping opens the
    // creator profile, where the Subscriptions tab sells the plan for real.
    if (isActuallySubGated) {
      return (
        <Pressable
          onPress={handleSubscribePress}
          className={edgeMedia ? "overflow-hidden" : "mt-2 rounded-xl overflow-hidden"}
          style={{ height: (edgeMedia ? SCREEN_WIDTH : IMAGE_WIDTH) * 0.75 }}
        >
          <SmartImage
            source={{ uri: lockedPreviewUri }}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={lockedPreviewUri}
            priority={prioritizeMedia ? "high" : "normal"}
            blurRadius={20}
          />
          <View className="absolute inset-0 dark-surface bg-black/30 items-center justify-center">
            <View className="w-14 h-14 rounded-2xl dark-surface bg-black/50 items-center justify-center mb-2">
              <Icon name="Star" size={24} color="#fff" />
            </View>
            <Text className="text-white text-sm font-semibold">{t("feedCard.subscribersOnly")}</Text>
            <Text className="text-white/70 text-xs mt-0.5">{username ? t("feedCard.subscribeTo", { name: username }) : t("feedCard.subscribeToCreator")}</Text>
          </View>
        </Pressable>
      );
    }

    // Holdings-only locked image: blurred preview with lock overlay
    if (isActuallyLockedHoldings) {
      return (
        <Pressable
          onPress={handleCardPress}
          className={edgeMedia ? "overflow-hidden" : "mt-2 rounded-xl overflow-hidden"}
          style={{ height: (edgeMedia ? SCREEN_WIDTH : IMAGE_WIDTH) * 0.75 }}
        >
          <SmartImage
            source={{ uri: lockedPreviewUri }}
            style={{ width: "100%", height: "100%" }}
            recyclingKey={lockedPreviewUri}
            priority={prioritizeMedia ? "high" : "normal"}
            blurRadius={20}
          />
          <View className="absolute inset-0 dark-surface bg-black/30 items-center justify-center">
            <View className="absolute top-3 left-3 flex-row items-center gap-1 dark-surface bg-black/60 rounded-full px-2.5 py-1" style={lockBadgeTop}>
              <Icon name="Lock" size={12} color="#fff" />
              <Text className="text-white text-xs font-medium">
                {formatCompactNumber(lockContentAmount)} {lockContentTokenSymbol}
              </Text>
            </View>
            <View className="w-16 h-16 rounded-xl dark-surface bg-black/40 border border-white/10 items-center justify-center mb-3">
              <Icon name="Lock" size={28} color="#fff" />
            </View>
            <Text className="text-white font-semibold text-sm mb-1">{t("feedCard.holdingsRequired")}</Text>
            <Text className="text-white/70 text-xs">
              {t("feedCard.mustHold", { amount: formatCompactNumber(lockContentAmount), symbol: lockContentTokenSymbol })}
            </Text>
          </View>
        </Pressable>
      );
    }

    if (!hasMultipleImages) {
      return (
        <PostTapSurface
          resetKey={postKey}
          onPress={() => handleImagePress(0)}
          onReaction={handleVideoTapReaction}
          style={{ alignSelf: "stretch", marginTop: edgeMedia ? 0 : 8 }}
        >
          <ContainedFeedImage
            active={isVisible}
            uri={galleryImages[0]}
            width={isMinimal || edgeMedia ? SCREEN_WIDTH : SINGLE_IMAGE_WIDTH}
            fallbackWidth={isMinimal || edgeMedia ? SCREEN_WIDTH : SINGLE_IMAGE_WIDTH}
            priority={prioritizeMedia ? "high" : "normal"}
            postPage={immersive}
          />
        </PostTapSurface>
      );
    }
    const gallery = (
      <FeedImageGallery
        key={galleryImages.join('|')}
        images={galleryImages}
        width={itemWidth}
        fallbackWidth={IMAGE_WIDTH}
        active={isVisible}
        prioritizeMedia={prioritizeMedia}
        onLayout={handleGalleryLayout}
        onImagePress={handleImagePress}
        onReaction={handleVideoTapReaction}
        postPage={immersive}
      />
    );

    return (
      <View className={edgeMedia ? undefined : "mt-2"}>
        {/* Inside Home's swipe pager, paging through this gallery has to win
            over the page turn — without the guard the pager's pan clears its
            threshold first and cancels the gallery scroll mid-drag. Elsewhere
            (profile, search) the hook returns null and this renders bare. */}
        {scrollGuard ? <GestureDetector gesture={scrollGuard}>{gallery}</GestureDetector> : gallery}
      </View>
    );
  };

  const renderVideoThumbnail = () => (
    <FeedVideoPlayer
      thumbnail={thumbnail}
      postPage={fullContent}
      videoUrl={isActuallyGated ? undefined : (getVideoUrl(tokenId) || undefined)}
      transcodingStatus={item.transcodingStatus}
      isOwner={!!isOwnerPost}
      duration={duration}
      tokenId={tokenId}
      creator={minterAddress}
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
      isAutoplayActive={isAutoplayActive}
      isSignedIn={isSignedIn}
      onPress={handleCardPress}
      onTapReaction={handleVideoTapReaction}
      onPPVPress={DIGITAL_PURCHASES_ENABLED ? handlePPVPress : undefined}
      onLockPress={handleCardPress}
      onBountyPress={handleBountyBadgePress}
    />
  );

  // What a live card says when there is no picture to show — behind the player
  // while it opens, and alone when there is nothing to play. The stream's own
  // title where it has one, otherwise what the card is.
  const liveFallbackLabel =
    title || (isCurrentlyLive ? t("stages.liveNow") : t("feedCard.stream"));

  const renderLiveThumbnail = () => (
    <Pressable
      onPress={handleCardPress}
      className="relative w-full h-48 bg-zinc-800 rounded-xl overflow-hidden mt-2"
      style={cinematicMedia ? { marginTop: 0, borderRadius: 0, height: Math.round((SCREEN_WIDTH * 9) / 16) } : undefined}
    >
      {isCurrentlyLive && isVisible && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 2 }]}>
          <LiveFeedReactionFlow
            streamId={liveReactionStreamId}
            selfAddress={userAddress ? String(userAddress).toLowerCase() : null}
            self={selfLiveReaction}
          />
        </View>
      )}
      {livePlayableUrl && !isActuallyGated ? (
        /* On air: play the stream in the card; once it has ended, its replay.
           The feed used to show a poster (often none at all, since the
           self-hosted ingest renders none) and the stream only appeared after
           opening the post. */
        <LiveFeedPreview
          url={livePlayableUrl}
          thumbnail={hasThumb ? thumbnail : undefined}
          active={isVisible && isAutoplayActive}
          label={liveFallbackLabel}
        />
      ) : hasThumb ? (
        <SmartImage
          source={{ uri: thumbnail }}
          // A STYLE, not a className. SmartImage renders expo-image, which
          // NativeWind does not know: className reaches it as an unrecognised
          // prop and is dropped, so this poster had no size, no position, and
          // never even issued a request — a live post with a perfectly good
          // cover on the CDN rendered as an empty slab, and the whole Live tab
          // was a wall of them. Every other SmartImage in the app is styled
          // this way; this one call site was the exception.
          style={StyleSheet.absoluteFill}
          recyclingKey={thumbnail}
          priority={prioritizeMedia ? "high" : "normal"}
          onError={() => setFailedLiveThumbnail(thumbnail)}
        />
      ) : (
        /* Last resort: no cover, no provider poster, nothing on the post.
           Says what it is rather than rendering as an empty grey slab — a
           blank box reads as a broken image, which is exactly how this was
           being reported. */
        <View className="absolute inset-0 w-full h-full bg-zinc-900 items-center justify-center px-6">
          <Icon name="Radio" size={32} color="#6F7174" />
          <Text
            numberOfLines={2}
            style={{ color: "#8B8D90", fontSize: 12, marginTop: 8, textAlign: "center" }}
          >
            {liveFallbackLabel}
          </Text>
        </View>
      )}
      {status && (chipOverMedia ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: mediaBand - 8, left: CINEMATIC_EDGE - 8 }]}>
          <StatusBadge status={status} />
        </View>
      ) : <StatusBadge status={status} />)}
      {isHidden && !chipOverMedia && (
        <View className="absolute top-2 right-2 flex-row items-center dark-surface bg-black/60 rounded-full px-2 py-1 z-20">
          <Icon name="EyeOff" size={12} color="#6F7174" />
          <Text style={{ color: "#8B8D90", fontSize: 10, marginLeft: 4 }}>{t("settings.hiddenOption")}</Text>
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
      {DIGITAL_PURCHASES_ENABLED && isPayPerView && (
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

  // Minimal: media runs edge to edge while the text keeps its inset. Only the
  // picture bleeds — an audio post's player stays in the column with the text.
  const bleed = (node: React.ReactNode) =>
    isMinimal && !immersive && !flat && node ? (
      <View style={{ marginHorizontal: -MINIMAL_TEXT_INSET }}>{node}</View>
    ) : node;

  const renderContent = () => {
    switch (contentType) {
      case "live":
        return bleed(renderLiveThumbnail());
      // Shorts render identically to normal videos in the feed — same player
      // with full controls, no special "short" badge — to match the web app.
      case "short":
      case "video":
        return bleed(renderVideoThumbnail());
      case "audio":
        return (
          <>
            {bleed(renderImageContent())}
            {tokenId != null && (
              // Keyed on the post: a fresh player per post rather than a
              // reset of its progress, duration, style, mute, lock-screen
              // claim, pending seek and recorded listen one by one.
              <AudioPostPlayer
                key={postKey}
                audioUrl={getAudioUrl(item.audioUrl!)}
                duration={item.audioDuration || 0}
                tokenId={tokenId}
                isVisible={isVisible}
                isSignedIn={isSignedIn}
                title={title}
                artist={displayName}
                artworkUrl={avatar || undefined}
                topLeftAction={isBounty ? (
                  <TouchableOpacity
                    accessibilityLabel={t("drawers.bountyTitle")}
                    onPress={handleBountyBadgePress}
                    className="flex-row items-center gap-1 rounded-xl bg-white/10 px-2 py-1"
                  >
                    <Icon name="Gift" size={12} color="#fff" />
                    <Text className="text-white text-xs font-medium">{formatCompactNumber(bountyAmount)} {bountyTokenSymbol}</Text>
                  </TouchableOpacity>
                ) : undefined}
              />
            )}
          </>
        );
      case "image":
      default:
        return bleed(renderImageContent());
    }
  };

  // A live post is a post: the same reaction bar as every other card, not a
  // stream-only heart. The heart posted to a counter on the stream document
  // that nothing else read, so a like on the feed never reached the post.
  const showActionBar = true;

  // Owners and already-entitled viewers can still read their PPV content.
  // Only unavailable purchases and reward entries are omitted on iOS.
  if (isPostHiddenByStorefront(DIGITAL_PURCHASES_ENABLED, accessInfo, isBounty, ppvUnlocked)) {
    return null;
  }

  const actionBar = showActionBar ? (
    <FeedActionBar
      liked={liked}
      disliked={disliked}
      saved={saved}
      reposted={reposted}
      likeCount={likeCount}
      dislikeCount={dislikeCount}
      commentCount={commentCount}
      repostCount={repostCount}
      shareCount={shareCount}
      tipCount={totalTips}
      onLike={handleLikePress}
      onDislike={handleDislikePress}
      onReact={handleReaction}
      myReaction={myReaction}
      reactionCounts={reactionCounts}
      onComment={handleCommentPress}
      onCommentPressIn={handleCommentPressIn}
      onShare={handleOpenShare}
      onTip={DIGITAL_PURCHASES_ENABLED && !minterUser?.hideBadgeAndBalance ? handleTipPress : undefined}
      tokenId={tokenId}
      viewerAddress={userAddress}
      onSave={handleSavePress}
      onInfo={handleInfoPress}
      onShowReactionInfo={
        isOwnerPost && tokenId != null ? handleShowReactionInfo : undefined
      }
      isVisible={isVisible}
    />
  ) : null;

  // Every sheet a card can open. They float over the screen, so where they
  // sit in the card's tree does not matter; both layouts mount the same set.
  const sheets = (
    <>
      {showComments && tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
          commentsDisabled={localCommentsDisabled}
          forKids={localForKids}
          postCreator={{ address: minterAddress, displayName, username }}
        />
      )}

      {showReactionInfo && tokenId != null && (
        <ReactionInfoSheet
          visible={showReactionInfo}
          onClose={() => setShowReactionInfo(false)}
          tokenId={tokenId}
        />
      )}

      {DIGITAL_PURCHASES_ENABLED && showTipModal && minterAddress && !minterUser?.hideBadgeAndBalance ? (
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

      {DIGITAL_PURCHASES_ENABLED && showPPVModal && isPayPerView && tokenId != null && minterAddress ? (
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

      {DIGITAL_PURCHASES_ENABLED && showBountyModal && isBounty && tokenId != null && (
        <BountyInfoSheet
          chainId={(item as any).chainId || streamInfo?.addBountyChainId || 56}
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
          canReplaceVideo={
            !!isOwnerPost && !isLive && (contentType === "video" || contentType === "short")
          }
          // rawStatus doubles as the live-stream status on live posts, but a
          // live post is never 'signed', so the Mint post row cannot show up
          // on one by accident.
          postStatus={rawStatus}
          postChainId={(item as any).chainId}
          isHidden={isHidden}
          creatorDisplayName={displayName}
          creatorIdentifier={minterAddress || username || ""}
          isFollowing={isFollowingCreator}
          isFollowRequestPending={isFollowReqPending}
          currentTitle={localTitle}
          currentDescription={localDescription}
          currentArticleBody={localArticleBody}
          currentCategories={localCategories}
          currentCommentsDisabled={localCommentsDisabled}
          currentShopLinks={localShopLinks ?? (item as any).shopLinks}
          currentContentRating={localContentRating}
          currentForKids={localForKids}
          hideReportContent={isLive}
          hideEdit={isLive}
          isAudio={isAudioPost}
          onFollowChange={handleFollowChange}
          onVisibilityChange={handleVisibilityChange}
          onEditSuccess={handleEditSuccess}
          onDeleteSuccess={handleDeleteSuccess}
          onSendToDm={isSignedIn ? () => setShowShareToDm(true) : undefined}
          // The sheet is mounted below rather than inside the menu: the menu is
          // conditionally rendered, so onClose unmounts it and any state set in
          // the same handler goes with it.
          // Server-granted boost allowances also apply in the App Store build.
          onBoostPress={
            isOwnerPost && isSignedIn ? () => setShowBoost(true) : undefined
          }
          onGiftBoostPress={
            !isOwnerPost && isSignedIn && canGiftBoost
              ? () => setShowBoost(true)
              : undefined
          }
          onTranslatePress={handleTranslate}
          onTranslateImagePress={hasImages ? handleTranslateImage : undefined}
          canDub={isVideo && !isLive && !isActuallyGated && speechAvailable}
          // Also on the action bar as icons. Both are wanted: the icon is for
          // the thumb, the labelled row is for anyone who opens the menu
          // looking for the action by name.
          isSaved={saved}
          onToggleSave={handleSavePress}
          onInfoPress={handleInfoPress}
          // The cinematic card carries no AI button; the menu has it instead.
          onAskAi={cinematicFeed ? handleAiPress : undefined}
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

      {showBoost && tokenId != null && (
        <BoostSheet
          visible={showBoost}
          onClose={() => setShowBoost(false)}
          tokenId={tokenId}
          postTitle={localTitle || undefined}
          // Decides which HALF of the ladder the sheet offers: a gift only
          // lands on somebody else's post, everything else only on your own.
          isOwnPost={!!isOwnerPost}
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
    </>
  );

  if (cinematicFeed) {
    const viewsLabel = t("comments.viewCount", { count: views }).replace(
      String(views),
      formatCompactNumber(views),
    );
    const chipMeta = [timeAgo, viewsLabel].filter(Boolean).join(" · ");
    const embeds = matureGate.isGated ? null : (
      <>
        {(item as any).isQuotePost && (
          <QuotedPostEmbed
            key={postKey}
            quotedPost={(item as any).quotedPost}
            quotedTokenId={(item as any).quotedTokenId}
          />
        )}
        <DehubLinkCards links={dehubLinks} />
        <LinkPreviewCard key={postKey} text={captionText} />
        <AssetRefCards refs={assetRefs} />
      </>
    );
    const translateButton = showTranslate ? (
      <TranslateButton
        isTranslated={isTranslated}
        isLoading={translating}
        detectedLanguage={translationSourceLang}
        onTranslate={handleTranslate}
        onShowOriginal={handleShowOriginal}
        inline
      />
    ) : null;
    const soundtrackBadge = hasSoundtrack && !isActuallyGated ? (
      <View className="mt-2">
        <SoundtrackBadge
          key={postKey}
          title={soundtrack.title}
          creator={soundtrack.creator}
          url={soundtrack.url}
          isVisible={isVisible}
        />
      </View>
    ) : null;
    const labels = hasLabels ? (
      <View style={{ paddingHorizontal: CINEMATIC_TEXT_INSET, paddingBottom: 8, paddingTop: chromeInset, gap: 6 }}>
        {showRepostLabel && (
          <View className="flex-row items-center gap-1.5">
            <Icon name="Repeat2" size={14} color="#9CA3AF" />
            <Text className="text-xs text-theme-neutrals-400">{t("feedCard.reposted")}</Text>
          </View>
        )}
        {!!(item as any).__boosted && (
          <TouchableOpacity
            onPress={() => navigation.navigate(ScreenNames.SuperPowers)}
            accessibilityRole="button"
            accessibilityLabel={t("feedCard.openSuperPowers")}
            hitSlop={6}
            className="flex-row items-center gap-1.5"
          >
            <Icon name="Rocket" size={14} color="#9CA3AF" />
            <Text className="text-xs uppercase tracking-wider text-theme-neutrals-400">
              {t("work.boosted")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    ) : null;

    return (
      <Pressable
        onPress={disablePress ? undefined : handleCardPress}
        disabled={disablePress}
        // No bento: the post steps out over the list's side padding so its
        // media spans the screen, and posts are split by a hairline across
        // the whole width with 12pt of room either side of it.
        onLayout={handleMinimalLayout}
        // The first row starts flush with the top of the list, under the
        // capsule; leadInset (or the labels) makes the room instead.
        style={[styles.cinematicPost, { marginHorizontal: -minimalGutter }, chromeInset ? { paddingTop: 0 } : null, hideDivider ? { borderBottomWidth: 0 } : null]}
      >
        {labels}
        {cinematicMedia && !chipOverMedia ? (
          // A photo: the ordinary header row above it, the picture edge to edge.
          <>
            <View style={{ paddingHorizontal: CINEMATIC_TEXT_INSET, paddingTop: leadInset }}>
              <FeedCardHeader
                avatarUrl={avatar}
                displayName={displayName}
                username={username}
                address={minterAddress}
                badgeImage={badgeImg}
                onUserPress={handleUserPress}
                onMenuPress={handleOpenOptions}
                onBoostPress={
                  isOwnerPost && isSignedIn && tokenId != null
                    ? handleBoostPress
                    : undefined
                }
                isHidden={isHidden}
              />
            </View>
            <View style={{ backgroundColor: "#000" }}>
              <FeedBleedContext.Provider value={feedBleed}>
                {renderContent()}
              </FeedBleedContext.Provider>
            </View>
          </>
        ) : cinematicMedia ? (
          // Raised while the tools menu is open so it hangs over the caption.
          <View style={{ backgroundColor: "#000", zIndex: toolsOpen ? 10 : 0 }}>
            <FeedBleedContext.Provider value={feedBleed}>
              {renderContent()}
            </FeedBleedContext.Provider>
            <View pointerEvents="box-none" style={[styles.cinematicChrome, chipAtBottom ? styles.cinematicBottom : styles.cinematicTop]}>
              <CinematicAuthorChip
                avatarUrl={avatar}
                displayName={displayName}
                username={username}
                address={minterAddress}
                badgeImage={badgeImg}
                meta={chipMeta}
                onPress={handleUserPress}
              />
              <View pointerEvents="box-none" style={styles.cinematicButtons}>
                {isHidden && <CinematicIconButton icon="EyeOff" label={t("settings.hiddenOption")} />}
                {isOwnerPost && isSignedIn && tokenId != null && (
                  <CinematicIconButton icon="Rocket" label={t("feedCard.boostPost")} onPress={handleBoostPress} />
                )}
                {mediaTools && mediaTools.length > 0 && (
                  <CinematicIconButton
                    icon="Wrench"
                    label={t("settings.title")}
                    active={toolsOpen}
                    onPress={() => setToolsOpen(!toolsOpen)}
                  />
                )}
                <CinematicIconButton icon="EllipsisVertical" label={t("player.moreOptions")} onPress={handleOpenOptions} />
              </View>
            </View>
            {toolsOpen && mediaTools && mediaTools.length > 0 && (
              <CinematicToolsMenu
                tools={mediaTools}
                fromBottom={chipAtBottom ? CINEMATIC_BOTTOM_BAND + 8 : undefined}
                onClose={() => setToolsOpen(false)}
              />
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: CINEMATIC_TEXT_INSET, paddingTop: leadInset }}>
            <FeedCardHeader
              avatarUrl={avatar}
              displayName={displayName}
              username={username}
              address={minterAddress}
              badgeImage={badgeImg}
              onUserPress={handleUserPress}
              onMenuPress={handleOpenOptions}
              onBoostPress={
                isOwnerPost && isSignedIn && tokenId != null
                  ? handleBoostPress
                  : undefined
              }
              isHidden={isHidden}
            />
            {matureGate.isGated ? (
              <MatureContentGate onReveal={matureGate.reveal} />
            ) : (
              <>
                {renderContent()}
                {soundtrackBadge}
                <PostTapSurface
                  resetKey={postKey}
                  onReaction={handleVideoTapReaction}
                  onPress={disablePress ? undefined : handleCardPress}
                >
                  {!!localArticleBody && (
                    <View className="mb-3">
                      <ArticleCover
                        look={articleUi}
                        label={`${t("articles.label")} · ${t("articles.minRead", { count: articleReadingMinutes(localArticleBody) })}`}
                        title={overlayTitle || undefined}
                        coverUri={item.articleImageUrl ? buildFeedImageUrls([item.articleImageUrl], IMAGE_WIDTH)[0] : undefined}
                      />
                    </View>
                  )}
                  <FeedCaption
                    resetKey={postKey}
                    title={localArticleBody ? undefined : overlayTitle || undefined}
                    description={displayCaption || undefined}
                    categories={localCategories}
                    onCategoryPress={onCategorySelect}
                    onCashtagPress={setActiveCashtag}
                    showCategories={false}
                    flagged={item.communityAlertStatus === "pending"}
                    variant={localArticleBody || isAudioPost ? "default" : "large"}
                  />
                  {!!localArticleBody && (
                    <View className="mt-3 flex-row">
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: articleUi.line, borderRadius: articleUi.radius ? 999 : 0, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Icon name="BookOpen" size={15} color={articleUi.ink2} />
                        <Text style={{ color: articleUi.ink2, fontSize: 13 }}>{t("articles.read")}</Text>
                      </View>
                    </View>
                  )}
                </PostTapSurface>
              </>
            )}
            <View className="flex-row items-center gap-2 pt-2">
              <Text style={{ fontSize: 13, lineHeight: 18, color: "#8B8D90" }}>
                {chipMeta}
              </Text>
              {translateButton && (
                <>
                  <Text style={{ fontSize: 13, lineHeight: 18, color: "#6F7174" }}>·</Text>
                  {translateButton}
                </>
              )}
            </View>
          </View>
        )}
        <View style={{ paddingHorizontal: CINEMATIC_TEXT_INSET }}>
          {cinematicMedia ? (
            // The caption sits under the media, then the soundtrack.
            <>
              <PostTapSurface
                resetKey={postKey}
                onReaction={handleVideoTapReaction}
                onPress={disablePress ? undefined : handleCardPress}
              >
                <View style={{ paddingTop: 10 }}>
                  <FeedCaption
                    resetKey={postKey}
                    title={overlayTitle || undefined}
                    description={displayCaption || undefined}
                    variant="media"
                    flagged={item.communityAlertStatus === "pending"}
                  />
                </View>
              </PostTapSurface>
              {soundtrackBadge}
            </>
          ) : null}
          {embeds}
          {tokenId != null && !isLive && !(item as any).isQuotePost && (
            <PollCard key={postKey} tokenId={Number(tokenId)} pollOwnerAddress={minterAddress} />
          )}
          {!isLive && (
            <ShopBoard
              key={postKey}
              tokenId={tokenId}
              links={localShopLinks ?? (item as any).shopLinks}
              listingCount={localShopListingCount ?? (item as any).shopListingCount}
            />
          )}
          {cinematicMedia && translateButton ? (
            // Time and views ride on the author chip; what is left of the
            // meta row is the translate toggle, at the end of the post.
            <View className="flex-row items-center justify-end pt-2">{translateButton}</View>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: CINEMATIC_TEXT_INSET, paddingTop: 4 }}>
          {actionBar}
        </View>
        {sheets}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={disablePress ? undefined : handleCardPress}
      disabled={disablePress}
      // Matches the web feed tile (dehubweb HomeFeed.tsx:1066 + index.css:1264):
      // translucent white fill and hairline rather than an opaque grey outline,
      // 6pt vertical margin = 12pt inter-card gap (web `space-y-3`, was 8pt),
      // and one 12pt inset on every edge. Keeping the action row's bottom
      // inset equal to its side inset makes the controls sit squarely in the
      // bento instead of looking dropped toward its lower edge.
      //
      // Minimal (web `html[data-theme="minimal"] [data-feed-item]`): no bento
      // at all. The card steps out over the list's side padding to span the
      // screen, posts are split by one full-width hairline, and media bleeds
      // past the text inset to both edges.
      onLayout={isMinimal && !immersive && !flat ? handleMinimalLayout : undefined}
      style={immersive ? {
        paddingHorizontal: IMMERSIVE_INSET,
        paddingBottom: 12,
      } : flat ? {
        // Post page, no media on top: the same flat full-width sheet as an
        // immersive post, minus the media. Matches the web post page.
        paddingTop: 12,
        paddingHorizontal: IMMERSIVE_INSET,
        paddingBottom: 12,
      } : isMinimal ? {
        marginHorizontal: -minimalGutter,
        paddingTop: 14,
        paddingHorizontal: MINIMAL_TEXT_INSET,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: MINIMAL_HAIRLINE,
      } : skin ? [
        // A canvas theme's bento (theme/skins.ts): smoked glass, War's cyan
        // frame, Osaka's slate with a pink edge, Jungle's plank.
        skin.card,
        { paddingTop: 12, paddingHorizontal: 12, paddingBottom: 12, marginVertical: 6 },
      ] : {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: FEED_BENTO_RADIUS,
        paddingTop: 12,
        paddingHorizontal: 12,
        paddingBottom: 12,
        marginVertical: 6,
      }}
    >
      {skin?.grain && !flat ? (
        <Image
          source={GRAIN}
          resizeMode="repeat"
          style={[StyleSheet.absoluteFill, { borderRadius: skin.card.borderRadius }]}
        />
      ) : null}
      {showRepostLabel && (
        <View className="flex-row items-center gap-1.5 mb-2">
          <Icon name="Repeat2" size={14} color="#9CA3AF" />
          <Text className="text-xs text-theme-neutrals-400">{t("feedCard.reposted")}</Text>
        </View>
      )}
      {/*
        A boosted post says so. Not a legal point, a product one: the feed's
        whole pitch is that engagement decides reach, and an unlabelled paid
        slot at position zero makes that untrue. Web has carried this label
        since the feature shipped; the phone did not, so the same post read as
        organic on Android and as paid on the web.
      */}
      {!!(item as any).__boosted && (
        <View className="flex-row items-center gap-1.5 mb-2">
          <TouchableOpacity
            onPress={() => navigation.navigate(ScreenNames.SuperPowers)}
            accessibilityRole="button"
            accessibilityLabel={t("feedCard.openSuperPowers")}
            hitSlop={6}
            className="flex-row items-center gap-1.5"
          >
            <Icon name="Rocket" size={14} color="#9CA3AF" />
            <Text className="text-xs uppercase tracking-wider text-theme-neutrals-400">
              {t("work.boosted")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Immersive: the media comes first, out past the text inset to both
          screen edges. A post behind the mature warning keeps the warning in
          its usual place instead. */}
      {immersive && !matureGate.isGated && (
        <View style={{ marginHorizontal: -IMMERSIVE_INSET, marginBottom: 12 }}>
          {renderContent()}
        </View>
      )}
      {/* No wrapper row: the header is a full-width row of its own, and a
          card is ~100 native views, each one paid for at mount mid-fling. */}
      <FeedCardHeader
        avatarUrl={avatar}
        displayName={displayName}
        username={username}
        address={minterAddress}
        badgeImage={badgeImg}
        onUserPress={handleUserPress}
        onMenuPress={handleOpenOptions}
        onAiPress={handleAiPress}
        onBoostPress={
          isOwnerPost && isSignedIn && tokenId != null
            ? handleBoostPress
            : undefined
        }
        isHidden={isHidden}
      />

      {/* Everything the post actually says — media, caption, embeds — sits
          behind the warning together. A text post's body is its content, so
          hiding only the media would warn about nothing. The header above and
          the timestamp/action bar below stay live, so a post can be reported
          or opened without being read first. */}
      {matureGate.isGated ? (
        <MatureContentGate onReveal={matureGate.reveal} />
      ) : (
        <>
      {!immersive && renderContent()}

      {hasSoundtrack && !isActuallyGated && (
        <View className="mt-2">
          <SoundtrackBadge
            key={postKey}
            title={soundtrack.title}
            creator={soundtrack.creator}
            url={soundtrack.url}
            isVisible={isVisible}
          />
        </View>
      )}

      {/* Without onPress this surface still stops propagation, so a single
          tap on the caption reached nobody: the card's own press never fired
          and the post did not open. */}
      <PostTapSurface
        resetKey={postKey}
        onReaction={handleVideoTapReaction}
        onPress={disablePress ? undefined : handleCardPress}
      >
      {!!localArticleBody && (
        <View className="mx-4 mb-3">
          <ArticleCover
            look={articleUi}
            label={fullContent ? t("articles.label") : `${t("articles.label")} · ${t("articles.minRead", { count: articleReadingMinutes(localArticleBody) })}`}
            title={(isTranslated ? translatedTexts.title : localTitle) || undefined}
            coverUri={item.articleImageUrl ? buildFeedImageUrls([item.articleImageUrl], IMAGE_WIDTH)[0] : undefined}
            meta={fullContent ? [createdAt ? new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null, t("articles.minRead", { count: articleReadingMinutes(localArticleBody) })].filter(Boolean).join(" · ") : undefined}
            hero={fullContent}
          />
        </View>
      )}
      <FeedCaption
        resetKey={postKey}
        title={localArticleBody ? undefined : (isTranslated ? translatedTexts.title : localTitle) || undefined}
        description={displayCaption || undefined}
        categories={localCategories}
        onCategoryPress={onCategorySelect}
        onCashtagPress={setActiveCashtag}
        fullContent={fullContent}
        showCategories={fullContent}
        flagged={item.communityAlertStatus === "pending"}
      />
      {!!localArticleBody && (fullContent && (isOwnerPost || (!isLocked && (!streamInfo?.isPayPerView || ppvUnlocked) && !isActuallySubGated)) ? (
        <View className="mx-4 mt-4"><ArticleReaderBody body={localArticleBody} look={articleUi} /></View>
      ) : (
        <View className="mx-4 mt-3 flex-row">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: articleUi.line, borderRadius: articleUi.radius ? 999 : 0, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Icon name="BookOpen" size={15} color={articleUi.ink2} />
            <Text style={{ color: articleUi.ink2, fontSize: 13 }}>{t("articles.read")}</Text>
          </View>
        </View>
      ))}
      </PostTapSurface>

      {(item as any).isQuotePost && (
        <QuotedPostEmbed
          key={postKey}
          quotedPost={(item as any).quotedPost}
          quotedTokenId={(item as any).quotedTokenId}
        />
      )}

      {/* DeHub entity cards — stage, post, profile, community, invite, store,
          item, event, bounty. Placed after the quote embed to match web's PostCard. */}
      <DehubLinkCards links={dehubLinks} />

      {/* OG-style preview for the first outside link, when the caption didn't
          already earn one of the entity cards above. */}
      <LinkPreviewCard key={postKey} text={captionText} />

      {/* Market cards — a contract address somebody pasted, or a $TICKER */}
      <AssetRefCards refs={assetRefs} />
        </>
      )}


      {/* The poll, quote, link preview, soundtrack and shop pieces are keyed
          on the post. Each holds per-post state of its own (a vote, a fetched
          preview, an open board), and they are small enough that a fresh one
          per post is simpler than resetting each. */}
      {tokenId != null && !isLive && !(item as any).isQuotePost && (
        <PollCard key={postKey} tokenId={Number(tokenId)} pollOwnerAddress={minterAddress} />
      )}

      {/* The creator's Shop board — affiliate links, opened in a sheet. The
          live card links through to the player, which draws its own overlay
          button, so a second one here would be the same board twice. */}
      {!isLive && (
        <ShopBoard
          key={postKey}
          tokenId={tokenId}
          links={localShopLinks ?? (item as any).shopLinks}
          listingCount={localShopListingCount ?? (item as any).shopListingCount}
        />
      )}

      <View className="flex-row items-center gap-2 pt-3">
        {/* Time and dot are one native text with two spans, and the view
            count sits directly in the row (the -4 keeps its 4px gap to the
            icon under the row's 8px gap). Two views fewer per card. */}
        <Text style={{ fontSize: 13, lineHeight: 18, color: "#8B8D90" }}>
          {timeAgo}
          <Text style={{ color: "#6F7174" }}>{"  ·"}</Text>
        </Text>
        <Icon
          name={isAudioPost ? "Headphones" : isLive ? "Radio" : "Eye"}
          size={13}
          color="#6F7174"
        />
        {/* One number for every post type, same as web: the icon says what
            kind of post it is, the count is always the post's own views. An
            audio post's listen tally lives inside the player, where it is
            labelled; printed here it read as the view count and undercounted
            by an order of magnitude. */}
        <Text style={{ fontSize: 13, lineHeight: 18, color: "#8B8D90", marginLeft: -4 }}>
          {formatCompactNumber(views)}
        </Text>
        {isLive && peakAudience > 0 && (
          <>
            <Text style={{ fontSize: 13, lineHeight: 18, color: "#6F7174" }}>·</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, color: "#6F7174" }}>
              Peak: {formatCompactNumber(peakAudience)}
            </Text>
          </>
        )}
        {showTranslate && (
          <>
            <Text style={{ fontSize: 13, lineHeight: 18, color: "#6F7174" }}>·</Text>
            <TranslateButton
              isTranslated={isTranslated}
              isLoading={translating}
              detectedLanguage={translationSourceLang}
              onTranslate={handleTranslate}
              onShowOriginal={handleShowOriginal}
              inline
            />
          </>
        )}
      </View>

      {actionBar}

      {sheets}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cinematicPost: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  cinematicChrome: {
    position: "absolute",
    left: CINEMATIC_EDGE,
    right: CINEMATIC_EDGE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cinematicTop: { top: CINEMATIC_EDGE },
  cinematicBottom: { bottom: CINEMATIC_BOTTOM_LIFT },
  cinematicButtons: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 8 },
});

const FeedCard = memo(FeedCardComponent);

export default FeedCard;
