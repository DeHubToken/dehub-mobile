import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { View, Text, TouchableOpacity, Platform, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistance } from "date-fns";
import { formatCompactNumber } from "../../libs/numbers.util";
// Using RN ScrollView to avoid RNGH old API PanGestureHandler issues
import VideoPlayerSkeleton from "./VideoPlayerSkeleton";
import VideoArea from "./VideoArea";
import ActionsRow from "./ActionsRow";
import DescriptionBlock from "./DescriptionBlock";
import { getVideoUrl } from "../../libs/misc";
import { useAuth } from "../../context/AuthContext";
import TopCommentPreview from "./TopCommentPreview";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { getNFT, recordView, postComment } from "../../services";
import {
  getAccount,
  followUser,
  unfollowUser,
} from "../../services/user.service";
import { getAvatarUrl, getBadgeName, getBadgeUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { toastError } from "../../libs";
import CreatorRow from "./CreatorRow";
import CommentComposer from "./CommentComposer";
import CommentsPanel from "./CommentsPanel";
import SuggestedVideos from "./SuggestedVideos";
import { ScrollView } from "react-native-gesture-handler";
import useKeyboard from "../../hooks/useKeyboard";

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
  const { height: keyboardHeight, isVisible: keyboardVisible } = useKeyboard();
  const [showDesc, setShowDesc] = useState(false);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  // Channel (creator) section state
  const [creatorLoading, setCreatorLoading] = useState<boolean>(true);
  const [creator, setCreator] = useState<any | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [composerAutoFocus, setComposerAutoFocus] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [posting, setPosting] = useState(false);
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [scrollTargetId, setScrollTargetId] = useState<number | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [expandThreadId, setExpandThreadId] = useState<number | string | null>(
    null
  );
  const createdAtDate = createdAt ? new Date(createdAt) : new Date();
  // NFT fetch & metadata loading
  const [nftLoading, setNftLoading] = useState<boolean>(false);
  const [nftData, setNftData] = useState<any | null>(null);
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
        const res: any = await getNFT(
          tokenId as any,
          user?.address || user?.walletAddress || ""
        );
        if (!cancelled) {
          const payload = res?.result || res || null;
          setLikes(payload?.totalVotes?.for || 0);
          setDislikes(payload?.totalVotes?.against || 0);
          setNftData(payload);
        }
      } catch (e) {
        if (!cancelled) {
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

  // Fetch creator account for channel section
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const minterAddr = (nftData?.minter ||
        nftData?.result?.minter ||
        minter) as string | undefined;
      if (!minterAddr) return;
      setCreatorLoading(true);
      try {
        const res: any = await getAccount(minterAddr);
        if (cancelled) return;
        const payload = res?.data?.result || res?.result || res || null;
        setCreator(payload);
        // derive follow state
        const acct = (user?.walletAddress || user?.address || "").toLowerCase();
        if (acct && Array.isArray(payload?.followers)) {
          const isF = payload.followers
            .map((f: string) => (f || "").toLowerCase())
            .includes(acct);
          setIsFollowing(isF);
        } else {
          setIsFollowing(false);
        }
      } catch (e) {
        if (!cancelled) setCreator(null);
        console.warn("[NormalVideoPlayer] getAccount(minter) failed", e);
      } finally {
        if (!cancelled) setCreatorLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    nftData?.minter,
    nftData?.result?.minter,
    minter,
    user?.walletAddress,
    user?.address,
  ]);

  const effectiveVideoUrl = useMemo(() => {
    if (isTranscoding) return null;
    const st = resolvedAccessInfo?.streamStatus;
    const isPlayable = st
      ? !st.isLockedWithLockContent && !st.isLockedWithPPV
      : isFree;
    if (isPlayable) return getVideoUrl(tokenId) || (videoUrl ?? null);
    return null;
  }, [isTranscoding, resolvedAccessInfo, videoUrl, tokenId]);

  // Reset autofocus after opening the comments composer once
  useEffect(() => {
    if (!commentsOpen && composerAutoFocus) {
      setComposerAutoFocus(false);
    }
  }, [commentsOpen, composerAutoFocus]);

  // --- View recording: 5s-or-full threshold, signed-in only, once per view ---
  const hasRecordedRef = useRef(false);
  const pendingRecordRef = useRef(false);
  const onProgressRecord = async (positionMs: number, durationMs: number) => {
    if (hasRecordedRef.current || pendingRecordRef.current) return;
    if (!isSignedIn) return;
    // If duration >= 5s, require >=5s watched; else require full duration
    const threshold =
      durationMs && durationMs > 0 ? Math.min(5000, durationMs) : 5000;
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

  const handleFollow = useCallback(() => {
    if (!creator) return;
    if (isFollowing) return;
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
      // optimistic
      setIsFollowing(true);
      setCreator((prev: any) => {
        if (!prev) return prev;
        const followers = prev.followers || [];
        if (
          followers.map((f: string) => (f || "").toLowerCase()).includes(viewer)
        )
          return prev;
        return { ...prev, followers: [...followers, viewer] };
      });
      try {
        await followUser(viewer, target);
      } catch (e) {
        // revert
        setIsFollowing(false);
        setCreator((prev: any) => {
          if (!prev) return prev;
          const followers = prev.followers || [];
          return {
            ...prev,
            followers: followers.filter(
              (f: string) => (f || "").toLowerCase() !== viewer
            ),
          };
        });
        toastError("Failed to follow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [creator, isFollowing, user?.walletAddress, user?.address]);

  const handleUnfollow = useCallback(() => {
    if (!creator || !isFollowing || followLoading) return;
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
      try {
        await unfollowUser(viewer, target);
        setIsFollowing(false);
        setCreator((prev: any) => {
          if (!prev) return prev;
          const followers = prev.followers || [];
          return {
            ...prev,
            followers: followers.filter(
              (f: string) => (f || "").toLowerCase() !== viewer
            ),
          };
        });
      } catch (e) {
        toastError("Failed to unfollow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [creator, isFollowing, followLoading, user?.walletAddress, user?.address]);

  // derive channel display (kept for backwards compat; now handled in CreatorRow)
  const stakedForBadge = (creator as any)?.stakedDHB || 0;
  const badgeName = getBadgeName(stakedForBadge);
  const badgeImage = getBadgeUrl(stakedForBadge);

  // Comments from NFT payload
  const comments: any[] = Array.isArray((nftData as any)?.comments)
    ? ((nftData as any).comments as any[])
    : [];
  // Compute top-level comments (exclude items that are listed as a replyId of another comment)
  const replyIdSet = useMemo(() => {
    const set = new Set<number>();
    comments.forEach((c: any) => {
      if (Array.isArray(c?.replyIds)) {
        c.replyIds.forEach((id: any) => set.add(Number(id)));
      }
    });
    return set;
  }, [comments]);
  const topLevelComments = useMemo(
    () => comments.filter((c: any) => !replyIdSet.has(Number(c?.id))),
    [comments, replyIdSet]
  );
  // console.log({comments})
  const previewComment = useMemo(() => {
    const c = topLevelComments[0];
    if (!c) return null;
    return {
      user: c?.writor?.username || (c?.address as string) || "",
      avatar: getAvatarUrl(c?.writor?.avatarUrl) || undefined,
      text: String(c?.content || "").replace(/<[^>]+>/g, ""),
    };
  }, [topLevelComments]);

  // Send handler (comments and replies) with optimistic updates
  const handleSend = useCallback(() => {
    const text = (draftComment || "").trim();
    if (!text || posting) return;

    requireAuth?.(async () => {
      setPosting(true);
      const now = new Date().toISOString();
      const viewerAddr = (user?.walletAddress || user?.address || "") as string;
      const tempId = -Date.now();
      const replyTarget = replyTo ? { ...replyTo } : null;

      // Optimistic list update + counts/preview impact
      setNftData((prev: any) => {
        const base = prev || {};
        const prevComments: any[] = Array.isArray(base?.comments)
          ? [...base.comments]
          : [];
        if (replyTarget && replyTarget.id != null) {
          // Add reply item and connect to parent
          const optimisticReply: any = {
            id: tempId,
            address: viewerAddr,
            content: text,
            updatedAt: now,
            writor: {
              username: user?.username,
              avatarUrl: user?.avatarUrl || (user as any)?.avatarImageUrl,
            },
          };
          const parentIdx = prevComments.findIndex(
            (x: any) => Number(x?.id) === Number(replyTarget.id)
          );
          if (parentIdx >= 0) {
            const parent = { ...(prevComments[parentIdx] || {}) };
            const replyIds: any[] = Array.isArray(parent.replyIds)
              ? [...parent.replyIds]
              : [];
            replyIds.push(tempId);
            prevComments[parentIdx] = { ...parent, replyIds };
          }
          prevComments.push(optimisticReply);
          // Ensure thread expands and we scroll to new reply
          setExpandThreadId(replyTarget?.id ?? null);
        } else {
          // New top-level comment (prepend so preview updates)
          const optimisticComment: any = {
            id: tempId,
            address: viewerAddr,
            content: text,
            updatedAt: now,
            replyIds: [],
            writor: {
              username: user?.username,
              avatarUrl: user?.avatarUrl || (user as any)?.avatarImageUrl,
            },
          };
          prevComments.unshift(optimisticComment);
        }
        return { ...(base || {}), comments: prevComments };
      });

      // Optimistically exit reply mode immediately
      if (replyTarget) setReplyTo(null);

      // Clear input and dismiss keyboard
      setDraftComment("");
      Keyboard.dismiss();

      // Highlight + scroll to the new item
      setHighlightedId(tempId);
      setScrollTargetId(tempId);

      try {
        const payload: any = {
          streamTokenId: tokenId as any,
          content: text,
          commentId: replyTarget?.id,
        };
        const res: any = await postComment(payload);
        const newId = res?.result?.id ?? res?.id ?? undefined;
        if (newId != null) {
          // Reconcile temp id to server id (and parent.replyIds)
          setNftData((prev: any) => {
            if (!prev) return prev;
            const list: any[] = Array.isArray(prev.comments)
              ? [...prev.comments]
              : [];
            const idx = list.findIndex((x) => Number(x?.id) === Number(tempId));
            if (idx >= 0) list[idx] = { ...list[idx], id: newId };
            if (replyTarget?.id != null) {
              const pIdx = list.findIndex(
                (x) => Number(x?.id) === Number(replyTarget.id)
              );
              if (pIdx >= 0) {
                const parent = { ...(list[pIdx] || {}) };
                const rids: any[] = Array.isArray(parent.replyIds)
                  ? [...parent.replyIds]
                  : [];
                const ridx = rids.findIndex(
                  (rid) => Number(rid) === Number(tempId)
                );
                if (ridx >= 0) rids[ridx] = newId;
                list[pIdx] = { ...parent, replyIds: rids };
              }
            }
            return { ...prev, comments: list };
          });
        }
      } catch (e) {
        // Revert optimistic update on failure
        setNftData((prev: any) => {
          if (!prev) return prev;
          const list: any[] = Array.isArray(prev.comments)
            ? [...prev.comments]
            : [];
          const next = list.filter((x) => Number(x?.id) !== Number(tempId));
          if (replyTarget?.id != null) {
            const pIdx = next.findIndex(
              (x) => Number(x?.id) === Number(replyTarget.id)
            );
            if (pIdx >= 0) {
              const parent = { ...(next[pIdx] || {}) };
              const rids: any[] = Array.isArray(parent.replyIds)
                ? parent.replyIds.filter(
                    (rid: any) => Number(rid) !== Number(tempId)
                  )
                : [];
              next[pIdx] = { ...parent, replyIds: rids };
            }
          }
          return { ...prev, comments: next };
        });
        setScrollTargetId(null);
        setHighlightedId(null);
        toastError("Failed to post comment");
      } finally {
        setPosting(false);
      }
    });
  }, [
    draftComment,
    posting,
    requireAuth,
    user?.walletAddress,
    user?.address,
    setNftData,
    replyTo,
    tokenId,
  ]);

  return (
    <View className="flex-1" key="loaded-player">
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
      {/* Scrollable metadata & interactions; keep both sections mounted to avoid refetch */}
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        // Ensure vertical scroll isn't blocked by nested views
        pointerEvents="auto"
        contentContainerStyle={{ paddingBottom: commentsOpen ? 120 : 80 }}
      >
        <View
          style={{
            display: commentsOpen ? ("none" as const) : ("flex" as const),
          }}
          pointerEvents={commentsOpen ? "none" : "auto"}
        >
          <>
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
              {/* Description (can sshow partial before, updated after) */}
              <DescriptionBlock
                description={resolvedDescription}
                showDesc={showDesc}
                onToggle={() => setShowDesc((d) => !d)}
              />
              {/* Top Comment Preview or empty state */}
              {nftLoading ? (
                <View className="mt-5">
                  <View className="h-4 w-40 bg-theme-neutrals-800 rounded mb-2 animate-pulse" />
                  <View className="h-3 w-56 bg-theme-neutrals-800 rounded animate-pulse" />
                </View>
              ) : (
                <>
                  {topLevelComments.length > 0 && previewComment ? (
                    <TopCommentPreview
                      comment={previewComment}
                      total={topLevelComments.length}
                      onOpen={() => setCommentsOpen(true)}
                    />
                  ) : (
                    <View className="mt-4 rounded-2xl border border-theme-neutrals-800 p-3">
                      <View className="flex-row items-center justify-between px-1">
                        <Text className="text-theme-neutrals-400 text-xs font-semibold">
                          Comments{" "}
                          <Text className="text-theme-neutrals-500 font-normal">
                            0
                          </Text>
                        </Text>
                      </View>
                      <View className="py-4 px-1">
                        <Text className="text-theme-neutrals-400 text-sm mb-3">
                          No comments yet.
                        </Text>
                        <CommentComposer
                          readOnly
                          placeholder="Add your comment"
                          onPress={() => {
                            setCommentsOpen(true);
                            setComposerAutoFocus(true);
                          }}
                        />
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
            <SuggestedVideos excludeTokenId={tokenId} />
          </>
        </View>
        <View
          style={{
            display: commentsOpen ? ("flex" as const) : ("none" as const),
          }}
          pointerEvents={commentsOpen ? "auto" : "none"}
        >
          <CommentsPanel
            comments={comments}
            nftLoading={nftLoading}
            onClose={() => setCommentsOpen(false)}
            onReply={(target) => {
              setReplyTo(target);
              setComposerFocusSignal((s) => s + 1);
              setTimeout(() => setComposerFocusSignal((s) => s + 1), 60);
            }}
            scrollTargetId={scrollTargetId}
            highlightedId={highlightedId}
            onHighlightDone={() => {
              setHighlightedId(null);
              setScrollTargetId(null);
            }}
            expandThreadId={expandThreadId}
          />
        </View>
      </ScrollView>
      {commentsOpen && (
        <View
          // Absolutely position composer; lift above keyboard when visible
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: Platform.OS === "ios" ? keyboardHeight : keyboardHeight,
          }}
          pointerEvents="box-none"
        >
          <View className="px-4 pb-3">
            <CommentComposer
              value={draftComment}
              onChangeText={setDraftComment}
              placeholder={replyTo ? "Replying…" : "Add your comment"}
              autoFocus={composerAutoFocus}
              replyToLabel={replyTo?.label}
              onCancelReply={() => setReplyTo(null)}
              focusSignal={composerFocusSignal}
              disabled={posting}
              onSend={handleSend}
            />
          </View>
        </View>
      )}
    </View>
  );
};

export default NormalVideoPlayer;
