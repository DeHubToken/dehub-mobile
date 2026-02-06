import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistance } from "date-fns";
import { formatCompactNumber } from "../../libs/numbers.util";
// Using RN ScrollView to avoid RNGH old API PanGestureHandler issues
import VideoPlayerSkeleton from "./VideoPlayerSkeleton";
import VideoArea from "./VideoArea";
import ActionsRow from "./ActionsRow";
import DescriptionBlock from "./DescriptionBlock";
import BountyClaimBanner from "./BountyClaimBanner";
import { getVideoUrl, getAvatarUrl } from "../../libs/misc";
import { useAuth } from "../../context/AuthContext";
import TopCommentPreview from "./TopCommentPreview";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { getNFT, recordView } from "../../services";
import {
  followUser,
  unfollowUser,
} from "../../services/user.service";
import { toastError } from "../../libs";
import CreatorRow from "./CreatorRow";
import SuggestedVideos, { SuggestedVideosHandle } from "./SuggestedVideos";
import { ScrollView } from "react-native-gesture-handler";
import { CommentBottomSheet } from "../Comments";

interface NormalVideoPlayerProps {
  tokenId?: string | number;
  videoUrl: string | null; // playable URL when free (or after unlock)
  minter?: string;
  description?: string;
  title?: string;
  views?: number;
  totalTips?: number;
  createdAt?: string | number | Date;
  userDisplay?: { avatar?: string; name?: string; subscribers?: number } | null;
  accessInfo?: any; // { streamStatus: { isFree, isLockedWithLockContent, isLockedWithPPV } ... }
  isTranscoding?: boolean;
}

