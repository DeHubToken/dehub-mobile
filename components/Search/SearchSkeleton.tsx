import React from "react";
import { View } from "react-native";
import CompactVideoCardSkeleton from "../Home/CompactVideoCardSkeleton";

// Simple pulsing block skeleton reused pattern
const PulseBlock: React.FC<{
  height?: number;
  width?: string | number;
  className?: string;
}> = ({ height = 60, width = "100%", className }) => {
  return (
    <View
      className={`bg-theme-neutrals-800 rounded-md overflow-hidden ${className || ""}`}
      //   style={{ height, width }}
    />
  );
};

const SearchSkeleton: React.FC = () => {
  return (
    <View className="flex-1">
      <View className="flex-row border-b border-theme-neutrals-800">
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-1 p-3 items-center">
            <View className="h-3 w-16 bg-theme-neutrals-800 rounded-full" />
          </View>
        ))}
      </View>
      <View>
        {Array.from({ length: 6 }).map((_, i) => (
          <CompactVideoCardSkeleton key={`sv-${i}`} />
        ))}
      </View>
    </View>
  );
};

export default SearchSkeleton;
