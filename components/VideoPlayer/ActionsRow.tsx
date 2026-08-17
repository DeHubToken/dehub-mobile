import React, { useState, useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TipModal from "../Tip/TipModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import GiftModal from "../Tip/GiftModal";
import { getTransactionLink, openInApp } from "../../libs/links.utils";
import LikeButton from "./LikeButton";
import env from "../../config/env";
import { shareProfile } from "../../libs/misc";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { likeLiveStream } from "../../services/live.service";
import { toastError, toastInfo } from "../../libs/toast";
import { WEBSITE_LINK } from "../../config";
import type { PostReaction } from "../../libs/reactions";

export interface ActionsRowProps {
  likes: number;
  dislikes: number;
  tokenId: number | string | undefined;
  minter?: string;
  userVote?: 'like' | 'dislike' | null;
  myReaction?: PostReaction | null;
  chainId?: number;
  mintTxHash?: string;
  /**
   * The post's mint status. 'signed' means published off-chain: the info
   * button then explains itself instead of silently doing nothing, since
   * there is no transaction to open.
   */
  postStatus?: string;
  isLive?: boolean;
  streamId?: string | null;
  liveActive?: boolean; // whether the stream is currently live (enables like/tip)
  recipientAddress?: string | null; // for live gifts
  onGiftSent?: (payload: { amount: number; message?: string }) => void;
  // Optional stream entity (or subset) to forward settings like minTip to GiftModal
  stream?: any;
}

const ActionsRow: React.FC<ActionsRowProps> = ({
  likes,
  dislikes,
  tokenId,
  minter,
  userVote: initialUserVote,
  myReaction,
  chainId,
  mintTxHash,
  postStatus,
  isLive,
  streamId,
  liveActive,
  recipientAddress,
  onGiftSent,
  stream,
}) => {
  const [tipOpen, setTipOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [userVote, setUserVote] = useState<'like' | 'dislike' | null>(initialUserVote ?? null);
  const { requireAuth } = useAuthActions();
  const user = useUser();
  const [likeCount, setLikeCount] = useState<number>(Number(likes));
  const [likePending, setLikePending] = useState(false);

  // Keep local likeCount in sync when the parent-provided likes prop changes
  useEffect(() => {
    setLikeCount(Number(likes ?? 0));
  }, [likes]);
  // Keep local userVote in sync when the parent-provided vote prop changes (e.g. stream entity loads async)
  useEffect(() => {
    if (initialUserVote !== undefined) setUserVote(initialUserVote);
  }, [initialUserVote]);
  const handleShare = useCallback(async () => {
    const liveUrl = isLive && streamId ? `${WEBSITE_LINK}/app/post/${streamId}` : null;
    const vodUrl = tokenId ? `${WEBSITE_LINK}/app/post/${tokenId}` : null;
    const url = liveUrl || vodUrl;
    if (!url) return;
    const message = `Check out this stream ${url}`;
    await shareProfile(url, message);
  }, [isLive, streamId, tokenId]);

  const handleLiveLike = useCallback(() => {
    if (!isLive || !streamId || liveActive === false) return;
    if (likePending) return;
    const isUnliking = userVote === 'like';
    requireAuth(async () => {
      try {
        setLikePending(true);
        // Optimistic update
        if (isUnliking) {
          setLikeCount((c) => Math.max(0, c - 1));
          setUserVote(null);
        } else {
          setLikeCount((c) => c + 1);
          setUserVote('like');
        }
        // Same endpoint toggles like/unlike on the backend
        const res: any = await likeLiveStream(streamId, {});
        // Backend returns { likes, isLiked } — reconcile with server truth
        const serverLikes = res?.likes ?? res?.result?.likes;
        const serverIsLiked = res?.isLiked ?? res?.result?.isLiked;
        if (typeof serverLikes === 'number') setLikeCount(serverLikes);
        if (typeof serverIsLiked === 'boolean') setUserVote(serverIsLiked ? 'like' : null);
      } catch (e) {
        // Revert optimistic update
        if (isUnliking) {
          setLikeCount((c) => c + 1);
          setUserVote('like');
        } else {
          setLikeCount((c) => Math.max(0, c - 1));
          setUserVote(null);
        }
        console.warn('[ActionsRow] like/unlike failed', e);
      } finally {
        setLikePending(false);
      }
    });
  }, [isLive, streamId, liveActive, requireAuth, likePending, userVote]);
  return (
    <View className="flex-row mt-3 items-center">
      {isLive && streamId ? (
        <TouchableOpacity onPress={handleLiveLike} disabled={likePending || liveActive === false} className={`flex-row items-center px-3 py-1.5 rounded-xl mr-2 ${(likePending || liveActive === false) ? 'opacity-70' : ''} bg-theme-neutrals-800`}>
          <Ionicons name={userVote === 'like' ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color="#fff" />
          <Text className="text-theme-neutrals-100 text-xs ml-1">{likeCount.toLocaleString()}</Text>
        </TouchableOpacity>
      ) : (
        <LikeButton vote tokenId={tokenId} votes={likes} userVote={userVote} myReaction={myReaction} onVoted={(d) => setUserVote(d)} />
      )}
      {!isLive && (
        <LikeButton vote={false} tokenId={tokenId} votes={dislikes} userVote={userVote} myReaction={myReaction} onVoted={(d) => setUserVote(d)} />
      )}

      {/* Live Gift (glass modal) or VOD Tip */}
      {isLive && streamId ? (
        <>
          <AccentButtonGradient
            style={liveActive === false ? { opacity: 0.5 } : undefined}
          >
            <TouchableOpacity
              onPress={() => requireAuth(() => setGiftOpen(true))}
              className="flex-row items-center px-3 py-1.5"
              disabled={liveActive === false}
              activeOpacity={0.85}
            >
              <Ionicons name="gift" size={14} color="#fff" />
              <Text className="text-white text-xs ml-1 font-semibold">
                Gift
              </Text>
            </TouchableOpacity>
          </AccentButtonGradient>
          <View className="w-2" />
          <GiftModal
            open={giftOpen}
            onOpenChange={setGiftOpen}
            tokenId={(tokenId as number) || 0}
            toAddress={(recipientAddress || minter || '') as string}
            stream={stream || { _id: streamId }}
            onSent={({ amount, message }) => {
              // Let parent (viewer) optimistically echo the gift in chat
              try { onGiftSent?.({ amount, message }); } catch {}
            }}
          />
        </>
      ) : (
        <TipModal
          open={tipOpen}
          onOpenChange={setTipOpen}
          tokenId={(tokenId as number) || 0}
          toAddress={minter as string}
          trigger={
            <AccentButtonGradient style={{ borderRadius: 14, marginRight: 8 }}>
              <TouchableOpacity
                onPress={() => requireAuth(() => setTipOpen(true))}
                className="flex-row items-center px-3 py-1.5 rounded-xl"
                style={{ backgroundColor: 'transparent' }}
              >
                <Ionicons name="cash-outline" size={14} color="#000" />
                <Text className="text-white text-xs ml-1 font-semibold">
                  Tip
                </Text>
              </TouchableOpacity>
            </AccentButtonGradient>
          }
        />
      )}
      <View className="flex-1" />
      {!isLive && (
        <TouchableOpacity
          className="px-3 py-1.5 rounded-xl bg-theme-neutrals-800 mr-2"
          onPress={() => {
            const url = mintTxHash ? getTransactionLink(chainId as any, mintTxHash as any) : null;
            if (url) {
              openInApp(url);
            } else if (postStatus === "signed") {
              // Published off-chain — there is no transaction to show.
              toastInfo("Mint this post to generate this section");
            }
          }}
        >
          <Ionicons name="information-circle-outline" size={16} color="#fff" />
        </TouchableOpacity>
      )}
      <TouchableOpacity className="px-3 py-1.5 rounded-xl bg-theme-neutrals-800" onPress={handleShare}>
        <Ionicons name="share-social-outline" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default ActionsRow;
