import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { TouchableOpacity, Text, View, Animated } from "react-native";
import { useAuthActions } from "../../context/AuthContext";
import { useWeb3Provider } from "../../hooks/use-web3";
import { Ionicons } from "@expo/vector-icons";
import { toastInfo, toastError } from "../../libs/toast";
import { voteOnNFT, reactToNFT } from "../../services";
import ReactionPicker from "../Home/ReactionPicker";
import { isPositiveReaction, reactionMeta, type PostReaction } from "../../libs/reactions";

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
  const [chosenReaction, setChosenReaction] = useState<PostReaction | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const already = userVote != null;

  /**
   * Cast a reaction.
   *
   * This button is one-shot by design — `already` blocks re-voting with
   * "Votes can't be changed" — so the tray only ever picks the FIRST reaction.
   * That keeps the existing rule intact instead of quietly making votes
   * changeable here but nowhere else in the player.
   */
  const castReaction = useCallback((reaction: PostReaction) => {
    if (!tokenId || pending) return;
    if (already) {
      toastInfo("Votes can't be changed");
      return;
    }
    requireAuth(async () => {
      if (pending || already) return;
      setPending(true);
      setOptimisticActive(true);
      setChosenReaction(reaction);
      // optimistic bump
      setCount((c) => c + 1);
      // bounce animation on success
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 120, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }),
      ]).start();
      try {
        if (reaction === 'like' || reaction === 'dislike') {
          await voteOnNFT({ streamTokenId: tokenId as any, vote: reaction === 'like', account: account || undefined });
        } else {
          await reactToNFT({ streamTokenId: tokenId as any, reaction });
        }
        onVoted?.(isPositiveReaction(reaction) ? 'like' : 'dislike');
      } catch (e) {
        // revert on failure
        setCount((c) => Math.max(0, c - 1));
        setOptimisticActive(false);
        setChosenReaction(null);
        toastError(
          e,
          isPositiveReaction(reaction) ? "Couldn't like. Please try again." : "Couldn't dislike. Please try again."
        );
      } finally {
        setPending(false);
      }
    });
  }, [tokenId, pending, requireAuth, account, already, onVoted, scale]);

  const handlePress = useCallback(() => {
    if (pickerOpen) { setPickerOpen(false); return; }
    castReaction(vote ? 'like' : 'dislike');
  }, [castReaction, vote, pickerOpen]);

  const containerCls = useMemo(
    () =>
      `flex-row items-center px-3 py-1.5 rounded-xl mr-2 bg-theme-neutrals-800 ${
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
    <View style={{ position: "relative" }}>
      {/* Only the positive button carries the tray — the thumbs-down instance
          already means "dislike", and its negative twin (poo) is in the tray
          the thumbs-up opens. */}
      {vote && (
        <ReactionPicker
          open={pickerOpen && !already}
          current={chosenReaction}
          onSelect={(reaction) => { setPickerOpen(false); castReaction(reaction); }}
          align="left"
        />
      )}
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={vote && !already ? () => setPickerOpen(true) : undefined}
        delayLongPress={400}
        accessibilityLabel={vote ? (already ? "Liked" : "Like — hold to react") : "Dislike"}
        disabled={pending}
        className={containerCls}
      >
        <Animated.View className="mr-1" style={{ transform: [{ scale }] }}>
          {chosenReaction && chosenReaction !== 'like' && chosenReaction !== 'dislike' ? (
            <Text style={{ fontSize: 13, lineHeight: 18 }}>{reactionMeta(chosenReaction).emoji}</Text>
          ) : (
            <Ionicons name={iconName as any} size={14} color={iconColor} />
          )}
        </Animated.View>
        <Text className={`${textClass} text-xs`}>{count.toLocaleString()}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default LikeButton;
