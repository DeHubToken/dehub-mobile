import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TipModal from "../Tip/TipModal";
import { getTransactionLink, openInApp } from "../../libs/links.utils";
import LikeButton from "./LikeButton";
import env from "../../config/env";
import { shareProfile } from "../../libs/misc";

export interface ActionsRowProps {
  likes: number;
  dislikes: number;
  tokenId: number | string | undefined;
  minter?: string;
  userVote?: 'like' | 'dislike' | null;
  chainId?: number;
  mintTxHash?: string;
}

const ActionsRow: React.FC<ActionsRowProps> = ({
  likes,
  dislikes,
  tokenId,
  minter,
  userVote: initialUserVote,
  chainId,
  mintTxHash,
}) => {
  const [tipOpen, setTipOpen] = useState(false);
  const [userVote, setUserVote] = useState<'like' | 'dislike' | null>(initialUserVote ?? null);
  const handleShare = useCallback(async () => {
    if (!tokenId) return;
    const url = `${env.APP_ORIGIN}/stream/${tokenId}`;
    const message = `Check out this stream ${url}`;
    await shareProfile(url, message);
  }, [tokenId]);
  return (
    <View className="flex-row mt-3 items-center">
      <LikeButton vote tokenId={tokenId} votes={likes} userVote={userVote} onVoted={(d) => setUserVote(d)} />
      <LikeButton vote={false} tokenId={tokenId} votes={dislikes} userVote={userVote} onVoted={(d) => setUserVote(d)} />
      <TipModal
        open={tipOpen}
        onOpenChange={setTipOpen}
        tokenId={(tokenId as number) || 0}
        toAddress={minter as string}
        trigger={
          <TouchableOpacity
            onPress={() => setTipOpen(true)}
            className="flex-row items-center bg-theme-accent px-3 py-1.5 rounded-full mr-2"
          >
            <Ionicons name="cash-outline" size={14} color="#000" />
            <Text className="text-theme-neutrals-900 text-xs ml-1 font-semibold">
              Tip
            </Text>
          </TouchableOpacity>
        }
      />
      <View className="flex-1" />
      <TouchableOpacity
        className="px-3 py-1.5 rounded-full bg-theme-neutrals-800 mr-2"
        onPress={() => {
          const url = getTransactionLink(chainId as any, mintTxHash as any);
          if (url) openInApp(url);
        }}
      >
        <Ionicons name="information-circle-outline" size={16} color="#fff" />
      </TouchableOpacity>
  <TouchableOpacity className="px-3 py-1.5 rounded-full bg-theme-neutrals-800" onPress={handleShare}>
        <Ionicons name="share-social-outline" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default ActionsRow;
