import React, { memo } from "react";
import { View } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_INSET, minimalRow } from "../../theme/minimal";

// Minimal placeholder fill — a faint lift off black rather than a grey block.
const MINIMAL_PLACEHOLDER = { backgroundColor: "rgba(255,255,255,0.04)" } as const;

/**
 * CompactVideoCardSkeleton - matches CompactVideoCard layout
 */
const CompactVideoCardSkeletonComponent: React.FC = () => {
  const { isMinimal } = useAppTheme();
  const ph = isMinimal ? MINIMAL_PLACEHOLDER : undefined;
  return (
    // Minimal: a hairline-separated row, like CompactVideoCard in minimal.
    <View className={isMinimal ? undefined : "m-1 px-4 py-1"}>
      <View
        className={isMinimal
          ? "overflow-hidden flex-row items-start"
          : "bg-theme-neutrals-900 rounded-xl overflow-hidden flex-row items-start p-2 border border-theme-neutrals-700"}
        style={isMinimal ? { ...minimalRow, paddingHorizontal: MINIMAL_INSET, paddingVertical: 10 } : undefined}
      >
        {/* Thumbnail - 16:9 aspect ratio */}
        <View
          className="rounded-xl bg-theme-neutrals-800"
          style={[{ width: 150, aspectRatio: 16 / 9 }, ph]}
        />

        {/* Content */}
        <View className="flex-1 ml-3 py-1">
          {/* Title - 2 lines */}
          <View className="w-full h-4 bg-theme-neutrals-800 rounded" style={ph} />
          <View className="w-3/4 h-4 bg-theme-neutrals-800 rounded mt-1.5" style={ph} />

          {/* Creator row */}
          <View className="flex-row items-center mt-2">
            <View className="w-20 h-3 bg-theme-neutrals-800 rounded" style={ph} />
            <View className="w-4 h-4 rounded bg-theme-neutrals-800 ml-1.5" style={ph} />
          </View>

          {/* Stats row - views, likes, time */}
          <View className="flex-row items-center mt-2 gap-3">
            <View className="w-10 h-3 bg-theme-neutrals-800 rounded" style={ph} />
            <View className="w-10 h-3 bg-theme-neutrals-800 rounded" style={ph} />
            <View className="w-12 h-3 bg-theme-neutrals-800 rounded" style={ph} />
          </View>
        </View>
      </View>
    </View>
  );
};

const CompactVideoCardSkeleton = memo(CompactVideoCardSkeletonComponent);
export default CompactVideoCardSkeleton;
