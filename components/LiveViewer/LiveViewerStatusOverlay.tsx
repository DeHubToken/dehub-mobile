import React, { memo, useMemo } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { formatDistance } from "date-fns";

interface LiveViewerStatusOverlayProps {
  status: "paused" | "ended" | "scheduled" | "offline" | "loading" | null;
  graceCountdown: number;
  scheduledForDate: Date | null;
  endedAtDate: Date | null;
  startedAtDate: Date | null;
}

const PulseDot: React.FC<{ color: string }> = memo(({ color }) => {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
          marginRight: 8,
        },
        style,
      ]}
    />
  );
});

const LiveViewerStatusOverlay: React.FC<LiveViewerStatusOverlayProps> = ({
  status,
  graceCountdown,
  scheduledForDate,
  endedAtDate,
  startedAtDate,
}) => {
  if (!status) return null;

  const durationText = useMemo(() => {
    if (!endedAtDate || !startedAtDate) return null;
    const ms = Math.max(0, endedAtDate.getTime() - startedAtDate.getTime());
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }, [endedAtDate, startedAtDate]);

  if (status === "loading") {
    return (
      <View className="absolute inset-0 items-center justify-center bg-black/80">
        <ActivityIndicator size="large" color="#fff" />
        <Text className="text-white/60 text-sm mt-3">Loading stream...</Text>
      </View>
    );
  }

  if (status === "paused") {
    const mins = Math.floor(graceCountdown / 60);
    const secs = graceCountdown % 60;
    return (
      <View
        className="absolute inset-0 items-center justify-center"
        pointerEvents="none"
      >
        <View className="bg-black/70 rounded-3xl px-8 py-6 items-center border border-white/10 mx-10">
          <View className="flex-row items-center mb-3">
            <PulseDot color="#eab308" />
            <Text className="text-yellow-400 text-base font-bold">
              Stream Paused
            </Text>
          </View>
          <Text className="text-white/60 text-xs text-center mb-4">
            {"The streamer's connection dropped.\nWaiting for them to reconnect..."}
          </Text>
          {graceCountdown > 0 && (
            <View className="items-center">
              <Text className="text-white font-bold text-4xl tracking-wider">
                {mins}:{String(secs).padStart(2, "0")}
              </Text>
              <Text className="text-white/40 text-[10px] mt-2">
                Auto-ending if not resumed
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (status === "ended") {
    return (
      <View className="absolute inset-0 items-center justify-center bg-black/80">
        <View className="items-center px-8">
          <Text className="text-3xl mb-3">📺</Text>
          <Text className="text-white text-lg font-bold mb-1">
            Stream Ended
          </Text>
          {durationText && (
            <Text className="text-white/50 text-xs">
              Duration: {durationText}
            </Text>
          )}
          {endedAtDate && (
            <Text className="text-white/40 text-[11px] mt-1">
              Ended{" "}
              {formatDistance(endedAtDate, new Date(), { addSuffix: true })}
            </Text>
          )}
        </View>
      </View>
    );
  }

  if (status === "scheduled") {
    return (
      <View className="absolute inset-0 items-center justify-center bg-black/80">
        <View className="items-center px-8">
          <Text className="text-3xl mb-3">📅</Text>
          <Text className="text-white text-lg font-bold mb-1">
            Upcoming Stream
          </Text>
          {scheduledForDate && (
            <Text className="text-white/50 text-sm">
              Starts{" "}
              {formatDistance(scheduledForDate, new Date(), {
                addSuffix: true,
              })}
            </Text>
          )}
        </View>
      </View>
    );
  }

  if (status === "offline") {
    return (
      <View className="absolute inset-0 items-center justify-center bg-black/80">
        <View className="items-center px-8">
          <Text className="text-3xl mb-3">📡</Text>
          <Text className="text-white text-lg font-bold mb-1">
            Stream Offline
          </Text>
          <Text className="text-white/40 text-xs text-center">
            {"The streamer hasn't started broadcasting yet"}
          </Text>
        </View>
      </View>
    );
  }

  return null;
};

export default memo(LiveViewerStatusOverlay);
