import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { TouchableOpacity, Text, View, Animated } from "react-native";
import { useAuthActions } from "../../context/AuthContext";
import { useWeb3Provider } from "../../hooks/use-web3";
import { Ionicons } from "@expo/vector-icons";
import { toastInfo, toastError } from "../../libs/toast";
import { voteOnNFT } from "../../services";

export interface LikeButtonProps {
  vote: boolean; // true = like, false = dislike
  tokenId: number | string | undefined;
  votes?: number; // initial count
  className?: string;
  userVote?: 'like' | 'dislike' | null;
  onVoted?: (dir: 'like' | 'dislike') => void;
}

const LikeButton: React.FC<LikeButtonProps> = ({ vote, tokenId, votes = 0, className, userVote = null, onVoted }) => {
  const { requireAuth } = useAuthActions();
  const { account } = useWeb3Provider();
  const [count, setCount] = useState<number>(Number(votes) || 0);
  const [pending, setPending] = useState(false);
  const [optimisticActive, setOptimisticActive] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const already = userVote != null;

  const handlePress = useCallback(() => {
    if (!tokenId || pending) return;
    if (already) {
      toastInfo("Votes can't be changed");
      return;
    }
    requireAuth(async () => {
      if (pending || already) return;
      setPending(true);
      setOptimisticActive(true);
      // optimistic bump
      setCount((c) => c + 1);
      // bounce animation on success
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 120, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }),
      ]).start();
      try {
        await voteOnNFT({ streamTokenId: tokenId as any, vote, account: account || undefined });
        onVoted?.(vote ? 'like' : 'dislike');
      } catch (e) {
        // revert on failure
        setCount((c) => Math.max(0, c - 1));
        setOptimisticActive(false);
        toastError(
          e,
          vote ? "Couldn't like. Please try again." : "Couldn't dislike. Please try again."
        );
      } finally {
        setPending(false);
      }
    });
  }, [tokenId, pending, requireAuth, vote, account, already, onVoted]);

  const containerCls = useMemo(
    () =>
      `flex-row items-center px-3 py-1.5 rounded-full mr-2 bg-theme-neutrals-800 ${
        pending ? "opacity-70" : ""
      } ${className || ""}`,
    [pending, className]
  );

  const isActive = optimisticActive || (userVote === 'like' && vote) || (userVote === 'dislike' && !vote);
  const textClass = 'text-theme-neutrals-100';
  const iconName = isActive
    ? (vote ? 'thumbs-up' : 'thumbs-down')
    : (vote ? 'thumbs-up-outline' : 'thumbs-down-outline');
  const iconColor = '#fff';

  // Clear optimistic flag once parent confirms the vote
  useEffect(() => {
    if (userVote) {
      setOptimisticActive(false);
    }
  }, [userVote]);

  return (
    <TouchableOpacity onPress={handlePress} disabled={pending} className={containerCls}>
      <Animated.View className="mr-1" style={{ transform: [{ scale }] }}>
        <Ionicons name={iconName as any} size={14} color={iconColor} />
      </Animated.View>
      <Text className={`${textClass} text-xs`}>{count.toLocaleString()}</Text>
    </TouchableOpacity>
  );
};

export default LikeButton;
