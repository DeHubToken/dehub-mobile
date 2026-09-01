/**
 * The paused / ended / scheduled / offline / loading card over a stream.
 *
 * Same chrome as the rest of the viewer: one glass card, a lucide icon rather
 * than an emoji glyph, and no hue. The emoji headings (a TV set for "Stream
 * Ended", a calendar for "Upcoming") were the loudest thing on the screen and
 * appear nowhere else in the app.
 */
import React, { memo, useMemo } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { formatDistance } from "date-fns";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { ChromeFill, TEXT_SHADOW } from "../common/ViewerChrome";

interface LiveViewerStatusOverlayProps {
  status: "paused" | "ended" | "scheduled" | "offline" | "loading" | null;
  graceCountdown: number;
  scheduledForDate: Date | null;
  endedAtDate: Date | null;
  startedAtDate: Date | null;
}

const PulseDot: React.FC = memo(() => {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.pulseDot, style]} />;
});

/** One card shape for every state, so the four never drift apart. */
const StatusCard: React.FC<{
  icon?: IconName;
  title: string;
  children?: React.ReactNode;
}> = ({ icon, title, children }) => (
  <View style={styles.card}>
    <ChromeFill radius={16} />
    {icon ? (
      <Icon name={icon} size={22} color="rgba(255,255,255,0.8)" strokeWidth={1.8} />
    ) : null}
    <Text style={styles.title}>{title}</Text>
    {children}
  </View>
);

const LiveViewerStatusOverlay: React.FC<LiveViewerStatusOverlayProps> = ({
  status,
  graceCountdown,
  scheduledForDate,
  endedAtDate,
  startedAtDate,
}) => {
  const durationText = useMemo(() => {
    if (!endedAtDate || !startedAtDate) return null;
    const ms = Math.max(0, endedAtDate.getTime() - startedAtDate.getTime());
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0
      ? pad(h) + ":" + pad(m) + ":" + pad(s)
      : pad(m) + ":" + pad(s);
  }, [endedAtDate, startedAtDate]);

  if (!status) return null;

  if (status === "loading") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.centre, styles.loadingWash]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading stream...</Text>
      </View>
    );
  }

  if (status === "paused") {
    const mins = Math.floor(graceCountdown / 60);
    const secs = graceCountdown % 60;
    return (
      <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
        <View style={styles.card}>
          <ChromeFill radius={16} />
          <View style={styles.pausedHeading}>
            <PulseDot />
            <Text style={styles.title}>Stream Paused</Text>
          </View>
          <Text style={styles.body}>
            {"The streamer's connection dropped.\nWaiting for them to reconnect..."}
          </Text>
          {graceCountdown > 0 && (
            <View style={styles.centre}>
              <Text style={styles.countdown}>
                {mins + ":" + String(secs).padStart(2, "0")}
              </Text>
              <Text style={styles.caption}>Auto-ending if not resumed</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (status === "ended") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
        <StatusCard icon="Radio" title="Stream Ended">
          {durationText ? (
            <Text style={styles.body}>Duration {durationText}</Text>
          ) : null}
          {endedAtDate ? (
            <Text style={styles.caption}>
              {"Ended " +
                formatDistance(endedAtDate, new Date(), { addSuffix: true })}
            </Text>
          ) : null}
        </StatusCard>
      </View>
    );
  }

  if (status === "scheduled") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
        <StatusCard icon="CalendarClock" title="Upcoming Stream">
          {scheduledForDate ? (
            <Text style={styles.body}>
              {"Starts " +
                formatDistance(scheduledForDate, new Date(), {
                  addSuffix: true,
                })}
            </Text>
          ) : null}
        </StatusCard>
      </View>
    );
  }

  if (status === "offline") {
    return (
      <View style={[StyleSheet.absoluteFill, styles.centre]} pointerEvents="none">
        <StatusCard icon="WifiOff" title="Stream Offline">
          <Text style={styles.body}>
            {"The streamer hasn't started broadcasting yet"}
          </Text>
        </StatusCard>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  centre: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingWash: {
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  loadingText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginTop: 12,
  },
  /**
   * Radius 16 rather than the 12 on a chrome button: the card is an order of
   * magnitude larger, and a 12 on a box this size reads as a square.
   */
  card: {
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 22,
    marginHorizontal: 40,
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
  },
  pausedHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    ...TEXT_SHADOW,
  },
  body: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  caption: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    textAlign: "center",
  },
  countdown: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 8,
  },
});

export default memo(LiveViewerStatusOverlay);