const NormalVideoPlayer: React.FC<NormalVideoPlayerProps> = ({
  tokenId,
  videoUrl,
  minter,
  title,
  description,
  views = 0,
  totalTips = 0,
  createdAt,
  userDisplay,
  accessInfo,
  isTranscoding,
}) => {
  const { user, isSignedIn, requireAuth } = useAuth();
  const [showDesc, setShowDesc] = useState(false);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  // Comments bottom sheet state (using shared CommentBottomSheet like HomeFeedCard)
  const [showComments, setShowComments] = useState(false);
  const createdAtDate = createdAt ? new Date(createdAt) : new Date();
  // NFT fetch & metadata loading
  const [nftLoading, setNftLoading] = useState<boolean>(false);
  const [nftData, setNftData] = useState<any | null>(null);
  const [privateError, setPrivateError] = useState(false);
  // Recompute access based on latest user.unlock and nft data; fallback to prop
  const accessComputed = useStreamAccessInfo(nftData);
  const resolvedAccessInfo = accessComputed?.streamStatus
    ? accessComputed
    : accessInfo;
  const isFree = resolvedAccessInfo?.streamStatus?.isFree === true;
  const isLockedOrPPV = !!(
    resolvedAccessInfo?.streamStatus && !resolvedAccessInfo.streamStatus.isFree
  );

  // Always fetch single NFT data (if tokenId provided) regardless of free/locked to standardize metadata & video URL
  useEffect(() => {
    let cancelled = false;
    const fetchNFT = async () => {
      if (tokenId == null) return;
      setNftLoading(true);
      try {
        const res: any = await getNFT(tokenId as any);
        if (!cancelled) {
          setPrivateError(false);
          const payload = res?.result || res || null;
          setLikes(payload?.totalVotes?.for || 0);
          setDislikes(payload?.totalVotes?.against || 0);
          setNftData(payload);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message || e?.toString() || '';
          if (msg.toLowerCase().includes('private account')) {
            setPrivateError(true);
          }
          setNftData(null);
        }
        console.warn("[NormalVideoPlayer] NFT fetch failed", e);
      } finally {
        if (!cancelled) setNftLoading(false);
      }
    };
    fetchNFT();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  // Suggestions moved to SuggestedVideos component

  // Use minterUser from NFT response instead of separate API call - much faster!
  // Creator data is already included in getNFT response as minterUser
  const creator = useMemo(() => {
    const minterUser = nftData?.minterUser;
    if (!minterUser) return null;
    // Map minterUser fields to creator format expected by CreatorRow
    return {
      username: minterUser.username,
      displayName: minterUser.displayName,
      address: minterUser.address,
      walletAddress: minterUser.address,
      avatarImageUrl: minterUser.avatarImageUrl,
      followers: minterUser.followers || [],
      stakedDHB: minterUser.staked || 0,
    };
  }, [nftData?.minterUser]);

  // isFollowing comes directly from getNFT response
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isFollowRequestPending, setIsFollowRequestPending] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);

  // Sync isFollowing state when nftData changes
  useEffect(() => {
    if (nftData?.isFollowing !== undefined) {
      setIsFollowing(nftData.isFollowing);
    }
    if ((nftData as any)?.isFollowRequestPending !== undefined) {
      setIsFollowRequestPending(!!(nftData as any).isFollowRequestPending);
    }
  }, [nftData?.isFollowing, (nftData as any)?.isFollowRequestPending]);

  // Creator loading follows NFT loading since creator data comes from NFT response
  const creatorLoading = nftLoading;

  const effectiveVideoUrl = useMemo(() => {
    if (isTranscoding) return null;
    const st = resolvedAccessInfo?.streamStatus;
    const isPlayable = st
      ? !st.isLockedWithLockContent && !st.isLockedWithPPV
      : isFree;
    if (isPlayable) return getVideoUrl(tokenId) || (videoUrl ?? null);
    return null;
  }, [isTranscoding, resolvedAccessInfo, videoUrl, tokenId]);

  // --- View recording: 10% or 3s threshold (matches web), signed-in only, once per view ---
  const hasRecordedRef = useRef(false);
  const pendingRecordRef = useRef(false);
  const suggestedRef = useRef<SuggestedVideosHandle>(null);
  const onProgressRecord = async (positionMs: number, durationMs: number) => {
    if (hasRecordedRef.current || pendingRecordRef.current) return;
    if (!isSignedIn) return;
    // Threshold: 10% of duration OR 3 seconds, whichever comes first
    const THREE_SECONDS = 3000;
    const TEN_PERCENT = 0.10;
    const threshold = durationMs && durationMs > 0 
      ? Math.min(durationMs * TEN_PERCENT, THREE_SECONDS) 
      : THREE_SECONDS;
    if (positionMs + 200 < threshold) return; // small epsilon
    pendingRecordRef.current = true;
    try {
      await recordView(tokenId as any);
      hasRecordedRef.current = true;
    } catch (e) {
      // allow retry later if it failed
      console.warn(
        "[NormalVideoPlayer] recordView failed, will retry on next eligible progress",
        e
      );
    } finally {
      pendingRecordRef.current = false;
    }
  };

  const resolvedTitle =
    title || nftData?.name || nftData?.title || nftData?.result?.title;
  const resolvedDescription =
    nftData?.description || nftData?.result?.description || description;
  const resolvedViews = (nftData?.views ??
    nftData?.result?.views ??
    views) as number;
  const resolvedTotalTips = (nftData?.totalTips ??
    nftData?.result?.totalTips ??
    totalTips) as number;
  const resolvedCreatedAt =
    nftData?.createdAt || nftData?.result?.createdAt || createdAtDate;
  const resolvedCategories: string[] =
    nftData?.category || nftData?.result?.category || [];

  const handleScroll = useCallback((e: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = e?.nativeEvent || {};
    if (!layoutMeasurement || !contentOffset || !contentSize) return;
    const paddingToBottom = 320;
    if (
      layoutMeasurement.height + contentOffset.y >=
      contentSize.height - paddingToBottom
    ) {
      suggestedRef.current?.loadMore();
    }
  }, []);

  const handleFollow = useCallback(() => {
    if (!creator) return;
    if (isFollowing || isFollowRequestPending) return;
    const viewer = (user?.walletAddress || user?.address || "").toLowerCase();
    const target = (
      (creator?.walletAddress ||
        creator?.address ||
        creator?.username ||
        "") as string
    ).toLowerCase();
    if (!viewer || !target) return;
    requireAuth?.(async () => {
      setFollowLoading(true);
      // optimistic update
      setIsFollowing(true);
      try {
        const res = await followUser(viewer, target);
        if (res.status === 'pending') {
          setIsFollowing(false);
          setIsFollowRequestPending(true);
        }
      } catch (e) {
        // revert on error
        setIsFollowing(false);
        toastError("Failed to follow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [creator, isFollowing, isFollowRequestPending, user?.walletAddress, user?.address, requireAuth]);

  const handleUnfollow = useCallback(() => {
    if (!creator || followLoading) return;
    if (!isFollowing && !isFollowRequestPending) return;
    const viewer = (user?.walletAddress || user?.address || "").toLowerCase();
    const target = (
      (creator?.walletAddress ||
        creator?.address ||
        creator?.username ||
        "") as string
    ).toLowerCase();
    if (!viewer || !target) return;
    requireAuth?.(async () => {
      setFollowLoading(true);
      const wasPending = isFollowRequestPending;
      if (wasPending) {
        setIsFollowRequestPending(false);
      } else {
        setIsFollowing(false);
      }
      try {
        await unfollowUser(viewer, target);
      } catch (e) {
        // revert on error
        if (wasPending) {
          setIsFollowRequestPending(true);
        } else {
          setIsFollowing(true);
        }
        toastError(wasPending ? "Failed to cancel request" : "Failed to unfollow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [creator, isFollowing, isFollowRequestPending, followLoading, user?.walletAddress, user?.address, requireAuth]);

  // Comment count from NFT payload for preview
  const commentCount = useMemo(() => {
    const comments: any[] = Array.isArray((nftData as any)?.comments)
      ? ((nftData as any).comments as any[])
      : [];
    // Compute top-level comments count (exclude items that are listed as a replyId of another comment)
    const replyIdSet = new Set<number>();
    comments.forEach((c: any) => {
      if (Array.isArray(c?.replyIds)) {
        c.replyIds.forEach((id: any) => replyIdSet.add(Number(id)));
      }
    });
    return comments.filter((c: any) => !replyIdSet.has(Number(c?.id))).length;
  }, [nftData]);

  // Preview comment for TopCommentPreview
  const previewComment = useMemo(() => {
    const comments: any[] = Array.isArray((nftData as any)?.comments)
      ? ((nftData as any).comments as any[])
      : [];
    // Get top-level comments
    const replyIdSet = new Set<number>();
    comments.forEach((c: any) => {
      if (Array.isArray(c?.replyIds)) {
        c.replyIds.forEach((id: any) => replyIdSet.add(Number(id)));
      }
    });
    const topLevel = comments.filter((c: any) => !replyIdSet.has(Number(c?.id)));
    const c = topLevel[0];
    if (!c) return null;
    return {
      user: c?.writor?.username || (c?.address as string) || "",
      avatar: getAvatarUrl(c?.writor?.avatarUrl) || undefined,
      text: String(c?.content || "").replace(/<[^>]+>/g, ""),
    };
  }, [nftData]);

  // Handler to open comments
  const handleOpenComments = useCallback(() => {
    setShowComments(true);
  }, []);

  return (
    <View className="flex-1" key="loaded-player">
      {privateError ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
            <Ionicons name="lock-closed" size={40} color="#666" />
          </View>
          <Text className="text-white text-lg font-bold text-center mb-2">
            Private Content
          </Text>
          <Text className="text-gray-400 text-center text-sm leading-5">
            This content is from a private account. Follow the creator to view their posts.
          </Text>
        </View>
      ) : (
        <>
      <VideoArea
        isTranscoding={!!isTranscoding}
        isLockedOrPPV={!!isLockedOrPPV}
        lockedFetchLoading={nftLoading && isLockedOrPPV}
        effectiveVideoUrl={effectiveVideoUrl}
        accessInfo={resolvedAccessInfo}
        streamInfo={nftData?.streamInfo || nftData?.result?.streamInfo}
        minter={nftData?.minter || nftData?.result?.minter || (minter as any)}
        tokenId={tokenId as any}
        onProgress={onProgressRecord}
      />
      {/* Scrollable metadata & interactions */}
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        pointerEvents="auto"
        contentContainerStyle={{ paddingBottom: 80 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View className="px-4 pt-2">
          <Text
            className="text-theme-neutrals-100 font-semibold text-base"
            numberOfLines={2}
          >
            {(resolvedTitle || "")?.slice(0, 60)}
            {resolvedTitle && resolvedTitle.length > 60 ? "…" : ""}
          </Text>
          <Text className="text-theme-neutrals-400 text-[11px] mt-1">
            {formatDistance(new Date(resolvedCreatedAt), new Date(), {
              addSuffix: true,
            })}{" "}
            • {resolvedViews.toLocaleString()} views •{" "}
            {formatCompactNumber(resolvedTotalTips)} total tips
          </Text>
          <CreatorRow
            key={
              creatorLoading
                ? "creator-loading"
                : `creator-${
                    creator?.walletAddress || creator?.address || "none"
                  }`
            }
            loading={creatorLoading}
            creator={creator}
            viewerAddress={(user?.walletAddress || user?.address) as string}
            isFollowing={isFollowing}
            isFollowRequestPending={isFollowRequestPending}
            followLoading={followLoading}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            fallbackMinter={minter}
          />
          {nftLoading ? (
            <View className="flex-row mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <View
                  key={i}
                  className="h-9 w-16 rounded-full bg-theme-neutrals-800 mr-3 animate-pulse"
                />
              ))}
            </View>
          ) : (
            <ActionsRow
              tokenId={tokenId}
              minter={minter || nftData?.minter || nftData?.result?.minter}
              likes={likes}
              dislikes={dislikes}
              userVote={
                nftData?.isLiked || nftData?.result?.isLiked
                  ? "like"
                  : nftData?.isDisliked || nftData?.result?.isDisliked
                  ? "dislike"
                  : null
              }
              chainId={
                (nftData?.chainId ?? nftData?.result?.chainId) as any
              }
              mintTxHash={
                (nftData?.mintTxHash ?? nftData?.result?.mintTxHash) as any
              }
            />
          )}
          {/* Bounty Claim Banner - shown when video has bounty configured */}
          {!nftLoading && tokenId != null && (
            <BountyClaimBanner
              tokenId={tokenId}
              streamInfo={nftData?.streamInfo || nftData?.result?.streamInfo}
              minter={nftData?.minter || nftData?.result?.minter || minter}
            />
          )}
          {/* Description */}
          <DescriptionBlock
            description={resolvedDescription}
            categories={resolvedCategories}
            showDesc={showDesc}
            onToggle={() => setShowDesc((d) => !d)}
          />
          {/* Top Comment Preview or empty state - opens CommentBottomSheet like HomeFeedCard */}
          {nftLoading ? (
            <View className="mt-5">
              <View className="h-4 w-40 bg-theme-neutrals-800 rounded mb-2 animate-pulse" />
              <View className="h-3 w-56 bg-theme-neutrals-800 rounded animate-pulse" />
            </View>
          ) : (
            <>
              {commentCount > 0 && previewComment ? (
                <TopCommentPreview
                  comment={previewComment}
                  total={commentCount}
                  onOpen={handleOpenComments}
                />
              ) : (
                <TouchableOpacity
                  onPress={handleOpenComments}
                  activeOpacity={0.7}
                  className="mt-4 rounded-2xl border border-theme-neutrals-800 p-3"
                >
                  <View className="flex-row items-center justify-between px-1">
                    <Text className="text-theme-neutrals-400 text-xs font-semibold">
                      Comments{" "}
                      <Text className="text-theme-neutrals-500 font-normal">
                        0
                      </Text>
                    </Text>
                  </View>
                  <View className="py-4 px-1">
                    <Text className="text-theme-neutrals-400 text-sm">
                      No comments yet. Be the first to comment!
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
        <SuggestedVideos ref={suggestedRef} excludeTokenId={tokenId} />
      </ScrollView>
      
      {/* Comment Bottom Sheet - same as HomeFeedCard */}
      {tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
          contentType="video"
        />
      )}
        </>
      )}
    </View>
  );
};

export default NormalVideoPlayer;
