import React from "react";
import { View } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE, MINIMAL_INSET } from "../../theme/minimal";

interface FeedCardSkeletonProps {
  count?: number;
}

// Minimal placeholder fill: a faint lift off the black canvas, since the
// neutral-800 blocks read as grey cards once the card around them is gone.
const MINIMAL_PLACEHOLDER = { backgroundColor: "rgba(255,255,255,0.04)" } as const;

const FeedCardSkeleton: React.FC<FeedCardSkeletonProps> = ({ count = 3 }) => {
  const { isMinimal } = useAppTheme();
  const ph = isMinimal ? MINIMAL_PLACEHOLDER : undefined;
  return (
    <View>
      {Array.from({ length: count }).map((_, idx) => (
        <View
          key={idx}
          // Minimal: shaped like a minimal FeedCard — no fill or gap, text at
          // the 16pt inset, one hairline under each row, media edge to edge.
          className={isMinimal ? undefined : "mb-3 p-3 rounded-xl bg-theme-neutrals-900/40"}
          style={isMinimal ? {
            paddingTop: 14,
            paddingHorizontal: MINIMAL_INSET,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: MINIMAL_HAIRLINE,
          } : undefined}
        >
          {/* Header: avatar + name */}
          <View className="flex-row items-center mb-2">
            <View className="w-9 h-9 rounded-lg bg-theme-neutrals-800" style={ph} />
            <View className="ml-2.5">
              <View className="w-24 h-3.5 bg-theme-neutrals-800 rounded" style={ph} />
            </View>
          </View>

          {/* Content area */}
          {/* Minimal drops w-full so the negative margin can stretch it past the
              text inset — a fixed 100% width would just shift it left. */}
          <View
            className={isMinimal ? undefined : "w-full rounded-xl bg-theme-neutrals-800"}
            style={isMinimal
              ? [{ aspectRatio: 4 / 3, marginHorizontal: -MINIMAL_INSET }, MINIMAL_PLACEHOLDER]
              : { aspectRatio: 4 / 3 }}
          />

          {/* Caption line */}
          <View className="w-3/5 h-3 bg-theme-neutrals-800 rounded mt-2.5" style={ph} />

          {/* Action bar – just 3 circles */}
          <View className="flex-row items-center gap-5 mt-3">
            <View className="w-5 h-5 rounded-md bg-theme-neutrals-800" style={ph} />
            <View className="w-5 h-5 rounded-md bg-theme-neutrals-800" style={ph} />
            <View className="w-5 h-5 rounded-md bg-theme-neutrals-800" style={ph} />
          </View>
        </View>
      ))}
    </View>
  );
};

export default FeedCardSkeleton;
