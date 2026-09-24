import React, { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { usePoll, useVoteOnPoll, useRemovePollVote, useClosePoll } from "../../hooks/usePolls";
import { useUser } from "../../context/AuthContext";

function formatRelativeTime(iso: string, t: TFunction): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const short = mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
  if (mins < 1) return t("dm.justNow");
  return diffMs < 0 ? t("dm.timeAgo", { time: short }) : short;
}

interface PollCardProps {
  tokenId: number;
  pollOwnerAddress?: string;
}

const PollCard: React.FC<PollCardProps> = ({ tokenId, pollOwnerAddress }) => {
  const { t } = useTranslation();
  const { poll, loading } = usePoll(tokenId);
  const { vote, loading: voting } = useVoteOnPoll();
  const { removeVote, loading: removing } = useRemovePollVote();
  const { closePoll, loading: closing } = useClosePoll();
  const user = useUser();

  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [localVotedIndexes, setLocalVotedIndexes] = useState<number[] | null>(null);
  const [localVoteCounts, setLocalVoteCounts] = useState<Record<number, number> | null>(null);

  useEffect(() => {
    const loadStoredVote = async () => {
      try {
        const stored = await AsyncStorage.getItem(`dehub-poll-vote-${tokenId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setLocalVotedIndexes(parsed);
          }
        } else {
          setLocalVotedIndexes(null);
        }
      } catch (e) {
        console.error("Failed to load poll vote:", e);
      }
    };
    loadStoredVote();
  }, [tokenId]);

  const myAddress = ((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase();
  const isOwner = !!(myAddress && pollOwnerAddress?.toLowerCase() === myAddress);

  // No skeleton while loading. Most posts have no poll, and a 120px block that
  // collapses to nothing once the lookup answers moved every card below it —
  // one scroll correction per card, mid-fling. A real poll grows the card once.
  if (loading || !poll) return null;

  const hasVoted = localVotedIndexes !== null || !!poll.userVote;
  const votedIndexes = localVotedIndexes ?? poll.userVote?.optionIndexes ?? [];

  const getCount = (index: number) => {
    if (localVoteCounts !== null) return localVoteCounts[index] ?? 0;
    return poll.options.find((o) => o.index === index)?.voteCount ?? 0;
  };
  const totalVotes =
    localVoteCounts !== null
      ? Object.values(localVoteCounts).reduce((a, b) => a + b, 0)
      : poll.totalVotes;

  const getBarWidth = (index: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((getCount(index) / totalVotes) * 100);
  };

  const applyOptimisticVote = (indexes: number[]) => {
    const counts: Record<number, number> = {};
    poll.options.forEach((o) => {
      counts[o.index] = o.voteCount ?? 0;
    });
    indexes.forEach((idx) => {
      counts[idx] = (counts[idx] ?? 0) + 1;
    });
    setLocalVotedIndexes(indexes);
    setLocalVoteCounts(counts);
    AsyncStorage.setItem(`dehub-poll-vote-${tokenId}`, JSON.stringify(indexes)).catch((err) => {
      console.error("Failed to save poll vote to AsyncStorage:", err);
    });
  };

  const handleOptionClick = (idx: number) => {
    if (hasVoted || !poll.isActive || voting) return;
    if (poll.isMultipleChoice) {
      setSelectedIndexes((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
      );
    } else {
      applyOptimisticVote([idx]);
      vote(tokenId, [idx]).catch(() => {
        setLocalVotedIndexes(null);
        setLocalVoteCounts(null);
        AsyncStorage.removeItem(`dehub-poll-vote-${tokenId}`).catch(() => {});
      });
    }
  };

  const handleMultipleChoiceVote = () => {
    if (selectedIndexes.length === 0) return;
    applyOptimisticVote(selectedIndexes);
    vote(tokenId, selectedIndexes).catch(() => {
      setLocalVotedIndexes(null);
      setLocalVoteCounts(null);
      AsyncStorage.removeItem(`dehub-poll-vote-${tokenId}`).catch(() => {});
    });
    setSelectedIndexes([]);
  };

  const handleRemoveVote = () => {
    setLocalVotedIndexes(null);
    setLocalVoteCounts(null);
    AsyncStorage.removeItem(`dehub-poll-vote-${tokenId}`).catch(() => {});
    removeVote(tokenId).catch(() => {});
  };

  const expiresLabel = poll.expiresAt
    ? poll.isActive
      ? t("dm.pollEnds", { time: formatRelativeTime(poll.expiresAt, t) })
      : t("dm.pollEnded", { time: formatRelativeTime(poll.expiresAt, t) })
    : null;

  return (
    <View className="mx-2 my-1.5 rounded-xl bg-white/5 border border-white/10 p-3">
      {/* Header */}
      <View className="flex-row items-start justify-between mb-2">
        <Text className="text-white font-medium text-sm flex-1 mr-2">
          {poll.question}
          {!poll.isActive && (
            <Text className="text-zinc-500 text-xs"> {t("dm.pollClosed")}</Text>
          )}
        </Text>
        {isOwner && poll.isActive && (
          <TouchableOpacity
            onPress={() => closePoll(tokenId)}
            disabled={closing}
            hitSlop={10}
            className="px-2 py-1.5 rounded-lg bg-white/10"
          >
            <Text className="text-zinc-400 text-[12px]">{t("common.close")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Options */}
      <View className="space-y-1.5">
        {poll.options.map((option) => {
          const pct = getBarWidth(option.index);
          const isVoted = votedIndexes.includes(option.index);
          const isSelected = selectedIndexes.includes(option.index);
          const canClick = !hasVoted && poll.isActive && !voting;

          return (
            <TouchableOpacity
              key={option.index}
              onPress={() => handleOptionClick(option.index)}
              disabled={!canClick}
              activeOpacity={canClick ? 0.7 : 1}
              className="relative rounded-lg overflow-hidden py-2.5 mb-2"
            >
              {/* Background bar */}
              <View className="absolute inset-0 rounded-lg bg-white/10" />
              {hasVoted && (
                <View
                  className="absolute inset-y-0 left-0 rounded-lg"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isVoted
                      ? "rgba(255,255,255,0.4)"
                      : "rgba(255,255,255,0.15)",
                  }}
                />
              )}

              <View className="relative z-10 flex-row items-center justify-between px-3">
                <View className="flex-row items-center gap-2 flex-1 min-w-0">
                  {poll.isMultipleChoice && !hasVoted && poll.isActive && (
                    <View
                      className={`w-4 h-4 rounded border items-center justify-center ${
                        isSelected
                          ? "bg-white border-white"
                          : "border-white/30"
                      }`}
                    >
                      {isSelected && (
                        <View className="w-2 h-2 rounded-sm dark-surface bg-black" />
                      )}
                    </View>
                  )}
                  {!poll.isMultipleChoice && !hasVoted && poll.isActive && (
                    <View className="w-4 h-4 rounded-full border border-white/30 items-center justify-center">
                      <View className="w-2 h-2 rounded-full bg-transparent" />
                    </View>
                  )}
                  <Text
                    className={`text-sm flex-1 ${isVoted ? "text-white font-medium" : "text-zinc-300"}`}
                    numberOfLines={2}
                  >
                    {option.text}
                  </Text>
                </View>
                {hasVoted && (
                  <Text className="text-xs text-zinc-400 ml-2">{pct}%</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Multi-choice vote button */}
      {poll.isMultipleChoice && !hasVoted && poll.isActive && selectedIndexes.length > 0 && (
        <TouchableOpacity
          onPress={handleMultipleChoiceVote}
          disabled={voting}
          className="mt-2 py-2 rounded-lg bg-white/10 items-center"
        >
          {voting ? (
            <ActivityIndicator size="small" color="#F4F4F5" />
          ) : (
            <Text className="text-white text-sm font-medium">{t("dm.pollSubmitVote")}</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Footer */}
      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-zinc-400 text-[12px]">
          {t("dm.pollVotes", { count: totalVotes })}
        </Text>
        <View className="flex-row items-center gap-2">
          {expiresLabel && (
            <Text className="text-zinc-400 text-[12px]">{expiresLabel}</Text>
          )}
          {hasVoted && poll.isActive && (
            <TouchableOpacity
              onPress={handleRemoveVote}
              disabled={removing}
              hitSlop={10}
              className="flex-row items-center gap-0.5 py-1.5"
            >
              <Icon name="X" size={12} color="#A6A9AC" />
              <Text className="text-zinc-400 text-[12px]">{t("follow.remove")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default React.memo(PollCard);
