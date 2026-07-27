import React from "react";
import { View } from "react-native";
import { CARD_HEIGHT, CARD_WIDTH, GRID_GAP } from "./ShortsGridCard";

interface ShortsGridSkeletonProps {
  /** Rows of two. Six cells covers a phone screen without overshooting it. */
  rows?: number;
}

/**
 * Stand-in for the shorts grid's first paint. It replaces a lone centred
 * spinner: a spinner says "nothing is here yet", a skeleton in the shape of the
 * grid says "this is what is arriving", and the tab stops reading as empty.
 */
const ShortsGridSkeleton: React.FC<ShortsGridSkeletonProps> = ({ rows = 3 }) => (
  <View style={{ gap: GRID_GAP }}>
    {Array.from({ length: rows }).map((_, row) => (
      <View key={row} style={{ flexDirection: "row", gap: GRID_GAP }}>
        {Array.from({ length: 2 }).map((__, col) => (
          <View
            key={col}
            className="bg-theme-neutrals-800 rounded-xl"
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
          />
        ))}
      </View>
    ))}
  </View>
);

export default ShortsGridSkeleton;
