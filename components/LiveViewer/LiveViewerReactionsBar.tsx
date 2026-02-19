import React, { memo, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Heart, Share2 } from "lucide-react-native";
import type { ReactionType } from "../LiveProducer/ReactionOverlay";
import { formatCompactNumber } from "../../libs/numbers.util";

const REACTION_OPTIONS: { type: ReactionType; emoji: string }[] = [
  { type: "HEART", emoji: "❤️" },
  { type: "LIKE", emoji: "👍" },
  { type: "CELEBRATE", emoji: "🎉" },
  { type: "LAUGH", emoji: "😂" },
  { type: "SUPPORT", emoji: "✊" },
];

interface LiveViewerReactionsBarProps {
  onReact: (type: ReactionType) => void;
  onLike: () => void;
  onShare: () => void;
  disabled: boolean;
  likeCount: number;
  isLiked: boolean;
  likePending: boolean;
  isLive: boolean;
}

const COOLDOWN_MS = 400;

const LiveViewerReactionsBar: React.FC<LiveViewerReactionsBarProps> = ({
  onReact,
  onLike,
  onShare,
  disabled,
  likeCount,
  isLiked,
  likePending,
  isLive,
}) => {
  const lastTapRef = useRef(0);

  const handleReact = useCallback((type: ReactionType) => {
    const now = Date.now();
    if (now - lastTapRef.current < COOLDOWN_MS) return;
    lastTapRef.current = now;
    onReact(type);
  }, [onReact]);

  return (
    <View className="flex-row items-center justify-center px-2 py-1">
      {/* Reaction emojis */}
      {isLive &&
        REACTION_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.type}
            onPress={() => handleReact(opt.type)}
            disabled={disabled}
            activeOpacity={0.6}
            className={`mx-1 w-9 h-9 rounded-full items-center justify-center bg-black/40 border border-white/10 ${disabled ? "opacity-30" : ""}`}
          >
            <Text style={{ fontSize: 16 }}>{opt.emoji}</Text>
          </TouchableOpacity>
        ))}

      {/* Like button */}
      <TouchableOpacity
        onPress={onLike}
        disabled={likePending || !isLive}
        activeOpacity={0.6}
        className={`mx-1 flex-row items-center rounded-full px-3 h-9 ${
          isLiked ? "bg-red-500/30 border border-red-500/40" : "bg-black/40 border border-white/10"
        } ${likePending ? "opacity-50" : ""}`}
      >
        <Heart
          color={isLiked ? "#ef4444" : "#fff"}
          fill={isLiked ? "#ef4444" : "transparent"}
          size={14}
        />
        {likeCount > 0 && (
          <Text className="text-white text-[11px] ml-1 font-semibold">
            {formatCompactNumber(likeCount)}
          </Text>
        )}
      </TouchableOpacity>

      {/* Share button */}
      <TouchableOpacity
        onPress={onShare}
        activeOpacity={0.6}
        className="mx-1 w-9 h-9 rounded-full items-center justify-center bg-black/40 border border-white/10"
      >
        <Share2 color="#fff" size={14} />
      </TouchableOpacity>
    </View>
  );
};

export default memo(LiveViewerReactionsBar);
