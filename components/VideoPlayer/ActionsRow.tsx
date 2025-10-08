import React, { useState, useCallback, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TipModal from "../Tip/TipModal";
import GiftModal from "../Tip/GiftModal";
import { getTransactionLink, openInApp } from "../../libs/links.utils";
import LikeButton from "./LikeButton";
import env from "../../config/env";
import { shareProfile } from "../../libs/misc";
import { useAuth } from "../../context/AuthContext";
import { likeLiveStream } from "../../services/live.service";
import { toastError, toastInfo } from "../../libs/toast";

export interface ActionsRowProps {
  likes: number;
  dislikes: number;
  tokenId: number | string | undefined;
  minter?: string;
  userVote?: 'like' | 'dislike' | null;
  chainId?: number;
  mintTxHash?: string;
  isLive?: boolean;
  streamId?: string | null;
  liveActive?: boolean; // whether the stream is currently live (enables like/tip)
  recipientAddress?: string | null; // for live gifts
  onGiftSent?: (payload: { amount: number; message?: string }) => void;
}

const ActionsRow: React.FC<ActionsRowProps> = ({
  likes,
  dislikes,
  tokenId,
  minter,
  userVote: initialUserVote,
  chainId,
  mintTxHash,
  isLive,
  streamId,
  liveActive,
  recipientAddress,
  onGiftSent,
}) => {
  const [tipOpen, setTipOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [userVote, setUserVote] = useState<'like' | 'dislike' | null>(initialUserVote ?? null);
  const { requireAuth, user } = useAuth();
  const [likeCount, setLikeCount] = useState<number>(Number(likes));
  const [likePending, setLikePending] = useState(false);

  // Keep local likeCount in sync when the parent-provided likes prop changes
  useEffect(() => {
    setLikeCount(Number(likes ?? 0));
  }, [likes]);
  const handleShare = useCallback(async () => {
    const liveUrl = isLive && streamId ? `${env.APP_ORIGIN}/live/${streamId}` : null;
    const vodUrl = tokenId ? `${env.APP_ORIGIN}/stream/${tokenId}` : null;
    const url = liveUrl || vodUrl;
    if (!url) return;
    const message = `Check out this stream ${url}`;
    await shareProfile(url, message);
  }, [isLive, streamId, tokenId]);

  const handleLiveLike = useCallback(() => {
    if (!isLive || !streamId || liveActive === false) return;
    if (likePending) return;
    // prevent double-like in this session
    if (userVote === 'like') {
      toastInfo("You already liked this stream");
      return;
    }
    requireAuth(async () => {
      try {
        setLikePending(true);
        // Optimistic update
        setLikeCount((c) => c + 1);
        // Backend uses auth guard and address from req context; no body needed
        await likeLiveStream(streamId, {});
        setUserVote('like');
        toastInfo('Liked stream');
      } catch (e) {
        // Revert optimistic like
        setLikeCount((c) => Math.max(0, c - 1));
        toastError(e, 'Failed to like stream');
      } finally {
        setLikePending(false);
      }
    });
  }, [isLive, streamId, liveActive, requireAuth, user?.walletAddress, user?.address, likePending, userVote]);
  return (
    <View className="flex-row mt-3 items-center">
      {isLive && streamId ? (
        <TouchableOpacity onPress={handleLiveLike} disabled={likePending || liveActive === false} className={`flex-row items-center px-3 py-1.5 rounded-full mr-2 ${(likePending || liveActive === false) ? 'opacity-70' : ''} bg-theme-neutrals-800`}>
          <Ionicons name={userVote === 'like' ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color="#fff" />
          <Text className="text-theme-neutrals-100 text-xs ml-1">{likeCount.toLocaleString()}</Text>
        </TouchableOpacity>
      ) : (
        <LikeButton vote tokenId={tokenId} votes={likes} userVote={userVote} onVoted={(d) => setUserVote(d)} />
      )}
      {!isLive && (
        <LikeButton vote={false} tokenId={tokenId} votes={dislikes} userVote={userVote} onVoted={(d) => setUserVote(d)} />
      )}

      {/* Live Gift (glass modal) or VOD Tip */}
      {isLive && streamId ? (
        <>
          <TouchableOpacity
            onPress={() => requireAuth(() => setGiftOpen(true))}
            className={`flex-row items-center bg-theme-accent px-3 py-1.5 rounded-full mr-2 ${liveActive === false ? 'opacity-60' : ''}`}
            disabled={liveActive === false}
          >
            <Ionicons name="gift" size={14} color="#000" />
            <Text className="text-theme-neutrals-900 text-xs ml-1 font-semibold">
              Gift
            </Text>
          </TouchableOpacity>
          <GiftModal
            open={giftOpen}
            onOpenChange={setGiftOpen}
            tokenId={(tokenId as number) || 0}
            toAddress={(recipientAddress || minter || '') as string}
            stream={{ _id: streamId }}
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
            <TouchableOpacity
              onPress={() => requireAuth(() => setTipOpen(true))}
              className="flex-row items-center bg-theme-accent px-3 py-1.5 rounded-full mr-2"
            >
              <Ionicons name="cash-outline" size={14} color="#000" />
              <Text className="text-theme-neutrals-900 text-xs ml-1 font-semibold">
                Tip
              </Text>
            </TouchableOpacity>
          }
        />
      )}
      <View className="flex-1" />
      {!isLive && (
        <TouchableOpacity
          className="px-3 py-1.5 rounded-full bg-theme-neutrals-800 mr-2"
          onPress={() => {
            const url = getTransactionLink(chainId as any, mintTxHash as any);
            if (url) openInApp(url);
          }}
        >
          <Ionicons name="information-circle-outline" size={16} color="#fff" />
        </TouchableOpacity>
      )}
      <TouchableOpacity className="px-3 py-1.5 rounded-full bg-theme-neutrals-800" onPress={handleShare}>
        <Ionicons name="share-social-outline" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default ActionsRow;
