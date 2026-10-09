import React from "react";
import { View } from "react-native";
import { useShortsCardSize, GRID_GAP } from "./ShortsGridCard";
import { useAppTheme } from "../../context/ThemeContext";

interface ShortsGridSkeletonProps {
  /** Rows of two. Six cells covers a phone screen without overshooting it. */
  rows?: number;
}

/**
 * Stand-in for the shorts grid's first paint. It replaces a lone centred
 * spinner: a spinner says "nothing is here yet", a skeleton in the shape of the
 * grid says "this is what is arriving", and the tab stops reading as empty.
 */
const ShortsGridSkeleton: React.FC<ShortsGridSkeletonProps> = ({ rows = 3 }) => {
  const { isMinimal } = useAppTheme();
  const { width: CARD_WIDTH, height: CARD_HEIGHT } = useShortsCardSize();
  return (
    <View style={{ gap: GRID_GAP }}>
      {Array.from({ length: rows }).map((_, row) => (
        <View key={row} style={{ flexDirection: "row", gap: GRID_GAP }}>
          {Array.from({ length: 2 }).map((__, col) => (
            <View
              key={col}
              className="bg-theme-neutrals-800 rounded-xl"
              // Minimal: a faint lift off black rather than a grey block.
              style={isMinimal
                ? { width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: "rgba(255,255,255,0.04)" }
                : { width: CARD_WIDTH, height: CARD_HEIGHT }}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

export default ShortsGridSkeleton;
