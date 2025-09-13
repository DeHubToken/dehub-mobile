import React from "react";
import { View, Text, Pressable } from "react-native";

type Props = {
  position: number;
  duration: number;
  bufferedPosition: number;
  onLayoutWidth: (w: number) => void;
  onPressBar: (x: number) => void;
  panHandlers: any;
};

const formatTime = (ms: number) => {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const ProgressBar: React.FC<Props> = ({
  position,
  duration,
  bufferedPosition,
  onLayoutWidth,
  onPressBar,
  panHandlers,
}) => (
  <View className="px-1">
    <View className="mb-1 flex-row justify-between">
      <Text className="text-white text-[10px]">{formatTime(position)}</Text>
      <Text className="text-white text-[10px]">{formatTime(duration)}</Text>
    </View>
    <Pressable
      onLayout={(e) => onLayoutWidth(e.nativeEvent.layout.width)}
      onPress={(e) => onPressBar(e.nativeEvent.locationX)}
      className="h-6 justify-center"
    >
      <View className="h-1 w-full bg-white/20 rounded" {...panHandlers}>
        <View
          style={{
            width: `${duration ? (Math.min(bufferedPosition, duration) / duration) * 100 : 0}%`,
          }}
          className="h-full bg-white/35 rounded absolute left-0 top-0"
        />
        <View
          style={{ width: `${duration ? (position / duration) * 100 : 0}%` }}
          className="h-full rounded"
        >
          <View className="h-full w-full bg-theme-accent rounded" />
        </View>
      </View>
    </Pressable>
  </View>
);

export default ProgressBar;
